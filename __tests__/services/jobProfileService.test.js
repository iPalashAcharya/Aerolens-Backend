const JobProfileService = require('../../services/jobProfileService');
const AppError = require('../../utils/appError');

describe('JobProfileService', () => {
    let jobProfileService;
    let mockRepository;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient),
        };

        mockRepository = {
            existsByRole: jest.fn(),
            create: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByClientId: jest.fn(),
            findByStatus: jest.fn(),
            findByDepartment: jest.fn(),
            findAll: jest.fn(),
            countByClient: jest.fn(),
        };

        jobProfileService = new JobProfileService(mockRepository, mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createJobProfile', () => {
        const jobProfileData = {
            jobRole: 'Software Engineer',
            clientId: 'client-123',
            departmentId: 'dept-1',
        };

        it('should create a job profile successfully', async () => {
            const expectedProfile = { id: 'profile-1', ...jobProfileData };
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.create.mockResolvedValue(expectedProfile);

            const result = await jobProfileService.createJobProfile(jobProfileData);

            expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
            expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mockRepository.existsByRole).toHaveBeenCalledWith(
                jobProfileData.jobRole,
                jobProfileData.clientId,
                null,
                mockClient
            );
            expect(mockRepository.create).toHaveBeenCalledWith(jobProfileData, mockClient);
            expect(mockClient.commit).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(result).toEqual(expectedProfile);
        });

        it('should throw AppError when duplicate job role exists', async () => {
            mockRepository.existsByRole.mockResolvedValue(true);

            await expect(jobProfileService.createJobProfile(jobProfileData))
                .rejects
                .toThrow(AppError);

            await expect(jobProfileService.createJobProfile(jobProfileData))
                .rejects
                .toMatchObject({
                    message: 'A job profile with this role already exists for this client',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_JOB_ROLE',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(2);
            expect(mockClient.release).toHaveBeenCalledTimes(2);
            expect(mockRepository.create).not.toHaveBeenCalled();
        });

        it('should rollback transaction and release client on repository error', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.create.mockRejectedValue(dbError);

            await expect(jobProfileService.createJobProfile(jobProfileData))
                .rejects
                .toThrow(dbError);

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(mockClient.commit).not.toHaveBeenCalled();
        });
    });

    describe('getJobProfileById', () => {
        it('should return job profile when found', async () => {
            const expectedProfile = { id: 'profile-1', jobRole: 'Developer' };
            mockRepository.findById.mockResolvedValue(expectedProfile);

            const result = await jobProfileService.getJobProfileById('profile-1');

            expect(mockRepository.findById).toHaveBeenCalledWith('profile-1');
            expect(result).toEqual(expectedProfile);
        });

        it('should throw AppError when job profile not found', async () => {
            mockRepository.findById.mockResolvedValue(null);

            await expect(jobProfileService.getJobProfileById('nonexistent'))
                .rejects
                .toMatchObject({
                    message: 'Job profile with ID nonexistent not found',
                    statusCode: 404,
                    errorCode: 'JOB_PROFILE_NOT_FOUND',
                });
        });
    });

    describe('updateJobProfile', () => {
        const jobProfileId = 'profile-1';
        const existingProfile = {
            id: jobProfileId,
            jobRole: 'Old Role',
            clientId: 'client-123',
        };
        const updateData = { jobRole: 'New Role', description: 'Updated' };

        it('should update job profile successfully', async () => {
            const updatedProfile = { ...existingProfile, ...updateData };
            mockRepository.findById
                .mockResolvedValueOnce(existingProfile)
                .mockResolvedValueOnce(updatedProfile);
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.update.mockResolvedValue(undefined);

            const result = await jobProfileService.updateJobProfile(jobProfileId, updateData);

            expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mockRepository.findById).toHaveBeenCalledWith(jobProfileId, mockClient);
            expect(mockRepository.existsByRole).toHaveBeenCalledWith(
                updateData.jobRole,
                existingProfile.clientId,
                jobProfileId,
                mockClient
            );
            expect(mockRepository.update).toHaveBeenCalledWith(jobProfileId, updateData, mockClient);
            expect(mockClient.commit).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(result).toEqual(updatedProfile);
        });

        it('should throw AppError when job profile not found', async () => {
            mockRepository.findById.mockResolvedValue(null);

            await expect(jobProfileService.updateJobProfile(jobProfileId, updateData))
                .rejects
                .toMatchObject({
                    message: `Job profile with ID ${jobProfileId} not found`,
                    statusCode: 404,
                    errorCode: 'JOB_PROFILE_NOT_FOUND',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should throw AppError when duplicate job role exists', async () => {
            mockRepository.findById.mockResolvedValue(existingProfile);
            mockRepository.existsByRole.mockResolvedValue(true);

            await expect(jobProfileService.updateJobProfile(jobProfileId, updateData))
                .rejects
                .toMatchObject({
                    message: 'A job profile with this role already exists in the database for this client',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_JOB_ROLE',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockRepository.update).not.toHaveBeenCalled();
        });

        it('should skip duplicate check when jobRole not in updateData', async () => {
            const updateDataWithoutRole = { description: 'Updated description' };
            const updatedProfile = { ...existingProfile, ...updateDataWithoutRole };

            mockRepository.findById
                .mockResolvedValueOnce(existingProfile)
                .mockResolvedValueOnce(updatedProfile);
            mockRepository.update.mockResolvedValue(undefined);

            const result = await jobProfileService.updateJobProfile(jobProfileId, updateDataWithoutRole);

            expect(mockRepository.existsByRole).not.toHaveBeenCalled();
            expect(mockRepository.update).toHaveBeenCalledWith(jobProfileId, updateDataWithoutRole, mockClient);
            expect(result).toEqual(updatedProfile);
        });

        it('should rollback transaction on update error', async () => {
            const updateError = new Error('Update failed');
            mockRepository.findById.mockResolvedValue(existingProfile);
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.update.mockRejectedValue(updateError);

            await expect(jobProfileService.updateJobProfile(jobProfileId, updateData))
                .rejects
                .toThrow(updateError);

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('deleteJobProfile', () => {
        const jobProfileId = 'profile-1';
        const existingProfile = { id: jobProfileId, jobRole: 'Developer' };

        it('should delete job profile successfully', async () => {
            mockRepository.findById.mockResolvedValue(existingProfile);
            mockRepository.delete.mockResolvedValue(undefined);

            const result = await jobProfileService.deleteJobProfile(jobProfileId);

            expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mockRepository.findById).toHaveBeenCalledWith(jobProfileId, mockClient);
            expect(mockRepository.delete).toHaveBeenCalledWith(jobProfileId, mockClient);
            expect(mockClient.commit).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ deletedJobProfile: existingProfile });
        });

        it('should throw AppError when job profile not found', async () => {
            mockRepository.findById.mockResolvedValue(null);

            await expect(jobProfileService.deleteJobProfile(jobProfileId))
                .rejects
                .toMatchObject({
                    message: `Job profile with ID ${jobProfileId} not found`,
                    statusCode: 404,
                    errorCode: 'JOB_PROFILE_NOT_FOUND',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockRepository.delete).not.toHaveBeenCalled();
        });

        it('should rollback transaction on delete error', async () => {
            const deleteError = new Error('Delete failed');
            mockRepository.findById.mockResolvedValue(existingProfile);
            mockRepository.delete.mockRejectedValue(deleteError);

            await expect(jobProfileService.deleteJobProfile(jobProfileId))
                .rejects
                .toThrow(deleteError);

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('getJobProfilesByClientId', () => {
        it('should return job profiles for client', async () => {
            const expectedProfiles = [
                { id: 'profile-1', jobRole: 'Developer' },
                { id: 'profile-2', jobRole: 'Designer' },
            ];
            mockRepository.findByClientId.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getJobProfilesByClientId('client-123');

            expect(mockRepository.findByClientId).toHaveBeenCalledWith('client-123', undefined, undefined);
            expect(result).toEqual(expectedProfiles);
        });

        it('should return job profiles with limit and offset', async () => {
            const expectedProfiles = [{ id: 'profile-1', jobRole: 'Developer' }];
            mockRepository.findByClientId.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getJobProfilesByClientId('client-123', { limit: 10, offset: 5 });

            expect(mockRepository.findByClientId).toHaveBeenCalledWith('client-123', 10, 5);
            expect(result).toEqual(expectedProfiles);
        });
    });

    describe('getJobProfilesByStatus', () => {
        it('should return job profiles by status', async () => {
            const expectedProfiles = [{ id: 'profile-1', statusId: 'active' }];
            mockRepository.findByStatus.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getJobProfilesByStatus('active');

            expect(mockRepository.findByStatus).toHaveBeenCalledWith('active');
            expect(result).toEqual(expectedProfiles);
        });
    });

    describe('getJobProfilesByDepartment', () => {
        it('should return job profiles by department', async () => {
            const expectedProfiles = [{ id: 'profile-1', departmentId: 'dept-1' }];
            mockRepository.findByDepartment.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getJobProfilesByDepartment('dept-1');

            expect(mockRepository.findByDepartment).toHaveBeenCalledWith('dept-1');
            expect(result).toEqual(expectedProfiles);
        });
    });

    describe('getAllJobProfiles', () => {
        it('should return all job profiles', async () => {
            const expectedProfiles = [
                { id: 'profile-1', jobRole: 'Developer' },
                { id: 'profile-2', jobRole: 'Designer' },
            ];
            mockRepository.findAll.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getAllJobProfiles();

            expect(mockRepository.findAll).toHaveBeenCalledWith(undefined, undefined);
            expect(result).toEqual(expectedProfiles);
        });

        it('should return all job profiles with pagination options', async () => {
            const expectedProfiles = [{ id: 'profile-1', jobRole: 'Developer' }];
            mockRepository.findAll.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getAllJobProfiles({ limit: 20, offset: 10 });

            expect(mockRepository.findAll).toHaveBeenCalledWith(20, 10);
            expect(result).toEqual(expectedProfiles);
        });
    });

    describe('getJobProfileCount', () => {
        it('should return job profile count for client', async () => {
            mockRepository.countByClient.mockResolvedValue(15);

            const result = await jobProfileService.getJobProfileCount('client-123');

            expect(mockRepository.countByClient).toHaveBeenCalledWith('client-123');
            expect(result).toBe(15);
        });
    });

    describe('getJobProfilesByClientWithPagination', () => {
        it('should return paginated job profiles with default page and size', async () => {
            const mockProfiles = [{ id: 'profile-1', jobRole: 'Developer' }];
            mockRepository.findByClientId.mockResolvedValue(mockProfiles);
            mockRepository.countByClient.mockResolvedValue(25);

            const result = await jobProfileService.getJobProfilesByClientWithPagination('client-123');

            expect(mockRepository.findByClientId).toHaveBeenCalledWith('client-123', 10, 0);
            expect(mockRepository.countByClient).toHaveBeenCalledWith('client-123');
            expect(result).toEqual({
                jobProfiles: mockProfiles,
                pagination: {
                    currentPage: 1,
                    pageSize: 10,
                    totalCount: 25,
                    totalPages: 3,
                    hasNextPage: true,
                    hasPreviousPage: false,
                },
            });
        });

        it('should return paginated job profiles for page 2', async () => {
            const mockProfiles = [{ id: 'profile-2', jobRole: 'Designer' }];
            mockRepository.findByClientId.mockResolvedValue(mockProfiles);
            mockRepository.countByClient.mockResolvedValue(25);

            const result = await jobProfileService.getJobProfilesByClientWithPagination('client-123', 2, 10);

            expect(mockRepository.findByClientId).toHaveBeenCalledWith('client-123', 10, 10);
            expect(result.pagination).toMatchObject({
                currentPage: 2,
                hasNextPage: true,
                hasPreviousPage: true,
            });
        });

        it('should return last page correctly', async () => {
            const mockProfiles = [{ id: 'profile-3', jobRole: 'Manager' }];
            mockRepository.findByClientId.mockResolvedValue(mockProfiles);
            mockRepository.countByClient.mockResolvedValue(25);

            const result = await jobProfileService.getJobProfilesByClientWithPagination('client-123', 3, 10);

            expect(result.pagination).toMatchObject({
                currentPage: 3,
                totalPages: 3,
                hasNextPage: false,
                hasPreviousPage: true,
            });
        });

        it('should handle custom page size', async () => {
            const mockProfiles = [{ id: 'profile-1' }];
            mockRepository.findByClientId.mockResolvedValue(mockProfiles);
            mockRepository.countByClient.mockResolvedValue(100);

            const result = await jobProfileService.getJobProfilesByClientWithPagination('client-123', 1, 25);

            expect(mockRepository.findByClientId).toHaveBeenCalledWith('client-123', 25, 0);
            expect(result.pagination).toMatchObject({
                pageSize: 25,
                totalPages: 4,
            });
        });
    });

    describe('getAllJobProfilesWithPagination', () => {
        it('should return paginated all job profiles', async () => {
            const mockProfiles = Array(10).fill({ id: 'profile-1', jobRole: 'Developer' });
            mockRepository.findAll.mockResolvedValue(mockProfiles);

            const result = await jobProfileService.getAllJobProfilesWithPagination(1, 10);

            expect(mockRepository.findAll).toHaveBeenCalledWith(10, 0);
            expect(result).toEqual({
                jobProfiles: mockProfiles,
                pagination: {
                    currentPage: 1,
                    pageSize: 10,
                    hasNextPage: true,
                    hasPreviousPage: false,
                },
            });
        });

        it('should indicate no next page when fewer results than page size', async () => {
            const mockProfiles = Array(5).fill({ id: 'profile-1', jobRole: 'Developer' });
            mockRepository.findAll.mockResolvedValue(mockProfiles);

            const result = await jobProfileService.getAllJobProfilesWithPagination(2, 10);

            expect(result.pagination.hasNextPage).toBe(false);
        });
    });

    describe('bulkUpdateJobProfiles', () => {
        const jobProfileIds = ['profile-1', 'profile-2', 'profile-3'];
        const updateData = { status: 'active' };

        it('should successfully update all job profiles', async () => {
            mockRepository.update.mockResolvedValue(undefined);

            const result = await jobProfileService.bulkUpdateJobProfiles(jobProfileIds, updateData);

            expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mockRepository.update).toHaveBeenCalledTimes(3);
            jobProfileIds.forEach(id => {
                expect(mockRepository.update).toHaveBeenCalledWith(id, updateData, mockClient);
            });
            expect(mockClient.commit).toHaveBeenCalledTimes(1);
            expect(mockClient.rollback).not.toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                results: [
                    { jobProfileId: 'profile-1', status: 'success' },
                    { jobProfileId: 'profile-2', status: 'success' },
                    { jobProfileId: 'profile-3', status: 'success' },
                ],
                totalProcessed: 3,
                successful: 3,
            });
        });

        it('should rollback and throw error when one update fails', async () => {
            const updateError = new Error('Update failed');
            mockRepository.update
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(updateError)
                .mockResolvedValueOnce(undefined);

            await expect(jobProfileService.bulkUpdateJobProfiles(jobProfileIds, updateData))
                .rejects
                .toMatchObject({
                    message: 'Bulk update failed for some records',
                    statusCode: 400,
                    errorCode: 'BULK_UPDATE_ERROR',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.commit).not.toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should collect all errors and provide detailed results', async () => {
            const error1 = new Error('Error 1');
            const error2 = new Error('Error 2');

            mockRepository.update
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(error1)
                .mockRejectedValueOnce(error2);

            try {
                await jobProfileService.bulkUpdateJobProfiles(jobProfileIds, updateData);
            } catch (error) {
                expect(error.details.results).toHaveLength(3);
                expect(error.details.errors).toHaveLength(2);
                expect(error.details.errors).toEqual([
                    { jobProfileId: 'profile-2', error: 'Error 1' },
                    { jobProfileId: 'profile-3', error: 'Error 2' },
                ]);
            }

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
        });

        it('should handle empty job profile ids array', async () => {
            const result = await jobProfileService.bulkUpdateJobProfiles([], updateData);

            expect(mockClient.commit).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                results: [],
                totalProcessed: 0,
                successful: 0,
            });
        });
    });
});