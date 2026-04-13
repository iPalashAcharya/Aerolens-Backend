const JobProfileRepository = require('../../repositories/jobProfileRepository');
const AppError = require('../../utils/appError');

describe('JobProfileRepository', () => {
    let repository;
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        mockConnection = {
            execute: jest.fn(),
            query: jest.fn(),
            release: jest.fn(),
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
        };

        repository = new JobProfileRepository(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const baseCreatePayload = () => ({
        jobRole: 'Software Engineer',
        jobOverview: 'Overview',
        keyResponsibilities: 'Responsibilities',
        requiredSkillsText: 'Skills',
        niceToHave: 'Nice',
        experienceText: '5+ years',
        experienceMinYears: 3,
        experienceMaxYears: 7,
    });

    describe('create', () => {
        it('should create job profile and return insert id with data', async () => {
            const data = baseCreatePayload();
            mockConnection.execute.mockResolvedValue([{ insertId: 101 }]);

            const result = await repository.create(data, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO jobProfile'),
                [
                    data.jobRole,
                    data.jobOverview,
                    data.keyResponsibilities,
                    data.requiredSkillsText,
                    data.niceToHave,
                    data.experienceText,
                    data.experienceMinYears,
                    data.experienceMaxYears,
                ]
            );
            expect(result).toMatchObject({
                jobProfileId: 101,
                ...data,
            });
            expect(result.createdAt).toBeInstanceOf(Date);
        });

        it('should use null for optional text fields when omitted', async () => {
            const data = { jobRole: 'Role Only' };
            mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

            await repository.create(data, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(expect.any(String), [
                'Role Only',
                null,
                null,
                null,
                null,
                null,
                null,
                null,
            ]);
        });

        it('should map duplicate entry to AppError', async () => {
            const data = baseCreatePayload();
            mockConnection.execute.mockRejectedValue({ code: 'ER_DUP_ENTRY', message: 'dup' });

            await expect(repository.create(data, mockConnection)).rejects.toMatchObject({
                message: 'A job profile with this role already exists',
                statusCode: 409,
                errorCode: 'DUPLICATE_ENTRY',
            });
        });
    });

    describe('addTechSpecifications', () => {
        it('should insert tech specs using bulk query', async () => {
            mockConnection.query.mockResolvedValue();

            await repository.addTechSpecifications(5, [10, 11], mockConnection);

            expect(mockConnection.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO jobProfileTechSpec'),
                [[[5, 10], [5, 11]]]
            );
        });

        it('should no-op when lookupIds empty', async () => {
            await repository.addTechSpecifications(5, [], mockConnection);
            expect(mockConnection.query).not.toHaveBeenCalled();
        });
    });

    describe('removeTechSpecifications', () => {
        it('should delete rows for job profile', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 2 }]);

            await repository.removeTechSpecifications(9, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM jobProfileTechSpec'),
                [9]
            );
        });
    });

    describe('getTechSpecifications', () => {
        it('should return rows from join', async () => {
            const rows = [{ lookupId: 1, techSpecName: 'Node' }];
            mockConnection.execute.mockResolvedValue([rows]);

            const result = await repository.getTechSpecifications(3, mockConnection);

            expect(result).toEqual(rows);
        });
    });

    describe('findById', () => {
        it('should group job profile with tech specifications', async () => {
            const rows = [
                {
                    jobProfileId: 1,
                    jobRole: 'Dev',
                    jobOverview: 'o',
                    keyResponsibilities: 'k',
                    requiredSkillsText: 'r',
                    niceToHave: 'n',
                    experienceText: 'e',
                    experienceMinYears: 1,
                    experienceMaxYears: 2,
                    jdFileName: null,
                    jdOriginalName: null,
                    jdUploadDate: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    techSpecId: 10,
                    techSpecName: 'TS1',
                },
                {
                    jobProfileId: 1,
                    jobRole: 'Dev',
                    jobOverview: 'o',
                    keyResponsibilities: 'k',
                    requiredSkillsText: 'r',
                    niceToHave: 'n',
                    experienceText: 'e',
                    experienceMinYears: 1,
                    experienceMaxYears: 2,
                    jdFileName: null,
                    jdOriginalName: null,
                    jdUploadDate: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    techSpecId: 11,
                    techSpecName: 'TS2',
                },
            ];
            mockConnection.execute.mockResolvedValue([rows]);

            const result = await repository.findById(1, mockConnection);

            expect(result.jobProfileId).toBe(1);
            expect(result.techSpecifications).toEqual([
                { lookupId: 10, value: 'TS1' },
                { lookupId: 11, value: 'TS2' },
            ]);
        });

        it('should return null when not found', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await repository.findById(99, mockConnection);

            expect(result).toBeNull();
        });

        it('should throw when jobProfileId missing', async () => {
            await expect(repository.findById(null, mockConnection)).rejects.toMatchObject({
                errorCode: 'MISSING_JOB_PROFILE_ID',
            });
        });
    });

    describe('findByRole', () => {
        it('should return first matching row', async () => {
            mockConnection.execute.mockResolvedValue([[{ jobProfileId: 3, jobRole: 'X' }]]);

            const result = await repository.findByRole('X', null, mockConnection);

            expect(result).toEqual({ jobProfileId: 3, jobRole: 'X' });
        });

        it('should add exclude clause when excludeId set', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await repository.findByRole('X', 5, mockConnection);

            const [q, p] = mockConnection.execute.mock.calls[0];
            expect(q).toContain('jobProfileId != ?');
            expect(p).toEqual(['X', 5]);
        });

        it('should throw when jobRole missing', async () => {
            await expect(repository.findByRole(null, null, mockConnection)).rejects.toMatchObject({
                errorCode: 'MISSING_JOB_ROLE',
            });
        });
    });

    describe('update', () => {
        const id = 12;
        const base = { jobRole: 'New Role' };

        it('should update allowed fields', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await repository.update(id, base, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE jobProfile SET'),
                ['New Role', id]
            );
            expect(result).toMatchObject({ jobProfileId: id, jobRole: 'New Role' });
        });

        it('should return only jobProfileId when updateData missing or empty', async () => {
            await expect(repository.update(id, null, mockConnection)).resolves.toEqual({ jobProfileId: id });
            await expect(repository.update(id, {}, mockConnection)).resolves.toEqual({ jobProfileId: id });
        });

        it('should throw NO_VALID_FIELDS when only invalid keys', async () => {
            await expect(
                repository.update(id, { unknown: 1 }, mockConnection)
            ).rejects.toMatchObject({ errorCode: 'NO_VALID_FIELDS' });
        });

        it('should refresh tech specs when techSpecLookupIds provided', async () => {
            jest.spyOn(repository, 'removeTechSpecifications').mockResolvedValue();
            jest.spyOn(repository, 'addTechSpecifications').mockResolvedValue();
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await repository.update(id, { jobRole: 'R', techSpecLookupIds: [1, 2] }, mockConnection);

            expect(repository.removeTechSpecifications).toHaveBeenCalledWith(id, mockConnection);
            expect(repository.addTechSpecifications).toHaveBeenCalledWith(id, [1, 2], mockConnection);
        });
    });

    describe('delete', () => {
        it('should delete by id', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const n = await repository.delete(4, mockConnection);

            expect(n).toBe(1);
        });
    });

    describe('findAll', () => {
        it('should return grouped profiles ordered by createdAt DESC', async () => {
            const rows = [
                {
                    jobProfileId: 1,
                    jobRole: 'A',
                    jobOverview: null,
                    keyResponsibilities: null,
                    requiredSkillsText: null,
                    niceToHave: null,
                    experienceText: null,
                    experienceMinYears: null,
                    experienceMaxYears: null,
                    jdFileName: null,
                    jdOriginalName: null,
                    jdUploadDate: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    techSpecId: null,
                    techSpecName: null,
                },
            ];
            mockConnection.execute.mockResolvedValue([rows]);

            const result = await repository.findAll(null, null, mockConnection);

            const [q] = mockConnection.execute.mock.calls[0];
            expect(q).toContain('ORDER BY jp.createdAt DESC');
            expect(Array.isArray(result)).toBe(true);
        });

        it('should apply LIMIT and OFFSET when provided', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await repository.findAll(5, 10, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(expect.any(String), [5, 10]);
        });
    });

    describe('count', () => {
        it('should return total count', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 42 }]]);

            const c = await repository.count(mockConnection);

            expect(c).toBe(42);
        });
    });

    describe('existsByRole', () => {
        it('should return boolean from count', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 1 }]]);

            await expect(repository.existsByRole('R', null, mockConnection)).resolves.toBe(true);
        });

        it('should throw when jobRole missing', async () => {
            await expect(repository.existsByRole(null, null, mockConnection)).rejects.toMatchObject({
                errorCode: 'MISSING_JOB_ROLE',
            });
        });
    });

    describe('updateJDInfo / getJDInfo / deleteJDInfo', () => {
        it('updateJDInfo updates file fields', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const n = await repository.updateJDInfo(1, 'a.pdf', 'A.pdf', mockConnection);

            expect(n).toBe(1);
        });

        it('getJDInfo returns row or null', async () => {
            mockConnection.execute.mockResolvedValue([[{ jdFileName: 'a.pdf' }]]);

            await expect(repository.getJDInfo(1, mockConnection)).resolves.toEqual({ jdFileName: 'a.pdf' });
            mockConnection.execute.mockResolvedValue([[]]);
            await expect(repository.getJDInfo(1, mockConnection)).resolves.toBeNull();
        });

        it('deleteJDInfo clears jd fields', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const n = await repository.deleteJDInfo(1, mockConnection);

            expect(n).toBe(1);
        });
    });

    describe('_handleDatabaseError', () => {
        it('should map known mysql codes to AppError', () => {
            const errDup = { code: 'ER_DUP_ENTRY', message: 'd' };
            expect(() => repository._handleDatabaseError(errDup)).toThrow(AppError);

            try {
                repository._handleDatabaseError({ code: 'ER_DATA_TOO_LONG', message: 'm' });
            } catch (e) {
                expect(e.errorCode).toBe('DATA_TOO_LONG');
            }
        });
    });
});
