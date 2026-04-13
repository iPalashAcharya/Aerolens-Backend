const MemberController = require('../../controllers/memberController');

describe('MemberController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getMemberFormData: jest.fn(),
            getCreateData: jest.fn(),
            getAllMembers: jest.fn(),
            getMemberById: jest.fn(),
            updateMember: jest.fn(),
            deleteMember: jest.fn(),
        };
        controller = new MemberController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('getFormData returns form data', async () => {
        mockService.getMemberFormData.mockResolvedValue({ fields: [] });

        await controller.getFormData(req, res);

        expect(mockService.getMemberFormData).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('getCreateData returns create payload', async () => {
        mockService.getCreateData.mockResolvedValue({});

        await controller.getCreateData(req, res);

        expect(mockService.getCreateData).toHaveBeenCalled();
    });

    it('getAll lists members', async () => {
        mockService.getAllMembers.mockResolvedValue({ rows: [] });

        await controller.getAll(req, res);

        expect(mockService.getAllMembers).toHaveBeenCalled();
    });

    it('getById uses memberId param', async () => {
        req.params.memberId = '12';
        mockService.getMemberById.mockResolvedValue({ memberId: 12 });

        await controller.getById(req, res);

        expect(mockService.getMemberById).toHaveBeenCalledWith(12);
    });

    it('updateMember passes auditContext', async () => {
        req.params.memberId = '5';
        req.body = { name: 'A' };
        req.auditContext = { userId: 1 };
        mockService.updateMember.mockResolvedValue({});

        await controller.updateMember(req, res);

        expect(mockService.updateMember).toHaveBeenCalledWith(5, req.body, req.auditContext);
    });

    it('deleteMember calls service', async () => {
        req.params.memberId = '3';
        req.auditContext = {};
        mockService.deleteMember.mockResolvedValue(undefined);

        await controller.deleteMember(req, res);

        expect(mockService.deleteMember).toHaveBeenCalledWith(3, req.auditContext);
    });
});
