const { enqueueWhatsAppResumeJob } = require('../queues/whatsappQueue');

function validateCustomMessage(customMessage) {
    if (customMessage === undefined || customMessage === null) {
        return undefined;
    }

    if (typeof customMessage !== 'string') {
        throw new Error('customMessage must be plain text');
    }

    const trimmed = customMessage.trim();

    if (trimmed.length > 1024) {
        throw new Error('customMessage max length is 1024 characters');
    }

    if (/<[^>]*>/.test(trimmed)) {
        throw new Error('customMessage must be plain text only');
    }

    return trimmed;
}

async function sendResume(req, res) {
    const { candidateId, groupId, customMessage } = req.body;

    if (!candidateId || !groupId) {
        return res.status(400).json({
            success: false,
            message: 'candidateId and groupId are required'
        });
    }

    try {
        const normalizedCustomMessage = validateCustomMessage(customMessage);

        await enqueueWhatsAppResumeJob({
            candidateId: Number(candidateId),
            groupId: Number(groupId),
            customMessage: normalizedCustomMessage
        });

        return res.status(200).json({
            success: true,
            queued: true
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

module.exports = {
    sendResume
};
