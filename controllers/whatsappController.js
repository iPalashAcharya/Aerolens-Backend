const { enqueueWhatsAppResumeJob } = require('../queues/whatsappQueue');
const { getRecipients } = require('../services/groupService');

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

    if (!groupId) {
        return res.status(400).json({
            success: false,
            message: 'groupId is required'
        });
    }

    const numCandidateId = candidateId ? Number(candidateId) : null;
    const numGroupId = Number(groupId);

    try {
        // ------------------------------------------------------------------
        // Pre-flight: group must exist and be active, with at least 1 member
        // ------------------------------------------------------------------
        let recipients;
        try {
            recipients = await getRecipients(numGroupId);
        } catch (groupErr) {
            return res.status(400).json({
                success: false,
                message: groupErr.message
            });
        }

        if (!recipients.length) {
            return res.status(400).json({
                success: false,
                message: `Group ${numGroupId} has no active members to send to`
            });
        }

        // ------------------------------------------------------------------
        // Validate customMessage
        // ------------------------------------------------------------------
        const normalizedCustomMessage = validateCustomMessage(customMessage);

        // ------------------------------------------------------------------
        // All checks passed — enqueue
        // ------------------------------------------------------------------
        await enqueueWhatsAppResumeJob({
            candidateId: numCandidateId,
            groupId:     numGroupId,
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
