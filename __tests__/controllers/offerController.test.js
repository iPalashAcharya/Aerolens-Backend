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

    it('getOffers delegates to service', async () => {
        mockService.getOffers.mockResolvedValue([{ offerId: 1 }]);
        await controller.getOffers(req, res);
        expect(mockService.getOffers).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('getOfferDetails passes offerId', async () => {
        req.params.offerId = '12';
        mockService.getOfferDetails.mockResolvedValue({ offerId: 12 });
        await controller.getOfferDetails(req, res);
        expect(mockService.getOfferDetails).toHaveBeenCalledWith(12);
    });

    it('deleteOffer passes offerId and auditContext', async () => {
        req.params.offerId = '5';
        mockService.deleteOffer.mockResolvedValue(undefined);
        await controller.deleteOffer(req, res);
        expect(mockService.deleteOffer).toHaveBeenCalledWith(5, req.auditContext);
    });

    it('terminateOffer builds termination payload', async () => {
        req.params.offerId = '7';
        req.body = { terminationDate: '2026-01-01', terminationReason: 'left' };
        mockService.terminateOffer.mockResolvedValue(undefined);
        await controller.terminateOffer(req, res);
        expect(mockService.terminateOffer).toHaveBeenCalledWith(
            7,
            expect.objectContaining({ terminatedBy: 9, terminationReason: 'left' }),
            req.auditContext
        );
    });

    it('reviseOffer builds revision payload', async () => {
        req.params.offerId = '8';
        req.body = { newCTC: 100, newJoiningDate: '2026-02-01', reason: 'revised' };
        mockService.reviseOffer.mockResolvedValue(undefined);
        await controller.reviseOffer(req, res);
        expect(mockService.reviseOffer).toHaveBeenCalledWith(
            8,
            expect.objectContaining({ revisedBy: 9, reason: 'revised' }),
            req.auditContext
        );
    });

    it('updateOfferStatus maps body and null-coalesces rejectionReason', async () => {
        req.params.offerId = '9';
        req.body = {
            status: 'REJECTED',
            decisionDate: '2026-03-01',
            signedNDAReceived: false,
        };
        mockService.updateOfferStatus.mockResolvedValue(undefined);
        await controller.updateOfferStatus(req, res);
        expect(mockService.updateOfferStatus).toHaveBeenCalledWith(
            9,
            expect.objectContaining({ rejectionReason: null }),
            req.auditContext
        );
    });
});
