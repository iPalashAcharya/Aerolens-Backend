const AppError = require('../utils/appError');

class ResumeShareRepository {
    constructor(db) {
        this.db = db;
    }

    async insert(row, client) {
        const conn = client;
        try {
            const sql = `
                INSERT INTO resume_share_tokens
                    (id, token, candidate_id, created_by_user_id, expires_at, is_revoked)
                VALUES (?, ?, ?, ?, ?, FALSE)
            `;
            await conn.execute(sql, [
                row.id,
                row.token,
                row.candidateId,
                row.createdByUserId,
                row.expiresAt
            ]);
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async findByToken(token, client = null) {
        const conn = client;
        try {
            const [rows] = await conn.execute(
                `SELECT id, token, candidate_id AS candidateId, created_by_user_id AS createdByUserId,
                        created_at AS createdAt, expires_at AS expiresAt, is_revoked AS isRevoked
                 FROM resume_share_tokens WHERE token = ? LIMIT 1`,
                [token]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async revokeByToken(token, client = null) {
        const conn = client;
        try {
            const [result] = await conn.execute(
                `UPDATE resume_share_tokens SET is_revoked = TRUE WHERE token = ? AND is_revoked = FALSE`,
                [token]
            );
            return result.affectedRows || 0;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    _handleDatabaseError(error) {
        console.error('[ResumeShareRepository]', error);
        throw new AppError('Database error while processing resume share', 500, 'RESUME_SHARE_DB_ERROR');
    }
}

module.exports = ResumeShareRepository;
