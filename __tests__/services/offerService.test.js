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

    it('createOffer wraps unexpected errors', async () => {
        mockRepo.getActiveOfferByCandidate.mockResolvedValue(null);
        mockRepo.createOffer.mockRejectedValue(new Error('db'));

        await expect(service.createOffer({ candidateId: 1 }, auditContext)).rejects.toMatchObject({
            errorCode: 'OFFER_CREATION_ERROR',
        });
    });

    it('getOffers wraps unexpected errors', async () => {
        mockRepo.getOffers.mockRejectedValue(new Error('db'));

        await expect(service.getOffers()).rejects.toMatchObject({ errorCode: 'OFFER_FETCH_ERROR' });
    });

    it('getOfferFormData wraps unexpected errors', async () => {
        mockRepo.getOfferFormData.mockRejectedValue(new Error('db'));

        await expect(service.getOfferFormData()).rejects.toMatchObject({ errorCode: 'OFFER_FORM_DATA_ERROR' });
    });

    it('getOfferDetails wraps unexpected errors', async () => {
        mockRepo.getOfferDetails.mockRejectedValue(new Error('db'));

        await expect(service.getOfferDetails(1)).rejects.toMatchObject({ errorCode: 'OFFER_DETAILS_ERROR' });
    });

    it('deleteOffer throws when offer missing', async () => {
        mockRepo.getOfferById.mockResolvedValue(null);

        await expect(service.deleteOffer(1, auditContext)).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('deleteOffer throws when soft delete affects no rows', async () => {
        mockRepo.getOfferById.mockResolvedValue({ offerId: 1 });
        mockRepo.softDeleteOffer.mockResolvedValue(0);

        await expect(service.deleteOffer(1, auditContext)).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('deleteOffer wraps unexpected errors', async () => {
        mockRepo.getOfferById.mockRejectedValue(new Error('db'));

        await expect(service.deleteOffer(1, auditContext)).rejects.toMatchObject({
            errorCode: 'OFFER_DELETION_ERROR',
        });
    });

    it('terminateOffer throws when offer missing', async () => {
        mockRepo.getOfferById.mockResolvedValue(null);

        await expect(
            service.terminateOffer(1, { terminationDate: '2025-01-01', terminationReason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('terminateOffer throws when status is not ACCEPTED', async () => {
        mockRepo.getOfferById.mockResolvedValue({ offerId: 1, offerStatus: 'PENDING' });

        await expect(
            service.terminateOffer(1, { terminationDate: '2025-01-01', terminationReason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'TERMINATE_ONLY_ACCEPTED' });
    });

    it('terminateOffer wraps unexpected errors', async () => {
        mockRepo.getOfferById.mockRejectedValue(new Error('db'));

        await expect(
            service.terminateOffer(1, { terminationDate: '2025-01-01', terminationReason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_TERMINATION_ERROR' });
    });

    it('reviseOffer throws when offer missing', async () => {
        mockRepo.getOfferById.mockResolvedValue(null);

        await expect(
            service.reviseOffer(1, { newCTC: 200, newJoiningDate: '2025-06-01', reason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('reviseOffer throws when offer is deleted', async () => {
        mockRepo.getOfferById.mockResolvedValue({ offerId: 1, isDeleted: true });

        await expect(
            service.reviseOffer(1, { newCTC: 200, newJoiningDate: '2025-06-01', reason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('reviseOffer throws for terminal offer status', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'TERMINATED',
            offeredCTCAmount: 100,
            joiningDate: '2025-06-01',
            offerVersion: 1,
        });

        await expect(
            service.reviseOffer(1, { newCTC: 200, newJoiningDate: '2025-06-01', reason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'INVALID_OFFER_STATE' });
    });

    it('reviseOffer throws when CTC and joining date unchanged', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            offeredCTCAmount: 100,
            joiningDate: '2025-06-01',
            offerVersion: 1,
        });

        await expect(
            service.reviseOffer(
                1,
                { newCTC: 100, newJoiningDate: '2025-06-01', reason: 'none' },
                auditContext
            )
        ).rejects.toMatchObject({ errorCode: 'REVISION_NO_CHANGE' });
    });

    it('reviseOffer revises by changing only joining date', async () => {
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
            { newCTC: 100, newJoiningDate: '2025-07-01', reason: 'delay' },
            auditContext
        );

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('reviseOffer throws when revise affects no rows', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            offeredCTCAmount: 100,
            joiningDate: '2025-06-01',
            offerVersion: 1,
        });
        mockRepo.reviseOffer.mockResolvedValue(0);

        await expect(
            service.reviseOffer(1, { newCTC: 200, newJoiningDate: '2025-06-01', reason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('reviseOffer wraps unexpected errors', async () => {
        mockRepo.getOfferById.mockRejectedValue(new Error('db'));

        await expect(
            service.reviseOffer(1, { newCTC: 200, newJoiningDate: '2025-06-01', reason: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_REVISION_ERROR' });
    });

    it('updateOfferStatus throws when offer missing', async () => {
        mockRepo.getOfferById.mockResolvedValue(null);

        await expect(
            service.updateOfferStatus(1, { status: 'PENDING' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('updateOfferStatus throws for terminal offer', async () => {
        mockRepo.getOfferById.mockResolvedValue({ offerId: 1, offerStatus: 'ACCEPTED' });

        await expect(
            service.updateOfferStatus(1, { status: 'PENDING' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'INVALID_OFFER_STATE' });
    });

    it('updateOfferStatus requires signed offer letter for Employee ACCEPTED', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            employmentTypeName: 'Employee',
        });

        await expect(
            service.updateOfferStatus(1, { status: 'ACCEPTED', decisionDate: '2025-01-01' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    });

    it('updateOfferStatus commits ACCEPTED for Employee with signed letter', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            employmentTypeName: 'Employee',
        });
        mockRepo.insertOfferStatus.mockResolvedValue(undefined);
        mockRepo.updateOfferStatus.mockResolvedValue(1);

        await service.updateOfferStatus(
            1,
            {
                status: 'ACCEPTED',
                decisionDate: '2025-01-01',
                signedOfferLetterReceived: true,
            },
            auditContext
        );

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateOfferStatus requires service agreement for consultant ACCEPTED', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            employmentTypeName: 'Consultant',
        });

        await expect(
            service.updateOfferStatus(1, { status: 'ACCEPTED', decisionDate: '2025-01-01' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    });

    it('updateOfferStatus commits ACCEPTED for Consultant with signed agreement', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            employmentTypeName: 'Consultant',
        });
        mockRepo.insertOfferStatus.mockResolvedValue(undefined);
        mockRepo.updateOfferStatus.mockResolvedValue(1);

        await service.updateOfferStatus(
            1,
            {
                status: 'ACCEPTED',
                decisionDate: '2025-01-01',
                signedServiceAgreementReceived: true,
            },
            auditContext
        );

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateOfferStatus throws when update affects no rows', async () => {
        mockRepo.getOfferById.mockResolvedValue({
            offerId: 1,
            offerStatus: 'PENDING',
            employmentTypeName: 'Employee',
        });
        mockRepo.insertOfferStatus.mockResolvedValue(undefined);
        mockRepo.updateOfferStatus.mockResolvedValue(0);

        await expect(
            service.updateOfferStatus(
                1,
                { status: 'REJECTED', rejectionReason: 'other' },
                auditContext
            )
        ).rejects.toMatchObject({ errorCode: 'OFFER_NOT_FOUND' });
    });

    it('updateOfferStatus wraps unexpected errors', async () => {
        mockRepo.getOfferById.mockRejectedValue(new Error('db'));

        await expect(
            service.updateOfferStatus(1, { status: 'PENDING' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'OFFER_STATUS_UPDATE_ERROR' });
    });
});
