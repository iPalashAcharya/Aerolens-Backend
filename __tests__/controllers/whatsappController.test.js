const mockEnqueue = jest.fn();
const mockGetCandidate = jest.fn();
const mockGetRecipients = jest.fn();
const mockListGroups = jest.fn();

const mockQueueRepo = {
    getById: jest.fn(),
};
const mockMsgLogRepo = {
    findForQueueJob: jest.fn(),
};

jest.mock('../../repositories/whatsappQueueRepository', () =>
    jest.fn().mockImplementation(() => mockQueueRepo)
);
jest.mock('../../repositories/whatsappMessageLogRepository', () =>
    jest.fn().mockImplementation(() => mockMsgLogRepo)
);

jest.mock('../../queues/whatsappQueue', () => ({
    enqueueWhatsAppResumeJob: (...a) => mockEnqueue(...a),
}));

jest.mock('../../services/whatsappCandidateService', () => ({
    getCandidate: (...a) => mockGetCandidate(...a),
}));

jest.mock('../../services/groupService', () => ({
    getRecipients: (...a) => mockGetRecipients(...a),
    listActiveWhatsappGroups: (...a) => mockListGroups(...a),
}));

const { listGroups, sendResume, getShareLog } = require('../../controllers/whatsappController');

describe('whatsappController', () => {
    let req;
    let res;

    beforeEach(() => {
        req = { params: {}, body: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        jest.clearAllMocks();
    });

    describe('listGroups', () => {
        it('returns groups on success', async () => {
            mockListGroups.mockResolvedValue([{ id: 1 }]);

            await listGroups(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json.mock.calls[0][0].data).toEqual({ groups: [{ id: 1 }] });
        });

        it('returns 500 when group service fails', async () => {
            mockListGroups.mockRejectedValue(new Error('db'));

            await listGroups(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('sendResume', () => {
        it('requires candidateId and groupId', async () => {
            req.body = {};

            await sendResume(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('404 when candidate missing', async () => {
            req.body = { candidateId: 1, groupId: 2 };
            mockGetCandidate.mockResolvedValue(null);

            await sendResume(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('400 when resume missing', async () => {
            req.body = { candidateId: 1, groupId: 2 };
            mockGetCandidate.mockResolvedValue({ resumeKey: null });

            await sendResume(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('400 when group has no recipients', async () => {
            req.body = { candidateId: 1, groupId: 2 };
            mockGetCandidate.mockResolvedValue({ resumeKey: 'k' });
            mockGetRecipients.mockResolvedValue([]);

            await sendResume(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('maps getRecipients failure to 400', async () => {
            req.body = { candidateId: 1, groupId: 2 };
            mockGetCandidate.mockResolvedValue({ resumeKey: 'k' });
            mockGetRecipients.mockRejectedValue(new Error('bad group'));

            await sendResume(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('enqueues on success', async () => {
            req.body = { candidateId: 1, groupId: 2 };
            mockGetCandidate.mockResolvedValue({ resumeKey: 'k' });
            mockGetRecipients.mockResolvedValue([{ phone: '+1' }]);
            mockEnqueue.mockResolvedValue({ queueId: 99 });

            await sendResume(req, res);

            expect(mockEnqueue).toHaveBeenCalledWith({
                candidateId: 1,
                groupId: 2,
                customMessage: undefined,
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('validates customMessage type', async () => {
            req.body = { candidateId: 1, groupId: 2, customMessage: 123 };
            mockGetCandidate.mockResolvedValue({ resumeKey: 'k' });
            mockGetRecipients.mockResolvedValue([{}]);

            await sendResume(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getShareLog', () => {
        it('400 on invalid queueId', async () => {
            req.params = { queueId: 'x' };

            await getShareLog(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('404 when queue missing', async () => {
            req.params = { queueId: '5' };
            mockQueueRepo.getById.mockResolvedValue(null);

            await getShareLog(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('returns queue and messages', async () => {
            req.params = { queueId: '7' };
            const queue = {
                candidateId: 1,
                groupId: 2,
                createdAt: 'a',
                processedAt: 'b',
            };
            mockQueueRepo.getById.mockResolvedValue(queue);
            mockMsgLogRepo.findForQueueJob.mockResolvedValue([{ id: 1 }]);

            await getShareLog(req, res);

            expect(mockMsgLogRepo.findForQueueJob).toHaveBeenCalledWith({
                candidateId: 1,
                groupId: 2,
                createdAt: 'a',
                processedAt: 'b',
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('500 on unexpected error', async () => {
            req.params = { queueId: '1' };
            mockQueueRepo.getById.mockRejectedValue(new Error('db'));

            await getShareLog(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
