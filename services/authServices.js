// authServices.js - FIXED VERSION
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const jwtConfig = require('../config/jwt');
const memberRepository = require('../repositories/memberRepository');
const tokenRepository = require('../repositories/tokenRepository');
const AppError = require('../utils/appError');

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
            issuer: 'aerolens-hr-management-system',
            audience: 'hr-app-users'
        });
    }

    async register(memberData) {
        const existingMember = await memberRepository.findByEmail(memberData.email);
        if (existingMember) {
            throw new AppError('Email already registered, Please Login', 409, 'EMAIL_EXISTS');
        }

        const hashedPassword = await this.hashPassword(memberData.password);

        const newMember = await memberRepository.create({
            ...memberData,
            password: hashedPassword
        });

        delete newMember.password;
        return newMember;
    }

    async login(email, password, userAgent, ipAddress) {
        const member = await memberRepository.findByEmail(email);
        if (!member) {
            throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }

        if (!member.isActive) {
            throw new AppError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
        }

        const isPasswordValid = await this.comparePassword(password, member.password);
        if (!isPasswordValid) {
            throw new AppError('Invalid credentials, Wrong Password Entered', 401, 'INVALID_CREDENTIALS');
        }

        const tokenFamily = this.generateTokenFamily();
        const jti = this.generateJTI();
        const token = this.generateToken(member.memberId, member.email, tokenFamily, jti);

        // Calculate expiration based on JWT config
        const expiryMatch = jwtConfig.token.expiresIn.match(/(\d+)([smhd])/);
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

        // Store token for tracking and potential revocation
        await tokenRepository.storeToken({
            memberId: member.memberId,
            jti,
            tokenFamily,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        await memberRepository.updateLastLogin(member.memberId);

        delete member.password;

        return {
            member,
            token,
            tokenFamily,
            expiresIn: jwtConfig.token.expiresIn
        };
    }

    // FIXED: Refresh/renew token - now accepts expired tokens
    async refreshToken(currentToken, userAgent, ipAddress) {
        let decoded;

        try {
            // ✅ KEY FIX: Use ignoreExpiration: true to allow expired tokens
            decoded = jwt.verify(currentToken, jwtConfig.token.secret, {
                algorithms: [jwtConfig.token.algorithm],
                issuer: 'aerolens-hr-management-system',
                audience: 'hr-app-users',
                ignoreExpiration: true // ✅ This allows expired tokens to be verified
            });
        } catch (error) {
            // Only throw error for invalid tokens, not expired ones
            throw new AppError('Invalid token structure or signature', 401, 'INVALID_TOKEN');
        }

        const { memberId, jti, family } = decoded;

        // ✅ Additional security: Check if token is TOO old (e.g., more than 7 days expired)
        // This prevents tokens from being refreshed indefinitely
        const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
        const maxRefreshAge = 7 * 24 * 60 * 60; // 7 days in seconds
        if (tokenAge > maxRefreshAge) {
            throw new AppError('Token is too old to refresh. Please login again.', 401, 'TOKEN_TOO_OLD');
        }

        // Check if token is revoked
        const isRevoked = await tokenRepository.isTokenRevoked(jti);
        if (isRevoked) {
            // ✅ Security: If a revoked token is used, revoke entire family
            await tokenRepository.revokeTokenFamily(memberId, family);
            throw new AppError('Token has been revoked. Please login again.', 401, 'TOKEN_REVOKED');
        }

        const member = await memberRepository.findById(memberId);
        if (!member || !member.isActive) {
            throw new AppError('Invalid member or inactive account', 401, 'INVALID_MEMBER');
        }

        // Revoke old token
        await tokenRepository.revokeToken(jti);

        // Generate new token with same family (for tracking)
        const newJti = this.generateJTI();
        const newToken = this.generateToken(member.memberId, member.email, family, newJti);

        const expiryMatch = jwtConfig.token.expiresIn.match(/(\d+)([smhd])/);
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

        await tokenRepository.storeToken({
            memberId: member.memberId,
            jti: newJti,
            tokenFamily: family,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        delete member.password;

        return {
            member,
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
            const decoded = jwt.verify(token, jwtConfig.token.secret, {
                algorithms: [jwtConfig.token.algorithm],
                issuer: 'aerolens-hr-management-system',
                audience: 'hr-app-users'
            });

            // Check if token is revoked
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