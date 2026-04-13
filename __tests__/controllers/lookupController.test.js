const LookupController = require('../../controllers/lookupController');

describe('LookupController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getAll: jest.fn(),
            getByKey: jest.fn(),
            createLookup: jest.fn(),
            updateLookup: jest.fn(),
            deleteLookup: jest.fn(),
        };
        controller = new LookupController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('getAll returns data on success', async () => {
        mockService.getAll.mockResolvedValue({ data: [{ lookupKey: 1 }] });

        await controller.getAll(req, res);

        expect(res.json.mock.calls[0][0].data).toEqual([{ lookupKey: 1 }]);
    });

    it('getAll maps service errors through ApiResponse.error', async () => {
        const err = Object.assign(new Error('fail'), { errorCode: 'X', statusCode: 500 });
        mockService.getAll.mockRejectedValue(err);

        await controller.getAll(req, res);

        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    it('getByKey parses lookupKey param', async () => {
        req.params.lookupKey = '12';
        mockService.getByKey.mockResolvedValue({ lookupKey: 12 });

        await controller.getByKey(req, res);

        expect(mockService.getByKey).toHaveBeenCalledWith(12);
    });
});
