const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
const { streamCandidateResumeToResponse } = require('../utils/streamCandidateResume');

function wantsHtml(req) {
    const accept = req.headers.accept || '';
    return accept.includes('text/html');
}

function sendShareHtmlError(res, status, title, message) {
    res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1e293b}a{color:#2563eb}</style></head>
    <body><h1>${title}</h1><p>${message}</p></body></html>`);
}

function handleShareError(req, res, err) {
    if (wantsHtml(req)) {
        if (err.errorCode === 'SHARE_TOKEN_NOT_FOUND') {
            return sendShareHtmlError(res, 404, 'Link not found', 'This resume share link is invalid or no longer exists.');
        }
        if (err.errorCode === 'SHARE_TOKEN_EXPIRED') {
            return sendShareHtmlError(res, 410, 'Link expired', 'This resume share link has expired. Please request a new link.');
        }
        if (err.errorCode === 'SHARE_TOKEN_REVOKED') {
            return sendShareHtmlError(res, 403, 'Access denied', 'This share link has been revoked.');
        }
        return sendShareHtmlError(res, 500, 'Something went wrong', 'We could not load this resume. Please try again later.');
    }
    return ApiResponse.error(res, err, err.statusCode || 500);
}

class ResumeShareController {
    constructor(resumeShareService) {
        this.resumeShareService = resumeShareService;
    }

    createShare = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id, 10);
        const result = await this.resumeShareService.createShareLink(candidateId, req.auditContext, req);
        return ApiResponse.success(res, { shareUrl: result.shareUrl }, 'Resume share link created', 201);
    });

    getResumeByShareToken = async (req, res, next) => {
        try {
            const token = req.params.token;
            if (!token || token.length > 500) {
                throw new AppError('Invalid share token', 404, 'SHARE_TOKEN_NOT_FOUND');
            }
            const { row, resumeData } = await this.resumeShareService.getResumePayloadForShareToken(token);
            console.log('[RESUME_SHARE] Public resume access', { shareTokenId: row.id, ip: req.ip });
            await streamCandidateResumeToResponse(this.resumeShareService.candidateService, resumeData, res, {
                inline: true
            });
        } catch (err) {
            if (!(err instanceof AppError)) {
                console.error('[RESUME_SHARE] Public stream error', err);
                const wrapped = new AppError('Failed to load resume', 500, 'SHARE_STREAM_ERROR');
                return handleShareError(req, res, wrapped);
            }
            return handleShareError(req, res, err);
        }
    };

    revokeShare = catchAsync(async (req, res) => {
        const token = req.params.token;
        const memberId = req.user?.memberId;
        if (!memberId) {
            throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
        }
        await this.resumeShareService.revokeShareToken(token, memberId, req.auditContext);
        return ApiResponse.success(res, null, 'Share link revoked', 200);
    });
}

module.exports = ResumeShareController;
