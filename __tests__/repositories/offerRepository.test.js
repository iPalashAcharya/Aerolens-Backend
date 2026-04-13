const OfferRepository = require('../../repositories/offerRepository');

describe('OfferRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            execute: jest.fn(),
            query: jest.fn(),
        };
        repo = new OfferRepository({});
    });

    describe('createOffer', () => {
        it('inserts and returns row', async () => {
            mockConn.execute
                .mockResolvedValueOnce([{ insertId: 10 }])
                .mockResolvedValueOnce([[{ offerId: 10, candidateId: 1 }]]);

            const offer = await repo.createOffer(
                {
                    candidateId: 1,
                    jobProfileRequirementId: 2,
                    reportingManagerId: 3,
                    employmentTypeLookupId: 4,
                    workModelLookupId: 5,
                    joiningDate: '2025-01-01',
                    createdBy: 9,
                },
                mockConn
            );

            expect(offer.offerId).toBe(10);
        });
    });

    describe('getActiveOfferByCandidate', () => {
        it('returns first row or null', async () => {
            mockConn.execute.mockResolvedValueOnce([[{ offerId: 1 }]]);
            await expect(repo.getActiveOfferByCandidate(1, mockConn)).resolves.toEqual({ offerId: 1 });

            mockConn.execute.mockResolvedValueOnce([[]]);
            await expect(repo.getActiveOfferByCandidate(2, mockConn)).resolves.toBeNull();
        });
    });

    describe('getOffers', () => {
        it('returns rows from query', async () => {
            const rows = [{ offerId: 1 }];
            mockConn.query.mockResolvedValue([rows]);

            await expect(repo.getOffers(mockConn)).resolves.toEqual(rows);
        });
    });

    describe('getOfferById', () => {
        it('returns row or null', async () => {
            mockConn.execute.mockResolvedValueOnce([[{ offerId: 7 }]]);
            await expect(repo.getOfferById(7, mockConn)).resolves.toEqual({ offerId: 7 });
            mockConn.execute.mockResolvedValueOnce([[]]);
            await expect(repo.getOfferById(0, mockConn)).resolves.toBeNull();
        });
    });

    describe('getOfferDetails', () => {
        it('returns joined row', async () => {
            mockConn.execute.mockResolvedValue([[{ offerId: 1, candidateName: 'A' }]]);
            await expect(repo.getOfferDetails(1, mockConn)).resolves.toMatchObject({ offerId: 1 });
        });
    });

    describe('getOfferRevisions', () => {
        it('returns revision rows with synthetic revisionId', async () => {
            mockConn.execute.mockResolvedValue([[{ offerId: 1, newCTC: 100 }]]);
            const revs = await repo.getOfferRevisions(1, mockConn);
            expect(revs[0]).toMatchObject({ revisionId: 1, newCTC: 100 });
        });
    });

    describe('getOfferFormData', () => {
        it('returns structured lookups', async () => {
            mockConn.query.mockResolvedValue([[[]]]);
            const out = await repo.getOfferFormData(mockConn);
            expect(out).toHaveProperty('employmentTypes');
            expect(out).toHaveProperty('jobProfileRequirements');
        });
    });

    describe('softDeleteOffer', () => {
        it('updates row', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);
            await expect(repo.softDeleteOffer(3, mockConn)).resolves.toBeDefined();
        });
    });

    describe('terminateOffer', () => {
        it('inserts termination and updates status', async () => {
            mockConn.execute
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce([{ affectedRows: 1 }]);

            await expect(
                repo.terminateOffer(
                    1,
                    {
                        terminationDate: '2026-01-01',
                        terminationReason: 'exit',
                        terminatedBy: 2
                    },
                    mockConn
                )
            ).resolves.toBe(1);
        });
    });

    describe('reviseOffer', () => {
        it('inserts revision and bumps offer', async () => {
            mockConn.execute
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce([{ affectedRows: 1 }]);

            await expect(
                repo.reviseOffer(
                    2,
                    {
                        previousCTC: 1,
                        newCTC: 2,
                        previousJoiningDate: null,
                        newJoiningDate: '2026-02-01',
                        reason: 'adjust',
                        revisedBy: 3
                    },
                    mockConn
                )
            ).resolves.toBe(1);
        });
    });

    describe('insertOfferStatus and updateOfferStatus', () => {
        it('inserts status history and updates offer row', async () => {
            mockConn.execute.mockResolvedValue(undefined);

            await expect(
                repo.insertOfferStatus(
                    {
                        offerId: 1,
                        status: 'REJECTED',
                        decisionDate: '2026-03-01',
                        signedOfferLetterReceived: null,
                        signedServiceAgreementReceived: null,
                        signedNDAReceived: false,
                        signedCodeOfConductReceived: false,
                        rejectionReason: 'no'
                    },
                    mockConn
                )
            ).resolves.toBeUndefined();

            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);
            await expect(repo.updateOfferStatus(1, 'REJECTED', mockConn)).resolves.toBe(1);
        });
    });
});
