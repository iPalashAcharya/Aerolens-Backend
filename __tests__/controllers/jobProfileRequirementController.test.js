const JobProfileRequirementController = require('../../controllers/jobProfileRequirementController');

describe('JobProfileRequirementController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            createJobProfileRequirement: jest.fn(),
            getJobProfileRequirementById: jest.fn(),
            getAllJobProfileRequirements: jest.fn(),
            getJobProfileRequirementsByClientId: jest.fn(),
            getJobProfileRequirementsByJobProfileId: jest.fn(),
            getJobProfileRequirementsByStatus: jest.fn(),
            getJobProfileRequirementsByDepartment: jest.fn(),
            searchJobProfileRequirements: jest.fn(),
            getJobProfileRequirementsByClientWithPagination: jest.fn(),
            getAllJobProfileRequirementsWithPagination: jest.fn(),
            getJobProfileRequirementCount: jest.fn(),
            updateJobProfileRequirement: jest.fn(),
            bulkUpdateJobProfileRequirements: jest.fn(),
            deleteJobProfileRequirement: jest.fn(),
        };
        controller = new JobProfileRequirementController(mockService);
        req = {
            params: {},
            query: {},
            body: {},
            validatedSearch: {},
            auditContext: { userId: 1 },
        };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('createJobProfileRequirement passes body and auditContext', async () => {
        req.body = { title: 'T' };
        mockService.createJobProfileRequirement.mockResolvedValue({ id: 1 });

        await controller.createJobProfileRequirement(req, res);

        expect(mockService.createJobProfileRequirement).toHaveBeenCalledWith(req.body, req.auditContext);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('getJobProfileRequirement uses id param', async () => {
        req.params.id = '3';
        mockService.getJobProfileRequirementById.mockResolvedValue({ id: 3 });

        await controller.getJobProfileRequirement(req, res);

        expect(mockService.getJobProfileRequirementById).toHaveBeenCalledWith(3);
    });

    it('getAllJobProfileRequirements lists all', async () => {
        mockService.getAllJobProfileRequirements.mockResolvedValue([]);

        await controller.getAllJobProfileRequirements(req, res);

        expect(mockService.getAllJobProfileRequirements).toHaveBeenCalled();
    });

    it('getJobProfileRequirementsByClient parses limit and offset', async () => {
        req.params.clientId = '10';
        req.query = { limit: '5', offset: '2' };
        mockService.getJobProfileRequirementsByClientId.mockResolvedValue([]);

        await controller.getJobProfileRequirementsByClient(req, res);

        expect(mockService.getJobProfileRequirementsByClientId).toHaveBeenCalledWith(10, {
            limit: 5,
            offset: 2,
        });
    });

    it('getJobProfileRequirementsByJobProfile uses jobProfileId', async () => {
        req.params.jobProfileId = '7';
        mockService.getJobProfileRequirementsByJobProfileId.mockResolvedValue([]);

        await controller.getJobProfileRequirementsByJobProfile(req, res);

        expect(mockService.getJobProfileRequirementsByJobProfileId).toHaveBeenCalledWith(7);
    });

    it('getJobProfileRequirementsByStatus uses statusId', async () => {
        req.params.statusId = '2';
        mockService.getJobProfileRequirementsByStatus.mockResolvedValue([]);

        await controller.getJobProfileRequirementsByStatus(req, res);

        expect(mockService.getJobProfileRequirementsByStatus).toHaveBeenCalledWith(2);
    });

    it('getJobProfileRequirementsByDepartment uses departmentId', async () => {
        req.params.departmentId = '4';
        mockService.getJobProfileRequirementsByDepartment.mockResolvedValue([]);

        await controller.getJobProfileRequirementsByDepartment(req, res);

        expect(mockService.getJobProfileRequirementsByDepartment).toHaveBeenCalledWith(4);
    });

    it('searchJobProfileRequirements passes validatedSearch', async () => {
        req.validatedSearch = { q: 'x' };
        mockService.searchJobProfileRequirements.mockResolvedValue([{ id: 1 }]);

        await controller.searchJobProfileRequirements(req, res);

        expect(mockService.searchJobProfileRequirements).toHaveBeenCalledWith(req.validatedSearch);
        expect(res.json.mock.calls[0][0].meta).toBeDefined();
    });

    it('getJobProfileRequirementsByClientWithPagination passes pagination', async () => {
        req.params.clientId = '1';
        req.query = { page: '2', pageSize: '20' };
        mockService.getJobProfileRequirementsByClientWithPagination.mockResolvedValue({
            jobProfileRequirements: [],
            pagination: { total: 0 },
        });

        await controller.getJobProfileRequirementsByClientWithPagination(req, res);

        expect(mockService.getJobProfileRequirementsByClientWithPagination).toHaveBeenCalledWith(1, 2, 20);
    });

    it('getAllJobProfileRequirementsWithPagination', async () => {
        req.query = { page: '1', pageSize: '15' };
        mockService.getAllJobProfileRequirementsWithPagination.mockResolvedValue({
            jobProfileRequirements: [],
            pagination: {},
        });

        await controller.getAllJobProfileRequirementsWithPagination(req, res);

        expect(mockService.getAllJobProfileRequirementsWithPagination).toHaveBeenCalledWith(1, 15);
    });

    it('getJobProfileRequirementCount', async () => {
        req.params.clientId = '9';
        mockService.getJobProfileRequirementCount.mockResolvedValue(3);

        await controller.getJobProfileRequirementCount(req, res);

        expect(res.json.mock.calls[0][0].data).toEqual({ count: 3 });
    });

    it('updateJobProfileRequirement', async () => {
        req.params.id = '11';
        req.body = { status: 'open' };
        mockService.updateJobProfileRequirement.mockResolvedValue({ id: 11 });

        await controller.updateJobProfileRequirement(req, res);

        expect(mockService.updateJobProfileRequirement).toHaveBeenCalledWith(11, req.body, req.auditContext);
    });

    it('bulkUpdateJobProfileRequirements validates ids', async () => {
        req.body = { updateData: { x: 1 } };
        const next = jest.fn();

        await controller.bulkUpdateJobProfileRequirements(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('bulkUpdateJobProfileRequirements validates updateData', async () => {
        req.body = { jobProfileRequirementIds: [1] };
        const next = jest.fn();

        await controller.bulkUpdateJobProfileRequirements(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('bulkUpdateJobProfileRequirements calls service', async () => {
        req.body = { jobProfileRequirementIds: [1, 2], updateData: { a: 1 } };
        mockService.bulkUpdateJobProfileRequirements.mockResolvedValue({ updated: 2 });

        await controller.bulkUpdateJobProfileRequirements(req, res);

        expect(mockService.bulkUpdateJobProfileRequirements).toHaveBeenCalledWith([1, 2], { a: 1 }, req.auditContext);
    });

    it('deleteJobProfileRequirement', async () => {
        req.params.id = '8';
        mockService.deleteJobProfileRequirement.mockResolvedValue(undefined);

        await controller.deleteJobProfileRequirement(req, res);

        expect(mockService.deleteJobProfileRequirement).toHaveBeenCalledWith(8, req.auditContext);
    });
});
