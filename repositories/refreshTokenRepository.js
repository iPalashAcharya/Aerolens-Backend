const db = require('../db');
const AppError = require('../utils/appError');
const crypto = require('node:crypto');

class RefreshTokenRepository {

    // Generate SHA256 hash of a refresh token securely
    static hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // Generate a unique UUIDv4 for token family tracking
    static generateTokenFamily() {
        return crypto.randomUUID();
    }

    async create(tokenData) {
        const connection = await db.getConnection();
        console.log('Creating refresh token with data:', {
            id: tokenData.memberId,
            hash: tokenData.tokenHash,
            family: tokenData.tokenFamily,
            userAgent: tokenData.userAgent,
            ip: tokenData.ipAddress,
            expiry: tokenData.expiresAt
        });
        try {
            const [result] = await connection.execute(
                `INSERT INTO refresh_token (memberId, tokenHash, tokenFamily, userAgent, ipAddress, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    tokenData.memberId,
                    tokenData.tokenHash,
                    tokenData.tokenFamily,
                    tokenData.userAgent,
                    tokenData.ipAddress,
                    tokenData.expiresAt
                ]
            );

            return result.insertId;
        } catch (error) {
            throw new AppError('Database error while creating refresh token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async findByMemberAndHash(memberId, tokenHash) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT id, memberId, tokenHash, tokenFamily, userAgent, ipAddress, issuedAt, expiresAt, isRevoked
         FROM refresh_token
         WHERE memberId = ? AND tokenHash = ? AND isRevoked = FALSE`,
                [memberId, tokenHash]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Database error while finding refresh token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    async findByHash(tokenHash) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT id, memberId, tokenHash, tokenFamily, isRevoked, expiresAt
         FROM refresh_token
         WHERE tokenHash = ?`,
                [tokenHash]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Database error while finding refresh token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Find any non-revoked tokens by the same token family (used for reuse detection)
    async findByTokenFamily(memberId, tokenFamily) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT id, isRevoked, expiresAt
         FROM refresh_token
         WHERE memberId = ? AND tokenFamily = ? AND isRevoked = FALSE
         LIMIT 1`,
                [memberId, tokenFamily]
            );
            return rows.length > 0;
        } catch (error) {
            throw new AppError('Database error while finding token family', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Revoke a single token
    async revokeToken(tokenId) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE refresh_token SET isRevoked = TRUE WHERE id = ?`,
                [tokenId]
            );
        } catch (error) {
            throw new AppError('Database error while revoking token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Revoke all tokens belonging to the same token family (token reuse protection)
    async revokeTokenFamily(memberId, tokenFamily) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE refresh_token 
         SET isRevoked = TRUE 
         WHERE memberId = ? AND tokenFamily = ? AND isRevoked = FALSE`,
                [memberId, tokenFamily]
            );
        } catch (error) {
            throw new AppError('Database error while revoking token family', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Revoke all tokens for a given member
    async revokeAllTokensByMember(memberId) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE refresh_token SET isRevoked = TRUE WHERE memberId = ?`,
                [memberId]
            );
        } catch (error) {
            throw new AppError('Database error while revoking all tokens', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Retrieve all currently active (non-expired, non-revoked) sessions
    async findActiveByMember(memberId) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT id, userAgent, ipAddress, issuedAt, expiresAt, tokenFamily
         FROM refresh_token
         WHERE memberId = ? AND isRevoked = FALSE AND expiresAt > NOW()
         ORDER BY issuedAt DESC`,
                [memberId]
            );
            return rows;
        } catch (error) {
            throw new AppError('Database error while finding active tokens', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Purge expired or revoked tokens periodically
    async cleanupExpiredTokens() {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `DELETE FROM refresh_token WHERE expiresAt < NOW() OR isRevoked = TRUE`
            );
        } catch (error) {
            throw new AppError('Database error while cleaning up tokens', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }
}

module.exports = new RefreshTokenRepository();