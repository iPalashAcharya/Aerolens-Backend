const ApiResponse = require('../config/apiResponse');
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
        const r = ApiResponse.ok({ groups });
        return res.status(r.statusCode).json(r.body);
    } catch (error) {
        console.error('[WA] listGroups failed', { message: error.message });
        const r = ApiResponse.serverError('Failed to load WhatsApp groups');
        return res.status(r.statusCode).json(r.body);
    }
}

async function sendResume(req, res) {
    const { candidateId, groupId, customMessage, message } = req.body;

    if (!candidateId || !groupId) {
        const r = ApiResponse.badRequest('candidateId and groupId are required');
        return res.status(r.statusCode).json(r.body);
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
            const r = ApiResponse.notFound(
                `Candidate not found: candidateId=${numCandidateId}`
            );
            return res.status(r.statusCode).json(r.body);
        }

        if (!candidate.resumeKey) {
            const r = ApiResponse.badRequest(
                `Candidate ${numCandidateId} does not have a resume uploaded. Please upload a resume before sharing.`
            );
            return res.status(r.statusCode).json(r.body);
        }

        // ------------------------------------------------------------------
        // Pre-flight 2: group must exist and be active, with at least 1 member
        // ------------------------------------------------------------------
        let recipients;
        try {
            recipients = await getRecipients(numGroupId);
        } catch (groupErr) {
            const r = ApiResponse.badRequest(groupErr.message);
            return res.status(r.statusCode).json(r.body);
        }

        if (!recipients.length) {
            const r = ApiResponse.badRequest(
                `Group ${numGroupId} has no active members to send to`
            );
            return res.status(r.statusCode).json(r.body);
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

        const r = ApiResponse.ok({ queued: true });
        return res.status(r.statusCode).json(r.body);

    } catch (error) {
        const r = ApiResponse.badRequest(error.message);
        return res.status(r.statusCode).json(r.body);
    }
}

module.exports = {
    listGroups,
    sendResume
};
