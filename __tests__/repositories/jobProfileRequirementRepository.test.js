const JobProfileRequirementRepository = require('../../repositories/jobProfileRequirementRepository');

describe('JobProfileRequirementRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            execute: jest.fn(),
        };
        repo = new JobProfileRequirementRepository({});
    });

    it('create returns insertId payload', async () => {
        mockConn.execute.mockResolvedValue([{ insertId: 44 }]);

        const out = await repo.create(
            {
                jobProfileId: 1,
                clientId: 2,
                departmentId: 3,
                positions: 1,
                estimatedCloseDate: null,
                locationId: 1,
                workArrangement: 'HYBRID',
                statusId: 1,
            },
            mockConn
        );

        expect(out.jobProfileRequirementId).toBe(44);
    });

    it('findById returns parsed row or null', async () => {
        mockConn.execute.mockResolvedValueOnce([
            [
                {
                    jobProfileRequirementId: 1,
                    location: '{"country":"IN","city":"Mumbai"}',
                },
            ],
        ]);

        const row = await repo.findById(1, mockConn);

        expect(row.location).toEqual({ country: 'IN', city: 'Mumbai' });

        mockConn.execute.mockResolvedValueOnce([[]]);
        await expect(repo.findById(2, mockConn)).resolves.toBeNull();
    });

    it('findById throws when id missing', async () => {
        await expect(repo.findById(null, mockConn)).rejects.toMatchObject({
            errorCode: 'MISSING_JOB_PROFILE_REQUIREMENT_ID',
        });
    });

    const locRow = {
        jobProfileRequirementId: 1,
        jobProfileId: 2,
        jobRole: 'Dev',
        location: '{"country":"IN","city":"Mumbai"}',
    };

    it('update applies allowed fields', async () => {
        mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);

        const out = await repo.update(10, { positions: 3, estimatedCloseDate: '2030-01-01' }, mockConn);

        expect(out.jobProfileRequirementId).toBe(10);
        expect(out.positions).toBe(3);
    });

    it('update returns early when updateData is empty', async () => {
        const out = await repo.update(5, {}, mockConn);
        expect(out).toEqual({ jobProfileRequirementId: 5 });
        expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('delete removes row', async () => {
        mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);
        await expect(repo.delete(7, mockConn)).resolves.toBe(1);
    });

    it('delete throws when no row affected', async () => {
        mockConn.execute.mockResolvedValue([{ affectedRows: 0 }]);
        await expect(repo.delete(999, mockConn)).rejects.toMatchObject({
            errorCode: 'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
        });
    });

    it('findByClientId parses location and supports pagination', async () => {
        mockConn.execute.mockResolvedValue([[locRow]]);

        const rows = await repo.findByClientId(1, 10, 0, mockConn);

        expect(rows).toHaveLength(1);
        expect(rows[0].location).toEqual({ country: 'IN', city: 'Mumbai' });
    });

    it('findByJobProfileId parses location', async () => {
        mockConn.execute.mockResolvedValue([[locRow]]);

        const rows = await repo.findByJobProfileId(2, mockConn);

        expect(rows[0].location.city).toBe('Mumbai');
    });

    it('findByStatus and findByDepartment parse location', async () => {
        mockConn.execute.mockResolvedValue([[locRow]]);

        await expect(repo.findByStatus('st1', mockConn)).resolves.toHaveLength(1);
        await expect(repo.findByDepartment(4, mockConn)).resolves.toHaveLength(1);
    });

    it('countByClient returns numeric count', async () => {
        mockConn.execute.mockResolvedValue([[{ count: 5 }]]);

        await expect(repo.countByClient(1, mockConn)).resolves.toBe(5);
    });

    it('existsByJobProfile respects excludeId', async () => {
        mockConn.execute.mockResolvedValueOnce([[{ count: 1 }]]);
        await expect(repo.existsByJobProfile(1, 2, 3, 99, mockConn)).resolves.toBe(true);

        mockConn.execute.mockResolvedValueOnce([[{ count: 0 }]]);
        await expect(repo.existsByJobProfile(1, 2, 3, null, mockConn)).resolves.toBe(false);
    });

    it('findAll returns rows or null', async () => {
        mockConn.execute.mockResolvedValueOnce([[locRow]]);
        await expect(repo.findAll(5, 0, mockConn)).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ jobProfileRequirementId: 1 })])
        );

        mockConn.execute.mockResolvedValueOnce([[]]);
        await expect(repo.findAll(null, null, mockConn)).resolves.toBeNull();
    });

    it('search applies filters and parses location', async () => {
        mockConn.execute.mockResolvedValue([[locRow]]);

        const rows = await repo.search(
            {
                jobProfileId: 1,
                clientId: 2,
                departmentId: 3,
                locationId: 4,
                statusId: 5,
                workArrangement: 'remote',
                minPositions: 1,
                maxPositions: 10,
                fromDate: '2025-01-01',
                toDate: '2025-12-31',
                limit: 20,
                offset: 0,
            },
            mockConn
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].location.city).toBe('Mumbai');
    });
});
