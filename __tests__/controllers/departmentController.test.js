const DepartmentController = require('../../controllers/departmentController');

describe('DepartmentController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            createDepartment: jest.fn(),
            getDepartmentById: jest.fn(),
            updateDepartment: jest.fn(),
            deleteDepartment: jest.fn(),
            getDepartmentsByClientId: jest.fn(),
        };
        controller = new DepartmentController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('createDepartment returns 201', async () => {
        mockService.createDepartment.mockResolvedValue({ id: 1 });

        await controller.createDepartment(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('getDepartmentsByClient includes meta count', async () => {
        req.params.clientId = '3';
        mockService.getDepartmentsByClientId.mockResolvedValue([{ id: 1 }, { id: 2 }]);

        await controller.getDepartmentsByClient(req, res);

        expect(mockService.getDepartmentsByClientId).toHaveBeenCalledWith(3);
        const payload = res.json.mock.calls[0][0];
        expect(payload.meta.count).toBe(2);
    });
});
