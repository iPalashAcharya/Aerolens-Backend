const db = require('../db');

async function logMessages(candidateId, groupId, results) {
    if (!results.length) {
        return;
    }

    const insertSql = `
        INSERT INTO whatsapp_message_log
            (candidate_id, group_id, member_id, phone_number, message_status, meta_message_id, error_message, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    for (const result of results) {
        await db.execute(insertSql, [
            candidateId,
            groupId,
            result.memberId || null,
            result.phone,
            result.status === 'SUCCESS' ? 'SENT' : 'FAILED',
            result.metaMessageId || null,
            result.errorMessage || null
        ]);
    }
}

module.exports = {
    logMessages
};
