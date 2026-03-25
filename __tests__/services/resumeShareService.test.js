const ResumeShareService = require('../../services/resumeShareService');
const auditLogService = require('../../services/auditLogService');

describe('ResumeShareService', () => {
    let service;
    let resumeShareRepository;
    let candidateService;
    let db;

    beforeEach(() => {
        resumeShareRepository = {
            insert: jest.fn(),
            findByToken: jest.fn(),
            revokeByToken: jest.fn()
        };
        candidateService = {
            getResumeInfo: jest.fn(),
            downloadResume: jest.fn()
        };
        db = {
            getConnection: jest.fn()
        };
        service = new ResumeShareService(resumeShareRepository, candidateService, db);
        jest.spyOn(auditLogService, 'logAction').mockResolvedValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('resolveTokenOrThrow', () => {
        it('throws 404 when token missing', async () => {
            resumeShareRepository.findByToken.mockResolvedValue(null);
            await expect(service.resolveTokenOrThrow('abc')).rejects.toMatchObject({
                errorCode: 'SHARE_TOKEN_NOT_FOUND'
            });
        });

        it('throws 403 when revoked', async () => {
            resumeShareRepository.findByToken.mockResolvedValue({
                id: '1',
                isRevoked: true,
                expiresAt: '2099-01-01 00:00:00'
            });
            await expect(service.resolveTokenOrThrow('abc')).rejects.toMatchObject({
                errorCode: 'SHARE_TOKEN_REVOKED'
            });
        });

        it('throws 410 when expired', async () => {
            resumeShareRepository.findByToken.mockResolvedValue({
                id: '1',
                isRevoked: false,
                expiresAt: '2000-01-01 00:00:00'
            });
            await expect(service.resolveTokenOrThrow('abc')).rejects.toMatchObject({
                errorCode: 'SHARE_TOKEN_EXPIRED'
            });
        });
    });
});
