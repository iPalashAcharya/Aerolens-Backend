const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
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
        return ApiResponse.success(
            res,
            { groups },
            'WhatsApp groups retrieved successfully'
        );
    } catch (error) {
        console.error('[WA] listGroups failed', { message: error.message });
        const err = new AppError(
            'Failed to load WhatsApp groups',
            500,
            'WHATSAPP_GROUPS_ERROR'
        );
        return ApiResponse.error(res, err, err.statusCode);
    }
}

async function sendResume(req, res) {
    const { candidateId, groupId, customMessage, message } = req.body;

    if (!candidateId || !groupId) {
        const err = new AppError(
            'candidateId and groupId are required',
            400,
            'VALIDATION_ERROR'
        );
        return ApiResponse.error(res, err, err.statusCode);
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
            const err = new AppError(
                `Candidate not found: candidateId=${numCandidateId}`,
                404,
                'CANDIDATE_NOT_FOUND'
            );
            return ApiResponse.error(res, err, err.statusCode);
        }

        if (!candidate.resumeKey) {
            const err = new AppError(
                `Candidate ${numCandidateId} does not have a resume uploaded. Please upload a resume before sharing.`,
                400,
                'RESUME_REQUIRED'
            );
            return ApiResponse.error(res, err, err.statusCode);
        }

        // ------------------------------------------------------------------
        // Pre-flight 2: group must exist and be active, with at least 1 member
        // ------------------------------------------------------------------
        let recipients;
        try {
            recipients = await getRecipients(numGroupId);
        } catch (groupErr) {
            const err = new AppError(groupErr.message, 400, 'INVALID_GROUP');
            return ApiResponse.error(res, err, err.statusCode);
        }

        if (!recipients.length) {
            const err = new AppError(
                `Group ${numGroupId} has no active members to send to`,
                400,
                'EMPTY_GROUP'
            );
            return ApiResponse.error(res, err, err.statusCode);
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

        return ApiResponse.success(
            res,
            { queued: true },
            'WhatsApp resume share queued successfully'
        );

    } catch (error) {
        const err =
            error instanceof AppError
                ? error
                : new AppError(error.message, 400, 'VALIDATION_ERROR');
        return ApiResponse.error(res, err, err.statusCode);
    }
}

module.exports = {
    listGroups,
    sendResume
};
