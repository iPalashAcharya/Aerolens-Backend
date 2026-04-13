const OfferService = require('../../services/offerService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('OfferService', () => {
    let service;
    let mockRepo;
    let mockDb;
    let mockClient;

    const auditContext = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
        };
        mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
        mockRepo = {
            getActiveOfferByCandidate: jest.fn(),
            createOffer: jest.fn(),
            getOffers: jest.fn(),
            getOfferFormData: jest.fn(),
            getOfferDetails: jest.fn(),
            getOfferRevisions: jest.fn(),
            getOfferById: jest.fn(),
            softDeleteOffer: jest.fn(),
            terminateOffer: jest.fn(),
            reviseOffer: jest.fn(),
            updateOfferStatus: jest.fn(),
            insertOfferStatus: jest.fn(),
        };
        service = new OfferService(mockRepo, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('createOffer rejects when active offer exists', async () => {
        mockRepo.getActiveOfferByCandidate.mockResolvedValue({ offerId: 1 });

        await expect(
            service.createOffer({ candidateId: 1 }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'ACTIVE_OFFER_EXISTS' });
    });

    it('createOffer commits on success', async () => {
        mockRepo.getActiveOfferByCandidate.mockResolvedValue(null);
        mockRepo.createOffer.mockResolvedValue({ offerId: 9 });

        const result = await service.createOffer({ candidateId: 2 }, auditContext);

        expect(result.offerId).toBe(9);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('getOffers returns list', async () => {
        mockRepo.getOffers.mockResolvedValue([]);

        await expect(service.getOffers()).resolves.toEqual([]);
    });

    it('getOfferDetails throws when offer missing', async () => {
        mockRepo.getOfferDetails.mockResolvedValue(null);

        await expect(service.getOfferDetails(1)).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('getOfferDetails returns offer and revisions', async () => {
        mockRepo.getOfferDetails.mockResolvedValue({ offerId: 1 });
        mockRepo.getOfferRevisions.mockResolvedValue([{ id: 1 }]);

        const result = await service.getOfferDetails(1);

        expect(result.offer.offerId).toBe(1);
        expect(result.revisionCount).toBe(1);
    });

    it('getOfferFormData delegates', async () => {
        mockRepo.getOfferFormData.mockResolvedValue({ employmentTypes: [] });

        await expect(service.getOfferFormData()).resolves.toEqual({ employmentTypes: [] });
    });

    it('deleteOffer commits when soft delete affects rows', async () => {
        mockRepo.getOfferById.mockResolvedValue({ offerId: 1 });
        mockRepo.softDeleteOffer.mockResolvedValue(1);

        await service.deleteOffer(1, auditContext);

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('terminateOffer commits for ACCEPTED offer', async () => {
        mockRepo.getOfferById.mockResolvedValue({ offerId: 1, offerStatus: 'ACCEPTED' });
        mockRepo.terminateOffer.mockResolvedValue(undefined);

        await service.terminateOffer(
            1,
            { terminationDate: '2025-01-01', terminationReason: 'x' },
            auditContext
        );

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('reviseOffer commits when CTC changes', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            offeredCTCAmount: 100,
            joiningDate: '2025-06-01',
            offerVersion: 1,
        });
        mockRepo.reviseOffer.mockResolvedValue(1);

        await service.reviseOffer(
            1,
            { newCTC: 200, newJoiningDate: '2025-06-01', reason: 'market' },
            auditContext
        );

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateOfferStatus commits for non-terminal transition', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            employmentTypeName: 'Employee',
        });
        mockRepo.insertOfferStatus.mockResolvedValue(undefined);
        mockRepo.updateOfferStatus.mockResolvedValue(1);

        await service.updateOfferStatus(
            1,
            { status: 'REJECTED', rejectionReason: 'other' },
            auditContext
        );

        expect(mockClient.commit).toHaveBeenCalled();
    });
});
