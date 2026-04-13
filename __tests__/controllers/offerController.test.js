const OfferController = require('../../controllers/offerController');

describe('OfferController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            createOffer: jest.fn(),
            getOffers: jest.fn(),
            getOfferDetails: jest.fn(),
            deleteOffer: jest.fn(),
            terminateOffer: jest.fn(),
            reviseOffer: jest.fn(),
            updateOfferStatus: jest.fn(),
            getOfferFormData: jest.fn(),
        };
        controller = new OfferController(mockService);
        req = {
            params: {},
            body: {},
            auditContext: { userId: 9 },
        };
        res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    });

    it('createOffer merges candidateId and createdBy', async () => {
        req.params.candidateId = '3';
        req.body = { jobProfileRequirementId: 1 };
        mockService.createOffer.mockResolvedValue({ offerId: 1 });

        await controller.createOffer(req, res);

        expect(mockService.createOffer).toHaveBeenCalledWith(
            expect.objectContaining({ candidateId: 3, createdBy: 9 }),
            req.auditContext
        );
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('getOfferFormData returns structured payload', async () => {
        mockService.getOfferFormData.mockResolvedValue({
            employmentTypes: [],
            workModes: [],
            currencies: [],
            compensationTypes: [],
            vendors: [],
            members: [],
            jobProfileRequirements: [],
        });

        await controller.getOfferFormData(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toHaveProperty('vendors');
    });
});
