const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const jwtConfig = require('../config/jwt');
const memberRepository = require('../repositories/memberRepository');
const refreshTokenRepository = require('../repositories/refreshTokenRepository');
const AppError = require('../utils/appError');

class AuthService {
    async hashPassword(password) {
        return await bcrypt.hash(password, jwtConfig.bcryptRounds);
    }

    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    generateAccessToken(memberId, email, tokenFamily) {
        const payload = {
            memberId,
            email,
            tokenFamily,
            type: 'access'
        };

        return jwt.sign(payload, jwtConfig.access.secret, {
            expiresIn: jwtConfig.access.expiresIn,
            algorithm: jwtConfig.access.algorithm,
            issuer: 'aerolens-hr-management-system',
            audience: 'hr-app-users'
        });
    }

    generateRefreshToken(memberId, tokenFamily) {
        const payload = {
            memberId,
            tokenFamily,
            type: 'refresh'
        };

        return jwt.sign(payload, jwtConfig.refresh.secret, {
            expiresIn: jwtConfig.refresh.expiresIn,
            algorithm: jwtConfig.refresh.algorithm,
            issuer: 'hr-management-system',
            audience: 'hr-app-users'
        });
    }

    generateTokenFamily() {
        return crypto.randomUUID();
    }

    hashRefreshToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
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

        const accessToken = this.generateAccessToken(member.memberId, member.email, tokenFamily);
        const refreshToken = this.generateRefreshToken(member.memberId, tokenFamily);

        const tokenHash = this.hashRefreshToken(refreshToken);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await refreshTokenRepository.create({
            memberId: member.memberId,
            tokenHash,
            tokenFamily,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        await memberRepository.updateLastLogin(member.memberId);

        delete member.password;

        return {
            member,
            accessToken,
            refreshToken,
            tokenFamily
        };
    }

    async refreshAccessToken(refreshToken, userAgent, ipAddress) {
        let decoded;

        try {
            decoded = jwt.verify(refreshToken, jwtConfig.refresh.secret, {
                algorithms: [jwtConfig.refresh.algorithm],
                issuer: 'hr-management-system',
                audience: 'hr-app-users'
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AppError('Refresh token expired', 401, 'TOKEN_EXPIRED');
            }
            throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
        }

        const { memberId, tokenFamily } = decoded;

        const tokenHash = this.hashRefreshToken(refreshToken);

        const storedToken = await refreshTokenRepository.findByMemberAndHash(memberId, tokenHash);

        if (!storedToken) {
            const tokenFamilyExists = await refreshTokenRepository.findByTokenFamily(memberId, tokenFamily);

            if (tokenFamilyExists) {
                await refreshTokenRepository.revokeTokenFamily(memberId, tokenFamily);
                throw new AppError(
                    'Token reuse detected. All tokens have been revoked. Please login again.',
                    401,
                    'TOKEN_REUSE_DETECTED'
                );
            }

            throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
        }

        if (storedToken.isRevoked) {
            throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
        }

        if (new Date() > new Date(storedToken.expiresAt)) {
            throw new AppError('Refresh token expired', 401, 'TOKEN_EXPIRED');
        }

        const member = await memberRepository.findById(memberId);
        if (!member || !member.isActive) {
            throw new AppError('Invalid member or inactive account', 401, 'INVALID_MEMBER');
        }

        await refreshTokenRepository.revokeToken(storedToken.id);

        const newAccessToken = this.generateAccessToken(member.memberId, member.email, tokenFamily);
        const newRefreshToken = this.generateRefreshToken(member.memberId, tokenFamily);

        const newTokenHash = this.hashRefreshToken(newRefreshToken);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await refreshTokenRepository.create({
            memberId: member.memberId,
            tokenHash: newTokenHash,
            tokenFamily,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        delete member.password;

        return {
            member,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        };
    }

    async logout(refreshToken) {
        try {
            const tokenHash = this.hashRefreshToken(refreshToken);

            const token = await refreshTokenRepository.findByHash(tokenHash);

            if (token) {
                await refreshTokenRepository.revokeToken(token.id);
            }

            return { success: true };
        } catch (error) {
            return { success: true };
        }
    }

    async logoutAllDevices(memberId) {
        await refreshTokenRepository.revokeAllTokensByMember(memberId);
        return { success: true };
    }

    async getActiveSessions(memberId) {
        return await refreshTokenRepository.findActiveByMember(memberId);
    }

    verifyAccessToken(token) {
        try {
            return jwt.verify(token, jwtConfig.access.secret, {
                algorithms: [jwtConfig.access.algorithm],
                issuer: 'hr-management-system',
                audience: 'hr-app-users'
            });
        } catch (error) {
            throw new AppError('Invalid access token', 401, 'INVALID_TOKEN');
        }
    }
}

module.exports = new AuthService();