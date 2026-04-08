const db = require('../db');

class WhatsappQueueRepository {
    /**
     * @returns {Promise<number>} insertId (whatsapp_queue.id)
     */
    async insertPendingEnqueue(candidateId, groupId) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
                `INSERT INTO whatsapp_queue (candidate_id, group_id, status)
                 VALUES (?, ?, 'PENDING')`,
                [candidateId, groupId]
            );
            await connection.commit();
            return result.insertId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async updateToProcessing(queueId, retryCount) {
        await db.execute(
            `UPDATE whatsapp_queue
             SET status = 'PROCESSING', retry_count = ?
             WHERE id = ?`,
            [retryCount, queueId]
        );
    }

    async updateToDone(queueId, retryCount) {
        await db.execute(
            `UPDATE whatsapp_queue
             SET status = 'DONE', retry_count = ?, processed_at = NOW()
             WHERE id = ?`,
            [retryCount, queueId]
        );
    }

    async updateToFailed(queueId, retryCount) {
        await db.execute(
            `UPDATE whatsapp_queue
             SET status = 'FAILED', retry_count = ?, processed_at = NOW()
             WHERE id = ?`,
            [retryCount, queueId]
        );
    }

    async getById(queueId) {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT id, candidate_id AS candidateId, group_id AS groupId, status, retry_count AS retryCount,
                        created_at AS createdAt, processed_at AS processedAt
                 FROM whatsapp_queue WHERE id = ?`,
                [queueId]
            );
            return rows[0] || null;
        } finally {
            connection.release();
        }
    }
}

module.exports = WhatsappQueueRepository;
