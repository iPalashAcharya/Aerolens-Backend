const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const jwtConfig = require('../config/jwt');
const memberRepository = require('../repositories/memberRepository');
const refreshTokenRepository = require('../repositories/refreshTokenRepository');
const AppError = require('../utils/appError');

class AuthService {

    /**
     * Hash password using bcrypt
     */
    async hashPassword(password) {
        return await bcrypt.hash(password, jwtConfig.bcryptRounds);
    }

    /**
     * Compare password with hash
     */
    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    /**
     * Generate access token
     */
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
            issuer: 'hr-management-system',
            audience: 'hr-app-users'
        });
    }

    /**
     * Generate refresh token
     */
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

    /**
     * Generate token family ID for refresh token rotation
     */
    generateTokenFamily() {
        return crypto.randomUUID();
    }

    /**
     * Hash refresh token for storage
     */
    hashRefreshToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Register new member
     */
    async register(memberData) {
        // Check if email already exists
        const existingMember = await memberRepository.findByEmail(memberData.email);
        if (existingMember) {
            throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
        }

        // Hash password
        const hashedPassword = await this.hashPassword(memberData.password);

        // Create member
        const newMember = await memberRepository.create({
            ...memberData,
            password: hashedPassword
        });

        // Remove password from response
        delete newMember.password;

        return newMember;
    }

    /**
     * Login member and generate tokens
     */
    async login(email, password, userAgent, ipAddress) {
        // Find member by email
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
            throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        }

        // Generate token family for refresh token rotation
        const tokenFamily = this.generateTokenFamily();

        // Generate tokens
        const accessToken = this.generateAccessToken(member.memberId, member.email, tokenFamily);
        const refreshToken = this.generateRefreshToken(member.memberId, tokenFamily);

        // Hash refresh token for storage
        const tokenHash = this.hashRefreshToken(refreshToken);

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        // Store refresh token in database
        await refreshTokenRepository.create({
            memberId: member.memberId,
            tokenHash,
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
            member,
            accessToken,
            refreshToken,
            tokenFamily
        };
    }

    /**
     * Refresh access token with rotation and reuse detection
     */
    async refreshAccessToken(refreshToken, userAgent, ipAddress) {
        let decoded;

        try {
            // Verify refresh token
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

        // Hash the incoming refresh token
        const tokenHash = this.hashRefreshToken(refreshToken);

        // Find the refresh token in database
        const storedToken = await refreshTokenRepository.findByMemberAndHash(memberId, tokenHash);

        // REUSE DETECTION: If token not found, check if token family exists
        if (!storedToken) {
            const tokenFamilyExists = await refreshTokenRepository.findByTokenFamily(memberId, tokenFamily);

            if (tokenFamilyExists) {
                // Token reuse detected! Revoke all tokens for this family
                await refreshTokenRepository.revokeTokenFamily(memberId, tokenFamily);
                throw new AppError(
                    'Token reuse detected. All tokens have been revoked. Please login again.',
                    401,
                    'TOKEN_REUSE_DETECTED'
                );
            }

            // Token family doesn't exist either - invalid token
            throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
        }

        // Check if token is revoked
        if (storedToken.isRevoked) {
            throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
        }

        // Check if token is expired
        if (new Date() > new Date(storedToken.expiresAt)) {
            throw new AppError('Refresh token expired', 401, 'TOKEN_EXPIRED');
        }

        // Find member
        const member = await memberRepository.findById(memberId);
        if (!member || !member.isActive) {
            throw new AppError('Invalid member or inactive account', 401, 'INVALID_MEMBER');
        }

        // REFRESH TOKEN ROTATION: Revoke old refresh token
        await refreshTokenRepository.revokeToken(storedToken.id);

        // Generate new tokens with SAME token family
        const newAccessToken = this.generateAccessToken(member.memberId, member.email, tokenFamily);
        const newRefreshToken = this.generateRefreshToken(member.memberId, tokenFamily);

        // Hash new refresh token
        const newTokenHash = this.hashRefreshToken(newRefreshToken);

        // Calculate expiration
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Store new refresh token
        await refreshTokenRepository.create({
            memberId: member.memberId,
            tokenHash: newTokenHash,
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt
        });

        // Remove password from response
        delete member.password;

        return {
            member,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        };
    }

    /**
     * Logout member and revoke refresh token
     */
    async logout(refreshToken) {
        try {
            // Hash the refresh token
            const tokenHash = this.hashRefreshToken(refreshToken);

            // Find and revoke the token
            const token = await refreshTokenRepository.findByHash(tokenHash);

            if (token) {
                await refreshTokenRepository.revokeToken(token.id);
            }

            return { success: true };
        } catch (error) {
            // Even if token is invalid, consider logout successful
            return { success: true };
        }
    }

    /**
     * Logout from all devices
     */
    async logoutAllDevices(memberId) {
        await refreshTokenRepository.revokeAllTokensByMember(memberId);
        return { success: true };
    }

    /**
     * Get active sessions for a member
     */
    async getActiveSessions(memberId) {
        return await refreshTokenRepository.findActiveByMember(memberId);
    }

    /**
     * Verify JWT token (for manual verification if needed)
     */
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