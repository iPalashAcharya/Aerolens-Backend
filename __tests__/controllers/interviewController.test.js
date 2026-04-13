const InterviewController = require('../../controllers/interviewController');

describe('InterviewController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getAll: jest.fn(),
            getInterviewById: jest.fn(),
            getInterviewsByCandidateId: jest.fn(),
            getTotalSummary: jest.fn(),
            getMonthlySummary: jest.fn(),
            getDailySummary: jest.fn(),
            getInterviewTracker: jest.fn(),
            getInterviewerWorkloadReport: jest.fn(),
            getFormData: jest.fn(),
            getFinalizationFormData: jest.fn(),
            getInterviewerDailyCapacity: jest.fn(),
            createInterview: jest.fn(),
            scheduleNextRound: jest.fn(),
            updateInterview: jest.fn(),
            finalizeInterview: jest.fn(),
            deleteInterview: jest.fn(),
        };
        controller = new InterviewController(mockService);
        req = {
            params: {},
            body: {},
            validatedQuery: {},
            auditContext: {},
        };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('getAll returns interview list data', async () => {
        mockService.getAll.mockResolvedValue({ data: [{ id: 1 }] });

        await controller.getAll(req, res);

        expect(mockService.getAll).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('getById uses interviewId', async () => {
        req.params.interviewId = '9';
        mockService.getInterviewById.mockResolvedValue({ id: 9 });

        await controller.getById(req, res);

        expect(mockService.getInterviewById).toHaveBeenCalledWith(9);
    });

    it('getInterviewsByCandidateId uses candidateId', async () => {
        req.params.candidateId = '4';
        mockService.getInterviewsByCandidateId.mockResolvedValue([]);

        await controller.getInterviewsByCandidateId(req, res);

        expect(mockService.getInterviewsByCandidateId).toHaveBeenCalledWith(4);
    });

    it('getTotalSummary returns summary', async () => {
        mockService.getTotalSummary.mockResolvedValue({ total: 1 });

        await controller.getTotalSummary(req, res);

        expect(res.json.mock.calls[0][0].data).toEqual({ total: 1 });
    });

    it('getMonthlySummary passes validated query', async () => {
        req.validatedQuery = { startDate: 'a', endDate: 'b', timezone: 'UTC' };
        mockService.getMonthlySummary.mockResolvedValue([]);

        await controller.getMonthlySummary(req, res);

        expect(mockService.getMonthlySummary).toHaveBeenCalledWith('a', 'b', 'UTC');
    });

    it('getDailySummary passes date and timezone', async () => {
        req.validatedQuery = { date: '2024-01-01', timezone: 'UTC' };
        mockService.getDailySummary.mockResolvedValue([]);

        await controller.getDailySummary(req, res);

        expect(mockService.getDailySummary).toHaveBeenCalledWith('2024-01-01', 'UTC');
    });

    it('getInterviewTracker passes validatedQuery', async () => {
        req.validatedQuery = { x: 1 };
        mockService.getInterviewTracker.mockResolvedValue({ rows: [] });

        await controller.getInterviewTracker(req, res);

        expect(mockService.getInterviewTracker).toHaveBeenCalledWith(req.validatedQuery);
    });

    it('getInterviewerWorkloadReport passes validatedQuery', async () => {
        req.validatedQuery = { y: 2 };
        mockService.getInterviewerWorkloadReport.mockResolvedValue({});

        await controller.getInterviewerWorkloadReport(req, res);

        expect(mockService.getInterviewerWorkloadReport).toHaveBeenCalledWith(req.validatedQuery);
    });

    it('getCreateData returns nested interview form json', async () => {
        mockService.getFormData.mockResolvedValue({
            interview: {},
            interviewers: [],
            recruiters: [],
            candidates: [],
        });

        await controller.getCreateData(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toHaveProperty('interview');
    });

    it('getFinalizeData uses interviewId', async () => {
        req.params.interviewId = '7';
        mockService.getFinalizationFormData.mockResolvedValue({});

        await controller.getFinalizeData(req, res);

        expect(mockService.getFinalizationFormData).toHaveBeenCalledWith(7);
    });

    it('getInterviewerDailyCapacity passes params', async () => {
        req.params.interviewerId = '3';
        req.validatedQuery = { date: 'd', timezone: 'UTC' };
        mockService.getInterviewerDailyCapacity.mockResolvedValue({ slots: [] });

        await controller.getInterviewerDailyCapacity(req, res);

        expect(mockService.getInterviewerDailyCapacity).toHaveBeenCalledWith(3, 'd', 'UTC');
    });

    it('createInterview uses candidateId and auditContext', async () => {
        req.params.candidateId = '11';
        req.body = { round: 1 };
        req.auditContext = { userId: 1 };
        mockService.createInterview.mockResolvedValue({ id: 1 });

        await controller.createInterview(req, res);

        expect(mockService.createInterview).toHaveBeenCalledWith(11, req.body, req.auditContext);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('scheduleNextRound returns service message', async () => {
        req.params.candidateId = '2';
        req.body = {};
        req.auditContext = {};
        mockService.scheduleNextRound.mockResolvedValue({
            data: { ok: true },
            message: 'scheduled',
        });

        await controller.scheduleNextRound(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('updateInterview uses interviewId', async () => {
        req.params.interviewId = '8';
        req.body = {};
        req.auditContext = {};
        mockService.updateInterview.mockResolvedValue({});

        await controller.updateInterview(req, res);

        expect(mockService.updateInterview).toHaveBeenCalledWith(8, req.body, req.auditContext);
    });

    it('finalizeInterview calls service', async () => {
        req.params.interviewId = '6';
        req.body = { status: 'DONE' };
        req.auditContext = {};
        mockService.finalizeInterview.mockResolvedValue({});

        await controller.finalizeInterview(req, res);

        expect(mockService.finalizeInterview).toHaveBeenCalledWith(6, req.body, req.auditContext);
    });

    it('deleteInterview calls service', async () => {
        req.params.interviewId = '5';
        req.auditContext = {};
        mockService.deleteInterview.mockResolvedValue(undefined);

        await controller.deleteInterview(req, res);

        expect(mockService.deleteInterview).toHaveBeenCalledWith(5, req.auditContext);
    });
});
