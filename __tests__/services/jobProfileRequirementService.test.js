const JobProfileRequirementService = require('../../services/jobProfileRequirementService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('JobProfileRequirementService', () => {
    let service;
    let mockRepo;
    let mockClient;
    let mockDb;

    const audit = {
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
            create: jest.fn(),
            findById: jest.fn(),
            existsByJobProfile: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByClientId: jest.fn(),
            findByJobProfileId: jest.fn(),
            findByStatus: jest.fn(),
            findByDepartment: jest.fn(),
            findAll: jest.fn(),
            search: jest.fn(),
            countByClient: jest.fn(),
        };
        service = new JobProfileRequirementService(mockRepo, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    const sampleRow = {
        jobProfileRequirementId: 5,
        jobProfileId: 1,
        clientId: 10,
        departmentId: 2,
        status: 'Open',
    };

    it('createJobProfileRequirement commits and returns findById', async () => {
        mockRepo.create.mockResolvedValue({ jobProfileRequirementId: 5 });
        mockRepo.findById.mockResolvedValue(sampleRow);

        const out = await service.createJobProfileRequirement(
            {
                jobProfileId: 1,
                clientId: 1,
                departmentId: 1,
                positions: 1,
                statusId: 1,
            },
            audit
        );

        expect(out.jobProfileRequirementId).toBe(5);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('getJobProfileRequirementById throws when missing', async () => {
        mockRepo.findById.mockResolvedValue(null);

        await expect(service.getJobProfileRequirementById(9)).rejects.toMatchObject({
            errorCode: 'JOB_PROFILE_REQUIREMENT_NOT_FOUND',
        });
    });

    it('getJobProfileRequirementById returns row', async () => {
        mockRepo.findById.mockResolvedValue(sampleRow);

        await expect(service.getJobProfileRequirementById(5)).resolves.toEqual(sampleRow);
    });

    it('updateJobProfileRequirement rolls back on update error', async () => {
        mockRepo.findById.mockResolvedValue(sampleRow);
        mockRepo.update.mockRejectedValue(new Error('db'));

        await expect(
            service.updateJobProfileRequirement(5, { positions: 2 }, audit)
        ).rejects.toMatchObject({ errorCode: 'JOB_PROFILE_REQUIREMENT_UPDATE_ERROR' });
        expect(mockClient.rollback).toHaveBeenCalled();
    });

    it('updateJobProfileRequirement commits when successful', async () => {
        mockRepo.findById
            .mockResolvedValueOnce(sampleRow)
            .mockResolvedValueOnce({ ...sampleRow, positions: 3 });
        mockRepo.update.mockResolvedValue({ ...sampleRow, positions: 3 });

        const out = await service.updateJobProfileRequirement(5, { positions: 3 }, audit);

        expect(out.positions).toBe(3);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('deleteJobProfileRequirement commits', async () => {
        mockRepo.findById.mockResolvedValue(sampleRow);
        mockRepo.delete.mockResolvedValue(undefined);

        const out = await service.deleteJobProfileRequirement(5, audit);

        expect(out.deletedJobProfileRequirement).toEqual(sampleRow);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('getJobProfileRequirementsByClientId delegates', async () => {
        mockRepo.findByClientId.mockResolvedValue([]);

        await expect(service.getJobProfileRequirementsByClientId(1, { limit: 5 })).resolves.toEqual([]);
    });

    it('getJobProfileRequirementsByJobProfileId delegates', async () => {
        mockRepo.findByJobProfileId.mockResolvedValue([]);

        await expect(service.getJobProfileRequirementsByJobProfileId(3)).resolves.toEqual([]);
    });

    it('getJobProfileRequirementsByStatus delegates', async () => {
        mockRepo.findByStatus.mockResolvedValue([]);

        await expect(service.getJobProfileRequirementsByStatus(2)).resolves.toEqual([]);
    });

    it('getJobProfileRequirementsByDepartment delegates', async () => {
        mockRepo.findByDepartment.mockResolvedValue([]);

        await expect(service.getJobProfileRequirementsByDepartment(4)).resolves.toEqual([]);
    });

    it('getAllJobProfileRequirements delegates', async () => {
        mockRepo.findAll.mockResolvedValue([]);

        await expect(service.getAllJobProfileRequirements()).resolves.toEqual([]);
    });

    it('searchJobProfileRequirements delegates', async () => {
        mockRepo.search.mockResolvedValue([]);

        await expect(service.searchJobProfileRequirements({ q: 'x' })).resolves.toEqual([]);
    });

    it('getJobProfileRequirementCount delegates', async () => {
        mockRepo.countByClient.mockResolvedValue(7);

        await expect(service.getJobProfileRequirementCount(1)).resolves.toBe(7);
    });

    it('getJobProfileRequirementsByClientWithPagination returns pagination', async () => {
        mockRepo.findByClientId.mockResolvedValue([sampleRow]);
        mockRepo.countByClient.mockResolvedValue(1);

        const out = await service.getJobProfileRequirementsByClientWithPagination(1, 1, 10);

        expect(out.jobProfileRequirements).toHaveLength(1);
        expect(out.pagination.totalCount).toBe(1);
    });

    it('getAllJobProfileRequirementsWithPagination returns rows', async () => {
        mockRepo.findAll.mockResolvedValue([sampleRow]);

        const out = await service.getAllJobProfileRequirementsWithPagination(1, 20);

        expect(out.jobProfileRequirements).toHaveLength(1);
        expect(out.pagination.hasPreviousPage).toBe(false);
    });

    it('bulkUpdateJobProfileRequirements commits when all succeed', async () => {
        mockRepo.findById.mockResolvedValue(sampleRow);
        mockRepo.update.mockResolvedValue({});

        const out = await service.bulkUpdateJobProfileRequirements([5], { statusId: 3 }, audit);

        expect(out.successful).toBe(1);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('bulkUpdateJobProfileRequirement rolls back when one fails', async () => {
        mockRepo.findById.mockResolvedValue(null);

        await expect(
            service.bulkUpdateJobProfileRequirements([99], { statusId: 3 }, audit)
        ).rejects.toMatchObject({ errorCode: 'BULK_UPDATE_ERROR' });
        expect(mockClient.rollback).toHaveBeenCalled();
    });
});
