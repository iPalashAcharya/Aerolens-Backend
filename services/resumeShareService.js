const crypto = require('crypto');
const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');
const { RESUME_SHARE_TTL_MS } = require('../config/resumeShareConstants');

class ResumeShareService {
    constructor(resumeShareRepository, candidateService, db) {
        this.resumeShareRepository = resumeShareRepository;
        this.candidateService = candidateService;
        this.db = db;
    }

    buildShareUrl(req, token) {
        const configured = process.env.SHARE_BASE_URL && process.env.SHARE_BASE_URL.replace(/\/$/, '');
        if (configured) {
            return `${configured}/share/${encodeURIComponent(token)}`;
        }
        const proto = req.protocol || 'http';
        const host = req.get('host') || 'localhost';
        return `${proto}://${host}/share/${encodeURIComponent(token)}`;
    }

    generateOpaqueToken() {
        return crypto.randomBytes(32).toString('base64url');
    }

    async createShareLink(candidateId, auditContext, req) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const resumeInfo = await this.candidateService.getResumeInfo(candidateId);
            if (!resumeInfo.hasResume) {
                throw new AppError('No resume available to share for this candidate', 400, 'NO_RESUME_TO_SHARE');
            }

            const id = crypto.randomUUID();
            const token = this.generateOpaqueToken();
            const expiresAt = new Date(Date.now() + RESUME_SHARE_TTL_MS);
            const expiresAtSql = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

            await this.resumeShareRepository.insert(
                {
                    id,
                    token,
                    candidateId,
                    createdByUserId: auditContext.userId,
                    expiresAt: expiresAtSql
                },
                client
            );

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: {
                    entity: 'RESUME_SHARE_TOKEN',
                    resumeShareTokenId: id,
                    expiresAt: expiresAt.toISOString()
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            const shareUrl = this.buildShareUrl(req, token);
            console.log('[RESUME_SHARE] Created link', { resumeShareTokenId: id, candidateId, userId: auditContext.userId });
            return { shareUrl, token, expiresAt };
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            console.error('[RESUME_SHARE] createShareLink failed', error);
            throw new AppError('Failed to create resume share link', 500, 'RESUME_SHARE_CREATE_FAILED');
        } finally {
            client.release();
        }
    }

    async resolveTokenOrThrow(token) {
        const row = await this.resumeShareRepository.findByToken(token);
        if (!row) {
            throw new AppError('Share link not found', 404, 'SHARE_TOKEN_NOT_FOUND');
        }
        if (row.isRevoked) {
            throw new AppError('This share link has been revoked', 403, 'SHARE_TOKEN_REVOKED');
        }
        const expires = new Date(row.expiresAt);
        if (Number.isFinite(expires.getTime()) && expires.getTime() < Date.now()) {
            throw new AppError('This share link has expired', 410, 'SHARE_TOKEN_EXPIRED');
        }
        return row;
    }

    async getResumePayloadForShareToken(token) {
        const row = await this.resolveTokenOrThrow(token);
        const resumeData = await this.candidateService.downloadResume(row.candidateId);
        return { row, resumeData };
    }

    async revokeShareToken(token, memberId, auditContext) {
        const row = await this.resumeShareRepository.findByToken(token);
        if (!row) {
            throw new AppError('Share link not found', 404, 'SHARE_TOKEN_NOT_FOUND');
        }
        if (Number(row.createdByUserId) !== Number(memberId)) {
            throw new AppError('You are not allowed to revoke this share link', 403, 'SHARE_REVOKE_FORBIDDEN');
        }

        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const affected = await this.resumeShareRepository.revokeByToken(token, client);
            if (!affected) {
                await client.rollback();
                throw new AppError('Share link already revoked or not found', 410, 'SHARE_ALREADY_REVOKED');
            }
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                oldValues: {
                    entity: 'RESUME_SHARE_TOKEN',
                    resumeShareTokenId: row.id
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();
            console.log('[RESUME_SHARE] Revoked', { resumeShareTokenId: row.id, userId: memberId });
            return true;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            console.error('[RESUME_SHARE] revoke failed', error);
            throw new AppError('Failed to revoke share link', 500, 'RESUME_SHARE_REVOKE_FAILED');
        } finally {
            client.release();
        }
    }
}

module.exports = ResumeShareService;
