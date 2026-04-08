const db = require('../db');

class WhatsappMessageLogRepository {
    async updateStatusByMetaMessageId(mappedStatus, metaMessageId, setDeliveredAt) {
        if (setDeliveredAt) {
            await db.execute(
                `UPDATE whatsapp_message_log
                 SET message_status = ?, delivered_at = NOW()
                 WHERE meta_message_id = ?`,
                [mappedStatus, metaMessageId]
            );
        } else {
            await db.execute(
                `UPDATE whatsapp_message_log
                 SET message_status = ?
                 WHERE meta_message_id = ?`,
                [mappedStatus, metaMessageId]
            );
        }
    }

    /**
     * Rows for one queue job: same candidate + group, and sent_at in [queue.created_at, queue.processed_at]
     * (processed_at null => only lower bound — job still running or not finished writing).
     */
    async findForQueueJob({ candidateId, groupId, createdAt, processedAt }) {
        const connection = await db.getConnection();
        const select = `
            SELECT id AS messageLogId,
                   candidate_id AS candidateId,
                   group_id AS groupId,
                   member_id AS memberId,
                   phone_number AS phoneNumber,
                   message_status AS messageStatus,
                   meta_message_id AS metaMessageId,
                   error_message AS errorMessage,
                   sent_at AS sentAt,
                   delivered_at AS deliveredAt
            FROM whatsapp_message_log
            WHERE candidate_id = ? AND group_id = ?
              AND sent_at >= ?
        `;
        try {
            if (processedAt == null) {
                const [rows] = await connection.execute(
                    `${select} ORDER BY id ASC`,
                    [candidateId, groupId, createdAt]
                );
                return rows;
            }
            const [rows] = await connection.execute(
                `${select} AND sent_at <= ? ORDER BY id ASC`,
                [candidateId, groupId, createdAt, processedAt]
            );
            return rows;
        } finally {
            connection.release();
        }
    }

    /**
     * @param {Array<{ candidateId: number, groupId: number, memberId: *, phone: *, messageStatus: string, metaMessageId: *, errorMessage: * }>} rows
     */
    async insertLogRows(rows) {
        if (!rows.length) {
            return;
        }

        const insertSql = `
            INSERT INTO whatsapp_message_log
                (candidate_id, group_id, member_id, phone_number, message_status, meta_message_id, error_message, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        for (const row of rows) {
            await db.execute(insertSql, [
                row.candidateId,
                row.groupId,
                row.memberId ?? null,
                row.phone,
                row.messageStatus,
                row.metaMessageId ?? null,
                row.errorMessage ?? null
            ]);
        }
    }
}

module.exports = WhatsappMessageLogRepository;
