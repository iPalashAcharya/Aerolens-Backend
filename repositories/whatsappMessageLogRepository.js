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
