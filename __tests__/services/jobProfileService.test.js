// jobProfileService reads S3 bucket at module load; set before require
process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
    DeleteObjectCommand: jest.fn((input) => input),
    HeadObjectCommand: jest.fn((input) => input),
    GetObjectCommand: jest.fn((input) => input),
    CopyObjectCommand: jest.fn((input) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/download'),
}));

const JobProfileService = require('../../services/jobProfileService');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

const auditLogService = require('../../services/auditLogService');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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
            findAll: jest.fn(),
            count: jest.fn(),
            addTechSpecifications: jest.fn(),
            getJDInfo: jest.fn(),
            updateJDInfo: jest.fn(),
            deleteJDInfo: jest.fn(),
        };

        jobProfileService = new JobProfileService(mockRepository, mockDb);
        if (jobProfileService.s3Client && jobProfileService.s3Client.send) {
            jobProfileService.s3Client.send.mockReset();
        }
        getSignedUrl.mockResolvedValue('https://signed.example/download');
    });

    afterEach(() => {
        jest.clearAllMocks();
        getSignedUrl.mockResolvedValue('https://signed.example/download');
    });

    describe('createJobProfile', () => {
        const jobProfileData = {
            jobRole: 'Software Engineer',
            clientId: 'client-123',
            departmentId: 'dept-1',
        };

        it('should create a job profile successfully', async () => {
            const expectedProfile = { jobProfileId: 'profile-1', ...jobProfileData };
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.create.mockResolvedValue(expectedProfile);

            const result = await jobProfileService.createJobProfile(jobProfileData);

            expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
            expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mockRepository.existsByRole).toHaveBeenCalledWith(
                jobProfileData.jobRole,
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
                .toMatchObject({
                    message: 'A job profile with this role already exists',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_JOB_ROLE',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(mockRepository.create).not.toHaveBeenCalled();
        });

        it('should wrap repository error in AppError and rollback', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.create.mockRejectedValue(dbError);

            await expect(jobProfileService.createJobProfile(jobProfileData))
                .rejects
                .toMatchObject({
                    message: 'Failed to create job profile',
                    statusCode: 500,
                    errorCode: 'JOB_PROFILE_CREATION_ERROR',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
            expect(mockClient.commit).not.toHaveBeenCalled();
        });

        it('should add technical specifications when techSpecLookupIds provided', async () => {
            const dataWithSpecs = {
                ...jobProfileData,
                techSpecLookupIds: ['spec-1', 'spec-2'],
            };
            const created = { jobProfileId: 'jp-1', ...jobProfileData };
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.create.mockResolvedValue(created);
            mockRepository.addTechSpecifications.mockResolvedValue(undefined);

            await jobProfileService.createJobProfile(dataWithSpecs);

            expect(mockRepository.addTechSpecifications).toHaveBeenCalledWith(
                'jp-1',
                ['spec-1', 'spec-2'],
                mockClient
            );
        });
    });

    describe('getJobProfileById', () => {
        it('should return job profile when found', async () => {
            const expectedProfile = { jobProfileId: 'profile-1', jobRole: 'Developer' };
            mockRepository.findById.mockResolvedValue(expectedProfile);

            const result = await jobProfileService.getJobProfileById('profile-1');

            expect(mockRepository.findById).toHaveBeenCalledWith('profile-1', mockClient);
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
            jobProfileId,
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
                    message: 'A job profile with this role already exists',
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

        it('should wrap update error in AppError and rollback', async () => {
            const updateError = new Error('Update failed');
            mockRepository.findById.mockResolvedValue(existingProfile);
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.update.mockRejectedValue(updateError);

            await expect(jobProfileService.updateJobProfile(jobProfileId, updateData))
                .rejects
                .toMatchObject({
                    message: 'Failed to Update job profile',
                    statusCode: 500,
                    errorCode: 'JOB_PROFILE_UPDATE_ERROR',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('deleteJobProfile', () => {
        const jobProfileId = 'profile-1';
        const existingProfile = { jobProfileId, jobRole: 'Developer' };

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

        it('should wrap delete error in AppError and rollback', async () => {
            const deleteError = new Error('Delete failed');
            mockRepository.findById.mockResolvedValue(existingProfile);
            mockRepository.delete.mockRejectedValue(deleteError);

            await expect(jobProfileService.deleteJobProfile(jobProfileId))
                .rejects
                .toMatchObject({
                    message: 'Failed to Delete job profile',
                    statusCode: 500,
                    errorCode: 'JOB_PROFILE_DELETE_ERROR',
                });

            expect(mockClient.rollback).toHaveBeenCalledTimes(1);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('getAllJobProfiles', () => {
        it('should return all job profiles', async () => {
            const expectedProfiles = [
                { jobProfileId: 'profile-1', jobRole: 'Developer' },
                { jobProfileId: 'profile-2', jobRole: 'Designer' },
            ];
            mockRepository.findAll.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getAllJobProfiles();

            expect(mockRepository.findAll).toHaveBeenCalledWith(undefined, undefined, mockClient);
            expect(result).toEqual(expectedProfiles);
        });

        it('should return all job profiles with pagination options', async () => {
            const expectedProfiles = [{ jobProfileId: 'profile-1', jobRole: 'Developer' }];
            mockRepository.findAll.mockResolvedValue(expectedProfiles);

            const result = await jobProfileService.getAllJobProfiles({ limit: 20, offset: 10 });

            expect(mockRepository.findAll).toHaveBeenCalledWith(20, 10, mockClient);
            expect(result).toEqual(expectedProfiles);
        });
    });

    describe('getJobProfileCount', () => {
        it('should return total job profile count', async () => {
            mockRepository.count.mockResolvedValue(15);

            const result = await jobProfileService.getJobProfileCount();

            expect(mockRepository.count).toHaveBeenCalledWith(mockClient);
            expect(result).toBe(15);
        });
    });

    describe('getAllJobProfilesWithPagination', () => {
        it('should return paginated all job profiles', async () => {
            const mockProfiles = Array(10).fill({ jobProfileId: 'profile-1', jobRole: 'Developer' });
            mockRepository.findAll.mockResolvedValue(mockProfiles);
            mockRepository.count.mockResolvedValue(42);

            const result = await jobProfileService.getAllJobProfilesWithPagination(1, 10);

            expect(mockRepository.findAll).toHaveBeenCalledWith(10, 0, mockClient);
            expect(mockRepository.count).toHaveBeenCalledWith(mockClient);
            expect(result).toEqual({
                jobProfiles: mockProfiles,
                pagination: {
                    currentPage: 1,
                    pageSize: 10,
                    totalCount: 42,
                    totalPages: 5,
                    hasNextPage: true,
                    hasPreviousPage: false,
                },
            });
        });

        it('should indicate no next page on last page', async () => {
            const mockProfiles = Array(5).fill({ jobProfileId: 'profile-1', jobRole: 'Developer' });
            mockRepository.findAll.mockResolvedValue(mockProfiles);
            mockRepository.count.mockResolvedValue(15);

            const result = await jobProfileService.getAllJobProfilesWithPagination(2, 10);

            expect(result.pagination).toMatchObject({
                currentPage: 2,
                hasNextPage: false,
                hasPreviousPage: true,
            });
        });

        it('should wrap unexpected errors', async () => {
            mockRepository.findAll.mockRejectedValue(new Error('db'));

            await expect(jobProfileService.getAllJobProfilesWithPagination(1, 10)).rejects.toMatchObject({
                errorCode: 'JOB_PROFILE_FETCH_ERROR',
            });
        });
    });

    describe('S3 helpers', () => {
        it('deleteFromS3 should send DeleteObjectCommand', async () => {
            jobProfileService.s3Client.send.mockResolvedValue({});

            await jobProfileService.deleteFromS3('folder/key.pdf');

            expect(jobProfileService.s3Client.send).toHaveBeenCalled();
        });

        it('deleteFromS3 should wrap failures', async () => {
            jobProfileService.s3Client.send.mockRejectedValue(new Error('aws'));

            await expect(jobProfileService.deleteFromS3('k')).rejects.toMatchObject({
                errorCode: 'S3_DELETE_ERROR',
            });
        });

        it('fileExistsInS3 returns true on HeadObject success', async () => {
            jobProfileService.s3Client.send.mockResolvedValue({});

            await expect(jobProfileService.fileExistsInS3('k')).resolves.toBe(true);
        });

        it('fileExistsInS3 returns false when NotFound', async () => {
            const err = new Error('nf');
            err.name = 'NotFound';
            jobProfileService.s3Client.send.mockRejectedValue(err);

            await expect(jobProfileService.fileExistsInS3('k')).resolves.toBe(false);
        });

        it('fileExistsInS3 returns false on HTTP 404 metadata', async () => {
            jobProfileService.s3Client.send.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });

            await expect(jobProfileService.fileExistsInS3('k')).resolves.toBe(false);
        });

        it('fileExistsInS3 rethrows unexpected errors', async () => {
            jobProfileService.s3Client.send.mockRejectedValue(new Error('other'));

            await expect(jobProfileService.fileExistsInS3('k')).rejects.toThrow('other');
        });

        it('generatePresignedUrl returns signed URL', async () => {
            jobProfileService.s3Client.send.mockResolvedValue({});

            const url = await jobProfileService.generatePresignedUrl('key', 60);

            expect(url).toBe('https://signed.example/download');
            expect(getSignedUrl).toHaveBeenCalled();
        });

        it('generatePresignedUrl wraps errors', async () => {
            getSignedUrl.mockRejectedValueOnce(new Error('sign fail'));

            await expect(jobProfileService.generatePresignedUrl('k')).rejects.toMatchObject({
                errorCode: 'S3_URL_ERROR',
            });
        });

        it('getS3FileMetadata returns mapped fields', async () => {
            jobProfileService.s3Client.send.mockResolvedValue({
                ContentType: 'application/pdf',
                ContentLength: 12,
                LastModified: new Date('2020-01-01'),
                Metadata: { a: '1' },
            });

            const meta = await jobProfileService.getS3FileMetadata('k');

            expect(meta.contentType).toBe('application/pdf');
            expect(meta.contentLength).toBe(12);
        });

        it('getS3FileMetadata wraps errors', async () => {
            jobProfileService.s3Client.send.mockRejectedValue(new Error('head'));

            await expect(jobProfileService.getS3FileMetadata('k')).rejects.toMatchObject({
                errorCode: 'S3_METADATA_ERROR',
            });
        });

        it('renameS3File copies and deletes', async () => {
            jobProfileService.s3Client.send.mockResolvedValue({});

            const out = await jobProfileService.renameS3File('old-key', 5, 'My Doc!.pdf');

            expect(out.newKey).toContain('jobProfile_5_');
            expect(jobProfileService.s3Client.send).toHaveBeenCalledTimes(2);
        });

        it('renameS3File cleans up old key when copy fails', async () => {
            jobProfileService.s3Client.send
                .mockRejectedValueOnce(new Error('copy failed'))
                .mockResolvedValueOnce({});

            await expect(
                jobProfileService.renameS3File('temp-old', 1, 'a.pdf')
            ).rejects.toMatchObject({ errorCode: 'S3_RENAME_ERROR' });

            expect(jobProfileService.s3Client.send).toHaveBeenCalled();
        });
    });

    describe('uploadJD', () => {
        const file = {
            key: 'jd/new.pdf',
            originalname: 'orig.pdf',
            size: 100,
            location: 's3',
        };

        it('should persist JD metadata on success', async () => {
            mockRepository.findById.mockResolvedValue({ jobProfileId: 'jp1' });
            mockRepository.getJDInfo.mockResolvedValue(null);
            mockRepository.updateJDInfo.mockResolvedValue(undefined);

            const out = await jobProfileService.uploadJD('jp1', file);

            expect(out.filename).toBe(file.key);
            expect(mockRepository.updateJDInfo).toHaveBeenCalledWith('jp1', file.key, file.originalname, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
        });

        it('should delete uploaded key when profile missing', async () => {
            mockRepository.findById.mockResolvedValue(null);
            jobProfileService.s3Client.send.mockResolvedValue({});

            await expect(jobProfileService.uploadJD('missing', file)).rejects.toMatchObject({
                errorCode: 'JOB_PROFILE_NOT_FOUND',
            });

            expect(jobProfileService.s3Client.send).toHaveBeenCalled();
        });

        it('should continue when deleting old JD from S3 fails', async () => {
            mockRepository.findById.mockResolvedValue({ jobProfileId: '1' });
            mockRepository.getJDInfo.mockResolvedValue({ jdFileName: 'old.pdf' });
            mockRepository.updateJDInfo.mockResolvedValue(undefined);
            jobProfileService.s3Client.send.mockRejectedValue(new Error('del old'));

            const out = await jobProfileService.uploadJD('1', file);

            expect(out.jobProfileId).toBe('1');
            expect(mockClient.commit).toHaveBeenCalled();
        });

        it('should rollback and delete new key on generic error', async () => {
            mockRepository.findById.mockResolvedValue({ jobProfileId: '1' });
            mockRepository.getJDInfo.mockResolvedValue(null);
            mockRepository.updateJDInfo.mockRejectedValue(new Error('db'));
            jobProfileService.s3Client.send.mockResolvedValue({});

            await expect(jobProfileService.uploadJD('1', file)).rejects.toMatchObject({
                errorCode: 'JD_UPLOAD_ERROR',
            });

            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('downloadJD', () => {
        it('should return metadata when file exists', async () => {
            mockRepository.findById.mockResolvedValue({ jobProfileId: '1' });
            mockRepository.getJDInfo.mockResolvedValue({
                jdFileName: 'k.pdf',
                jdOriginalName: 'orig.pdf',
                jdUploadDate: new Date(),
            });
            jobProfileService.s3Client.send.mockResolvedValue({
                ContentType: 'application/pdf',
                ContentLength: 9,
            });

            const out = await jobProfileService.downloadJD('1');

            expect(out.s3Key).toBe('k.pdf');
            expect(out.contentType).toBe('application/pdf');
        });

        it('should 404 when profile missing', async () => {
            mockRepository.findById.mockResolvedValue(null);

            await expect(jobProfileService.downloadJD('x')).rejects.toMatchObject({
                errorCode: 'JOB_PROFILE_NOT_FOUND',
            });
        });

        it('should 404 when no JD row', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue(null);

            await expect(jobProfileService.downloadJD('1')).rejects.toMatchObject({ errorCode: 'JD_NOT_FOUND' });
        });

        it('should 404 when object missing in S3', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue({ jdFileName: 'k' });
            jobProfileService.s3Client.send.mockRejectedValue({ name: 'NotFound' });

            await expect(jobProfileService.downloadJD('1')).rejects.toMatchObject({
                errorCode: 'JD_FILE_NOT_FOUND',
            });
        });

        it('should wrap unexpected errors', async () => {
            mockRepository.findById.mockRejectedValue(new Error('db'));

            await expect(jobProfileService.downloadJD('1')).rejects.toMatchObject({
                errorCode: 'JD_DOWNLOAD_ERROR',
            });
        });
    });

    describe('getJDPresignedUrl', () => {
        it('should return URL payload', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue({
                jdFileName: 'k',
                jdOriginalName: 'o.pdf',
            });
            jobProfileService.s3Client.send.mockResolvedValue({});

            const out = await jobProfileService.getJDPresignedUrl('1', 120);

            expect(out.downloadUrl).toBe('https://signed.example/download');
            expect(out.expiresIn).toBe(120);
        });

        it('should wrap unexpected errors', async () => {
            mockRepository.findById.mockRejectedValue(new Error('x'));

            await expect(jobProfileService.getJDPresignedUrl('1')).rejects.toMatchObject({
                errorCode: 'PRESIGNED_URL_ERROR',
            });
        });
    });

    describe('deleteJD', () => {
        it('should delete from S3 and clear DB row', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue({ jdFileName: 'k' });
            mockRepository.deleteJDInfo.mockResolvedValue(undefined);
            jobProfileService.s3Client.send.mockResolvedValue({});

            const out = await jobProfileService.deleteJD('1');

            expect(out.deletedFile).toBe('k');
            expect(mockRepository.deleteJDInfo).toHaveBeenCalledWith('1', mockClient);
        });

        it('should continue when S3 delete fails', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue({ jdFileName: 'k' });
            mockRepository.deleteJDInfo.mockResolvedValue(undefined);
            jobProfileService.s3Client.send.mockRejectedValue(new Error('s3'));

            const out = await jobProfileService.deleteJD('1');

            expect(out.message).toMatch(/deleted/i);
        });

        it('should wrap DB errors', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue({ jdFileName: 'k' });
            mockRepository.deleteJDInfo.mockRejectedValue(new Error('db'));

            await expect(jobProfileService.deleteJD('1')).rejects.toMatchObject({ errorCode: 'JD_DELETE_ERROR' });
        });
    });

    describe('getJDInfo (service)', () => {
        it('should describe whether JD exists', async () => {
            mockRepository.findById.mockResolvedValue({});
            mockRepository.getJDInfo.mockResolvedValue({ jdFileName: 'x', jdOriginalName: 'a', jdUploadDate: null });

            const out = await jobProfileService.getJDInfo('1');

            expect(out.hasJD).toBe(true);
            expect(out.s3Key).toBe('x');
        });

        it('should wrap errors', async () => {
            mockRepository.findById.mockRejectedValue(new Error('e'));

            await expect(jobProfileService.getJDInfo('1')).rejects.toMatchObject({ errorCode: 'JD_FETCH_ERROR' });
        });
    });

    describe('updateJobProfileJDInfo', () => {
        it('should run transactional update', async () => {
            mockRepository.updateJDInfo.mockResolvedValue(undefined);

            await jobProfileService.updateJobProfileJDInfo('1', {
                jdFileName: 'k',
                jdOriginalName: 'o.pdf',
            });

            expect(mockClient.commit).toHaveBeenCalled();
        });

        it('should wrap errors', async () => {
            mockRepository.updateJDInfo.mockRejectedValue(new Error('db'));

            await expect(
                jobProfileService.updateJobProfileJDInfo('1', { jdFileName: 'k', jdOriginalName: 'o' })
            ).rejects.toMatchObject({ errorCode: 'JD_UPDATE_ERROR' });
        });
    });

    describe('createJobProfile with auditContext', () => {
        const data = { jobRole: 'R', clientId: 'c', departmentId: 'd' };

        it('should log audit when context provided', async () => {
            mockRepository.existsByRole.mockResolvedValue(false);
            mockRepository.create.mockResolvedValue({ jobProfileId: 'jp-1', jobRole: 'R' });
            const ctx = { userId: 9, ipAddress: '1.1.1.1', userAgent: 'ua', timestamp: new Date() };

            await jobProfileService.createJobProfile(data, ctx);

            expect(auditLogService.logAction).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 9, action: 'CREATE' }),
                mockClient
            );
        });
    });

    describe('updateJobProfile with auditContext', () => {
        it('should log audit on update', async () => {
            const existing = { jobProfileId: '1', jobRole: 'Old' };
            const updated = { jobProfileId: '1', jobRole: 'New' };
            mockRepository.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
            mockRepository.update.mockResolvedValue(updated);
            const ctx = { userId: 2, ipAddress: '::1', userAgent: 'jest', timestamp: new Date() };

            await jobProfileService.updateJobProfile('1', { jobRole: 'New' }, ctx);

            expect(auditLogService.logAction).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'UPDATE', oldValues: existing }),
                mockClient
            );
        });
    });

    describe('deleteJobProfile with auditContext', () => {
        it('should log audit on delete', async () => {
            const prof = { jobProfileId: '1', jobRole: 'X' };
            mockRepository.findById.mockResolvedValue(prof);
            mockRepository.delete.mockResolvedValue(undefined);
            const ctx = { userId: 3, ipAddress: '0.0.0.0', userAgent: 'ua', timestamp: new Date() };

            await jobProfileService.deleteJobProfile('1', ctx);

            expect(auditLogService.logAction).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'DELETE', oldValues: prof }),
                mockClient
            );
        });
    });

    describe('getAllJobProfiles error path', () => {
        it('should wrap repository errors', async () => {
            mockRepository.findAll.mockRejectedValue(new Error('db'));

            await expect(jobProfileService.getAllJobProfiles()).rejects.toMatchObject({
                errorCode: 'JOB_PROFILE_FETCH_ERROR',
            });
        });
    });

    describe('getJobProfileCount error path', () => {
        it('should wrap repository errors', async () => {
            mockRepository.count.mockRejectedValue(new Error('db'));

            await expect(jobProfileService.getJobProfileCount()).rejects.toMatchObject({
                errorCode: 'JOB_PROFILE_COUNT_ERROR',
            });
        });
    });

    describe('getJobProfileById error path', () => {
        it('should wrap non-AppError failures', async () => {
            mockRepository.findById.mockRejectedValue(new Error('db'));

            await expect(jobProfileService.getJobProfileById('1')).rejects.toMatchObject({
                errorCode: 'JOB_PROFILE_FETCH_ERROR',
            });
        });
    });

    describe('multer upload wiring', () => {
        it('should expose upload middleware', () => {
            expect(jobProfileService.upload).toBeDefined();
            expect(typeof jobProfileService.upload.single).toBe('function');
        });
    });
});
