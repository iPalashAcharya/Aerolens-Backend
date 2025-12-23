const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const jwtConfig = require('../config/jwt');
const MemberRepository = require('../repositories/memberRepository');
const tokenRepository = require('../repositories/tokenRepository');
const AppError = require('../utils/appError');
const db = require('../db');

const memberRepository = new MemberRepository();

class AuthService {
    async hashPassword(password) {
        return await bcrypt.hash(password, jwtConfig.bcryptRounds);
    }

    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    generateTokenFamily() {
        return crypto.randomUUID();
    }

    generateJTI() {
        return crypto.randomUUID();
    }

    calculateExpiresAt(expiresIn) {
        const expiryMatch = expiresIn.match(/(\d+)([smhd])/);
        const expiresAt = new Date();

        if (expiryMatch) {
            const value = parseInt(expiryMatch[1]);
            const unit = expiryMatch[2];

            switch (unit) {
                case 's': expiresAt.setSeconds(expiresAt.getSeconds() + value); break;
                case 'm': expiresAt.setMinutes(expiresAt.getMinutes() + value); break;
                case 'h': expiresAt.setHours(expiresAt.getHours() + value); break;
                case 'd': expiresAt.setDate(expiresAt.getDate() + value); break;
            }
        }

        return expiresAt;
    }

    generateToken(memberId, email, tokenFamily, jti) {
        const payload = {
            sub: memberId,
            memberId,
            email,
            jti,
            family: tokenFamily,
            type: 'access',
            iat: Math.floor(Date.now() / 1000)
        };

        return jwt.sign(payload, jwtConfig.token.secret, {
            expiresIn: jwtConfig.token.expiresIn,
            algorithm: jwtConfig.token.algorithm,
            issuer: jwtConfig.token.issuer,
            audience: jwtConfig.token.audience
        });
    }

    async register(memberData) {
        const client = await db.getConnection();
        try {
            await client.beginTransaction();
            // Check for existing email
            const existingMember = await memberRepository.findByEmail(memberData.email, client);
            if (existingMember) {
                throw new AppError('Email already registered, Please Login', 409, 'EMAIL_EXISTS');
            }

            // Hash password
            const hashedPassword = await this.hashPassword(memberData.password);

            // Create member
            const newMember = await memberRepository.create({
                ...memberData,
                password: hashedPassword,
                client
            });

            // Remove password from response
            delete newMember.password;
            await client.commit();
            return newMember;
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async login(email, password, userAgent, ipAddress) {
        // Find member
        const member = await memberRepository.findByEmail(email);
        if (!member) {
            throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }

        // Check if account is active
        if (!member.isActive) {
            throw new AppError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
        }

        // Verify password
        const isPasswordValid = await this.comparePassword(password, member.password);
        if (!isPasswordValid) {
            throw new AppError('Invalid credentials, Wrong Password Entered', 401, 'INVALID_CREDENTIALS');
        }

        // Generate token
        const tokenFamily = this.generateTokenFamily();
        const jti = this.generateJTI();
        const token = this.generateToken(member.memberId, member.email, tokenFamily, jti);
        const expiresAt = this.calculateExpiresAt(jwtConfig.token.expiresIn);

        // Store token for tracking and revocation
        await tokenRepository.storeToken({
            memberId: member.memberId,
            jti,
            tokenFamily,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        // Update last login
        await memberRepository.updateLastLogin(member.memberId);

        // Remove password from response
        delete member.password;

        return {
            member: {
                memberId: member.memberId,
                memberName: member.memberName,
                email: member.email,
                designation: member.designation,
                isRecruiter: member.isRecruiter
            },
            token,
            expiresIn: jwtConfig.token.expiresIn
        };
    }

    async changePassword(memberId, currentPassword, newPassword) {
        const member = await memberRepository.findById(memberId);
        const isValid = await this.comparePassword(currentPassword, member.password);
        if (!isValid) {
            throw new AppError('Current password is incorrect', 401, 'INVALID_CURRENT_PASSWORD');
        }
        const hashedNewPassword = await this.hashPassword(newPassword);
        await memberRepository.updatePassword(memberId, hashedNewPassword);
        // Revoke all existing tokens
        await tokenRepository.revokeAllTokensByMember(memberId);
        return { success: true };
    }

    async refreshToken(currentToken, userAgent, ipAddress) {
        let decoded;

        try {
            // ✅ Allow expired tokens to be verified (for refresh grace period)
            decoded = jwt.verify(currentToken, jwtConfig.token.secret, {
                algorithms: [jwtConfig.token.algorithm],
                issuer: jwtConfig.token.issuer,
                audience: jwtConfig.token.audience,
                ignoreExpiration: true // KEY: Allow expired tokens
            });
        } catch (error) {
            throw new AppError('Invalid token structure or signature', 401, 'INVALID_TOKEN');
        }

        const { memberId, jti, family } = decoded;

        // Security check: Token too old to refresh (beyond grace period)
        const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
        if (tokenAge > jwtConfig.token.refreshGracePeriod) {
            throw new AppError('Token is too old to refresh. Please login again.', 401, 'TOKEN_TOO_OLD');
        }

        // Check if token is revoked
        const isRevoked = await tokenRepository.isTokenRevoked(jti);
        if (isRevoked) {
            // Security: If revoked token is used, revoke entire family (potential compromise)
            await tokenRepository.revokeTokenFamily(memberId, family);
            throw new AppError('Token has been revoked. Please login again.', 401, 'TOKEN_REVOKED');
        }

        // Verify member still exists and is active
        const member = await memberRepository.findById(memberId);
        if (!member || !member.isActive) {
            throw new AppError('Invalid member or inactive account', 401, 'INVALID_MEMBER');
        }

        // Revoke old token
        await tokenRepository.revokeToken(jti);

        // Generate new token (same family for tracking)
        const newJti = this.generateJTI();
        const newToken = this.generateToken(member.memberId, member.email, family, newJti);
        const expiresAt = this.calculateExpiresAt(jwtConfig.token.expiresIn);

        // Store new token
        await tokenRepository.storeToken({
            memberId: member.memberId,
            jti: newJti,
            tokenFamily: family,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        return {
            token: newToken,
            expiresIn: jwtConfig.token.expiresIn
        };
    }

    async logout(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.jti) {
                await tokenRepository.revokeToken(decoded.jti);
            }
            return { success: true };
        } catch (error) {
            // Silent fail - logout should always succeed from user perspective
            return { success: true };
        }
    }

    async logoutAllDevices(memberId) {
        await tokenRepository.revokeAllTokensByMember(memberId);
        return { success: true };
    }

    async getActiveSessions(memberId) {
        return await tokenRepository.findActiveByMember(memberId);
    }

    async verifyToken(token) {
        try {
            // Verify JWT signature and expiration
            const decoded = jwt.verify(token, jwtConfig.token.secret, {
                algorithms: [jwtConfig.token.algorithm],
                issuer: jwtConfig.token.issuer,
                audience: jwtConfig.token.audience
            });

            // Check if token is revoked in database
            const isRevoked = await tokenRepository.isTokenRevoked(decoded.jti);
            if (isRevoked) {
                throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
            }

            return decoded;
        } catch (error) {
            if (error instanceof AppError) throw error;

            if (error.name === 'TokenExpiredError') {
                throw new AppError('Token expired', 401, 'TOKEN_EXPIRED');
            }

            throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
        }
    }
}

module.exports = new AuthService();