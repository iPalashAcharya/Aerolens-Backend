const VendorController = require('../../controllers/vendorController');

describe('VendorController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getAllVendors: jest.fn(),
            createVendor: jest.fn(),
            getVendorById: jest.fn(),
            updateVendor: jest.fn(),
            deleteVendor: jest.fn(),
        };
        controller = new VendorController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('getAll lists vendors', async () => {
        mockService.getAllVendors.mockResolvedValue([]);

        await controller.getAll(req, res);

        expect(mockService.getAllVendors).toHaveBeenCalled();
    });

    it('getVendor uses vendorId param', async () => {
        req.params.vendorId = '8';
        mockService.getVendorById.mockResolvedValue({ vendorId: 8 });

        await controller.getVendor(req, res);

        expect(mockService.getVendorById).toHaveBeenCalledWith(8);
    });
});
