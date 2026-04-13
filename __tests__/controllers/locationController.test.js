const LocationController = require('../../controllers/locationController');

describe('LocationController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getLocation: jest.fn(),
            getLocationById: jest.fn(),
            createLocation: jest.fn(),
            updateLocation: jest.fn(),
            deleteLocation: jest.fn(),
        };
        controller = new LocationController(mockService);
        req = { params: {}, body: {}, auditContext: {} };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('getAll returns locations', async () => {
        mockService.getLocation.mockResolvedValue({ data: [] });

        await controller.getAll(req, res);

        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('getById parses locationId', async () => {
        req.params.locationId = '7';
        mockService.getLocationById.mockResolvedValue({ locationId: 7 });

        await controller.getById(req, res);

        expect(mockService.getLocationById).toHaveBeenCalledWith(7);
    });
});
