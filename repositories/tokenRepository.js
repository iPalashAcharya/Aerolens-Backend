const db = require('../db');
const AppError = require('../utils/appError');

class TokenRepository {
    // Store active token JTI for tracking and revocation
    async storeToken(tokenData) {
        const connection = await db.getConnection();
        try {
            const [result] = await connection.execute(
                `INSERT INTO active_token (memberId, jti, tokenFamily, userAgent, ipAddress, expiresAt)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    tokenData.memberId,
                    tokenData.jti,
                    tokenData.tokenFamily,
                    tokenData.userAgent,
                    tokenData.ipAddress,
                    tokenData.expiresAt
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new AppError('Database error while storing token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Check if a token JTI is revoked
    async isTokenRevoked(jti) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT isRevoked FROM active_token WHERE jti = ?`,
                [jti]
            );
            if (rows.length === 0) return false; // Token not tracked, assume valid
            return rows[0].isRevoked === 1;
        } catch (error) {
            throw new AppError('Database error while checking token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Revoke a specific token by JTI
    async revokeToken(jti) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE active_token SET isRevoked = TRUE WHERE jti = ?`,
                [jti]
            );
        } catch (error) {
            throw new AppError('Database error while revoking token', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Revoke all tokens in a token family (for security incidents)
    async revokeTokenFamily(memberId, tokenFamily) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE active_token 
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

    // Revoke all tokens for a member (logout from all devices)
    async revokeAllTokensByMember(memberId) {
        const connection = await db.getConnection();
        try {
            await connection.execute(
                `UPDATE active_token SET isRevoked = TRUE WHERE memberId = ?`,
                [memberId]
            );
        } catch (error) {
            throw new AppError('Database error while revoking all tokens', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Get active sessions for a member
    async findActiveByMember(memberId) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT id, jti, userAgent, ipAddress, createdAt, expiresAt, tokenFamily
                 FROM active_token
                 WHERE memberId = ? AND isRevoked = FALSE AND expiresAt > NOW()
                 ORDER BY createdAt DESC`,
                [memberId]
            );
            return rows;
        } catch (error) {
            throw new AppError('Database error while finding active tokens', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }

    // Cleanup expired tokens (run periodically)
    async cleanupExpiredTokens() {
        const connection = await db.getConnection();
        try {
            const [result] = await connection.execute(
                `DELETE FROM active_token
             WHERE (expiresAt < DATE_SUB(NOW(), INTERVAL 7 DAY))
             OR isRevoked = TRUE`
            );
            return result.affectedRows;
        } catch (error) {
            throw new AppError('Database error while cleaning up tokens', 500, 'DB_ERROR', error.message);
        } finally {
            connection.release();
        }
    }
}

module.exports = new TokenRepository();