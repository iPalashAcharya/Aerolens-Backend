const WhatsappMessageLogRepository = require('../repositories/whatsappMessageLogRepository');

const whatsappMessageLogRepository = new WhatsappMessageLogRepository();

async function logMessages(candidateId, groupId, results) {
    if (!results.length) {
        return;
    }

    const rows = results.map((result) => ({
        candidateId,
        groupId,
        memberId: result.memberId || null,
        phone: result.phone,
        messageStatus: result.status === 'SUCCESS' ? 'SENT' : 'FAILED',
        metaMessageId: result.metaMessageId || null,
        errorMessage: result.errorMessage || null
    }));

    await whatsappMessageLogRepository.insertLogRows(rows);
}

module.exports = {
    logMessages
};
