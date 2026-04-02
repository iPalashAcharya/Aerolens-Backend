const { enqueueWhatsAppResumeJob } = require('../queues/whatsappQueue');
const { getCandidate } = require('../services/whatsappCandidateService');
const { getRecipients, listActiveWhatsappGroups } = require('../services/groupService');

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

async function listGroups(_req, res) {
    try {
        const groups = await listActiveWhatsappGroups();
        return res.status(200).json({
            success: true,
            groups
        });
    } catch (error) {
        console.error('[WA] listGroups failed', { message: error.message });
        return res.status(500).json({
            success: false,
            message: 'Failed to load WhatsApp groups'
        });
    }
}

async function sendResume(req, res) {
    const { candidateId, groupId, customMessage, message } = req.body;

    if (!candidateId || !groupId) {
        return res.status(400).json({
            success: false,
            message: 'candidateId and groupId are required'
        });
    }

    const numCandidateId = Number(candidateId);
    const numGroupId = Number(groupId);

    try {
        // ------------------------------------------------------------------
        // Pre-flight 1: candidate must exist and have a resume uploaded
        // Fail fast here — no point burning a queue slot and 3 retries
        // on a condition that won't fix itself
        // ------------------------------------------------------------------
        const candidate = await getCandidate(numCandidateId);

        if (!candidate) {
            return res.status(404).json({
                success: false,
                message: `Candidate not found: candidateId=${numCandidateId}`
            });
        }

        if (!candidate.resumeKey) {
            return res.status(400).json({
                success: false,
                message: `Candidate ${numCandidateId} does not have a resume uploaded. Please upload a resume before sharing.`
            });
        }

        // ------------------------------------------------------------------
        // Pre-flight 2: group must exist and be active, with at least 1 member
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
        const normalizedCustomMessage = validateCustomMessage(
            customMessage !== undefined ? customMessage : message
        );

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
    listGroups,
    sendResume
};
