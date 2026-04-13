process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({}),
    })),
    DeleteObjectCommand: jest.fn((input) => input),
    HeadObjectCommand: jest.fn((input) => input),
    GetObjectCommand: jest.fn((input) => input),
    CopyObjectCommand: jest.fn((input) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/candidate'),
}));

const CandidateService = require('../../services/candidateService');
const AppError = require('../../utils/appError');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs');
jest.mock('multer');

describe('CandidateService', () => {
    let candidateService;
    let mockCandidateRepository;
    let mockDb;
    let mockClient;

    const auditContext = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn(),
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient),
        };

        mockCandidateRepository = {
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findAll: jest.fn(),
            findByStatus: jest.fn(),
            getCount: jest.fn(),
            checkEmailExists: jest.fn(),
            searchCandidates: jest.fn(),
            countCandidates: jest.fn(),
            getResumeInfo: jest.fn(),
            updateResumeInfo: jest.fn(),
            deleteResumeInfo: jest.fn(),
        };

        candidateService = new CandidateService(mockCandidateRepository, mockDb);
        jest.spyOn(candidateService, 'deleteFromS3').mockResolvedValue(undefined);
        jest.spyOn(candidateService, 'fileExistsInS3').mockResolvedValue(true);
        jest.spyOn(candidateService, 'getS3FileMetadata').mockResolvedValue({
            contentType: 'application/pdf',
            contentLength: 1024,
        });
        getSignedUrl.mockResolvedValue('https://signed.example/candidate');
    });

    describe('createCandidate', () => {
        const mockCandidateData = {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '1234567890',
        };

        it('should create a candidate successfully', async () => {
            const expectedCandidate = { candidateId: 1, ...mockCandidateData };
            mockCandidateRepository.checkEmailExists.mockResolvedValue(false);
            mockCandidateRepository.create.mockResolvedValue(expectedCandidate);

            const result = await candidateService.createCandidate(mockCandidateData, auditContext);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.checkEmailExists).toHaveBeenCalledWith(
                mockCandidateData.email,
                null,
                mockClient
            );
            expect(mockCandidateRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: mockCandidateData.name,
                    email: mockCandidateData.email,
                    phone: mockCandidateData.phone,
                }),
                mockClient
            );
            expect(mockClient.commit).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(result).toEqual(expectedCandidate);
        });

        it('should throw error when email already exists', async () => {
            mockCandidateRepository.checkEmailExists.mockResolvedValue(true);

            await expect(candidateService.createCandidate(mockCandidateData, auditContext))
                .rejects
                .toMatchObject({
                    message: 'A candidate with this email already exists',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_CANDIDATE_EMAIL',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(mockCandidateRepository.create).not.toHaveBeenCalled();
        });

        it('should rollback transaction on database error', async () => {
            mockCandidateRepository.checkEmailExists.mockResolvedValue(false);
            mockCandidateRepository.create.mockRejectedValue(new Error('DB Error'));

            await expect(candidateService.createCandidate(mockCandidateData, auditContext))
                .rejects
                .toThrow('DB Error');

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('getCandidateById', () => {
        it('should return candidate when found', async () => {
            const mockCandidate = { candidateId: 1, name: 'John Doe', email: 'john@example.com' };
            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);

            const result = await candidateService.getCandidateById(1);

            expect(mockCandidateRepository.findById).toHaveBeenCalledWith(1, mockClient);
            expect(result).toEqual(mockCandidate);
        });

        it('should throw AppError when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.getCandidateById(999))
                .rejects
                .toMatchObject({
                    message: 'Candidate with ID 999 not found',
                    statusCode: 404,
                    errorCode: 'CANDIDATE_NOT_FOUND',
                });
        });
    });

    describe('updateCandidate', () => {
        const candidateId = 1;
        const existingCandidate = { candidateId: 1, name: 'John Doe', email: 'john@example.com' };
        const updateData = { name: 'Jane Doe' };

        it('should update candidate successfully', async () => {
            const updatedCandidate = { ...existingCandidate, ...updateData };
            mockCandidateRepository.findById
                .mockResolvedValueOnce(existingCandidate)
                .mockResolvedValueOnce(updatedCandidate);
            mockCandidateRepository.update.mockResolvedValue(updatedCandidate);

            const result = await candidateService.updateCandidate(candidateId, updateData, auditContext);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.update).toHaveBeenCalledWith(
                candidateId,
                expect.objectContaining({ name: 'Jane Doe' }),
                mockClient
            );
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toEqual(updatedCandidate);
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.updateCandidate(candidateId, updateData, auditContext))
                .rejects
                .toMatchObject({
                    message: 'Candidate with ID 1 not found',
                    statusCode: 404,
                    errorCode: 'CANDIDATE_NOT_FOUND',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should check email uniqueness when updating email', async () => {
            const updateDataWithEmail = { email: 'newemail@example.com' };
            const merged = { ...existingCandidate, ...updateDataWithEmail };
            mockCandidateRepository.findById
                .mockResolvedValueOnce(existingCandidate)
                .mockResolvedValueOnce(merged);
            mockCandidateRepository.checkEmailExists.mockResolvedValue(false);
            mockCandidateRepository.update.mockResolvedValue(merged);

            await candidateService.updateCandidate(candidateId, updateDataWithEmail, auditContext);

            expect(mockCandidateRepository.checkEmailExists).toHaveBeenCalledWith(
                updateDataWithEmail.email,
                candidateId,
                mockClient
            );
        });

        it('should throw error when new email already exists', async () => {
            const updateDataWithEmail = { email: 'existing@example.com' };
            mockCandidateRepository.findById.mockResolvedValue(existingCandidate);
            mockCandidateRepository.checkEmailExists.mockResolvedValue(true);

            await expect(candidateService.updateCandidate(candidateId, updateDataWithEmail, auditContext))
                .rejects
                .toMatchObject({
                    message: 'A candidate with this email already exists',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_CANDIDATE_EMAIL',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should not check email uniqueness when email unchanged', async () => {
            const updateDataSameEmail = { name: 'Jane Doe', email: existingCandidate.email };
            mockCandidateRepository.findById
                .mockResolvedValueOnce(existingCandidate)
                .mockResolvedValueOnce({ ...existingCandidate, name: 'Jane Doe' });
            mockCandidateRepository.update.mockResolvedValue({ ...existingCandidate, name: 'Jane Doe' });

            await candidateService.updateCandidate(candidateId, updateDataSameEmail, auditContext);

            expect(mockCandidateRepository.checkEmailExists).not.toHaveBeenCalled();
        });
    });

    describe('deleteCandidate', () => {
        it('should delete candidate successfully', async () => {
            const mockCandidate = { candidateId: 1, name: 'John Doe' };
            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.delete.mockResolvedValue(undefined);

            const result = await candidateService.deleteCandidate(1, auditContext);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.delete).toHaveBeenCalledWith(1, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toEqual({ deletedCandidate: mockCandidate });
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.deleteCandidate(999, auditContext))
                .rejects
                .toMatchObject({
                    message: 'Candidate with ID 999 not found',
                    statusCode: 404,
                    errorCode: 'CANDIDATE_NOT_FOUND',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockCandidateRepository.delete).not.toHaveBeenCalled();
        });
    });

    describe('uploadResume', () => {
        const candidateId = 1;
        const mockFile = {
            key: 'development/resumes/candidate_1_123_resume.pdf',
            originalname: 'resume.pdf',
            path: '/path/to/resume.pdf',
            size: 1024000,
            location: 'https://s3.example/bucket/key',
        };

        it('should upload resume successfully', async () => {
            const mockCandidate = { candidateId, name: 'John Doe' };
            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);
            mockCandidateRepository.updateResumeInfo.mockResolvedValue(undefined);

            const result = await candidateService.uploadResume(candidateId, mockFile);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.updateResumeInfo).toHaveBeenCalledWith(
                candidateId,
                mockFile.key,
                mockFile.originalname,
                mockClient
            );
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toMatchObject({
                candidateId,
                filename: mockFile.key,
                originalName: mockFile.originalname,
                size: mockFile.size,
            });
        });

        it('should delete old resume from S3 before uploading new one', async () => {
            const mockCandidate = { candidateId, name: 'John Doe' };
            const existingResume = {
                resumeFilename: 'old_resume.pdf',
                resumeOriginalName: 'old.pdf',
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(existingResume);
            mockCandidateRepository.updateResumeInfo.mockResolvedValue(undefined);

            await candidateService.uploadResume(candidateId, mockFile);

            expect(candidateService.deleteFromS3).toHaveBeenCalledWith('old_resume.pdf');
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.uploadResume(candidateId, mockFile))
                .rejects
                .toMatchObject({
                    message: `Candidate with ID ${candidateId} not found`,
                    statusCode: 404,
                    errorCode: 'CANDIDATE_NOT_FOUND',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should cleanup uploaded file on database error', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);
            mockCandidateRepository.updateResumeInfo.mockRejectedValue(new Error('DB Error'));

            await expect(candidateService.uploadResume(candidateId, mockFile))
                .rejects
                .toMatchObject({
                    message: 'Failed to Upload Resume',
                    statusCode: 500,
                    errorCode: 'RESUME_UPLOAD_ERROR',
                });

            expect(candidateService.deleteFromS3).toHaveBeenCalledWith(mockFile.key);
            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('downloadResume', () => {
        const candidateId = 1;

        it('should return resume file info successfully', async () => {
            const mockCandidate = { candidateId, name: 'John Doe' };
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original_resume.pdf',
                resumeUploadDate: new Date('2020-01-01'),
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);

            const result = await candidateService.downloadResume(candidateId);

            expect(result).toMatchObject({
                s3Key: mockResumeInfo.resumeFilename,
                originalName: mockResumeInfo.resumeOriginalName,
                filename: mockResumeInfo.resumeFilename,
                contentType: 'application/pdf',
                contentLength: 1024,
            });
            expect(candidateService.fileExistsInS3).toHaveBeenCalledWith(mockResumeInfo.resumeFilename);
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.downloadResume(candidateId))
                .rejects
                .toMatchObject({ errorCode: 'CANDIDATE_NOT_FOUND' });
        });

        it('should throw error when resume not found in database', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            await expect(candidateService.downloadResume(candidateId))
                .rejects
                .toMatchObject({ errorCode: 'RESUME_NOT_FOUND' });
        });

        it('should throw error when resume file does not exist in storage', async () => {
            const mockResumeInfo = {
                resumeFilename: 'missing.pdf',
                resumeOriginalName: 'resume.pdf',
            };

            mockCandidateRepository.findById.mockResolvedValue({ candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            candidateService.fileExistsInS3.mockResolvedValueOnce(false);

            await expect(candidateService.downloadResume(candidateId))
                .rejects
                .toMatchObject({ errorCode: 'RESUME_FILE_NOT_FOUND' });
        });
    });

    describe('deleteResume', () => {
        const candidateId = 1;

        it('should delete resume successfully', async () => {
            const mockCandidate = { candidateId, name: 'John Doe' };
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original_resume.pdf',
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            mockCandidateRepository.deleteResumeInfo.mockResolvedValue(undefined);

            const result = await candidateService.deleteResume(candidateId);

            expect(candidateService.deleteFromS3).toHaveBeenCalledWith(mockResumeInfo.resumeFilename);
            expect(mockCandidateRepository.deleteResumeInfo).toHaveBeenCalledWith(candidateId, mockClient);
            expect(result).toMatchObject({
                message: 'Resume deleted successfully',
                deletedFile: mockResumeInfo.resumeOriginalName,
            });
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.deleteResume(candidateId))
                .rejects
                .toMatchObject({ errorCode: 'CANDIDATE_NOT_FOUND' });
        });

        it('should throw error when no resume exists', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            await expect(candidateService.deleteResume(candidateId))
                .rejects
                .toMatchObject({ errorCode: 'RESUME_NOT_FOUND' });
        });

        it('should continue with database update even if S3 deletion fails', async () => {
            const mockCandidate = { candidateId, name: 'John Doe' };
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original_resume.pdf',
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            mockCandidateRepository.deleteResumeInfo.mockResolvedValue(undefined);
            candidateService.deleteFromS3.mockRejectedValueOnce(new Error('S3 delete failed'));

            const result = await candidateService.deleteResume(candidateId);

            expect(mockCandidateRepository.deleteResumeInfo).toHaveBeenCalled();
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result.message).toBe('Resume deleted successfully');
        });
    });

    describe('getResumeInfo', () => {
        const candidateId = 1;

        it('should return resume info when resume exists', async () => {
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original.pdf',
                resumeUploadDate: new Date(),
            };

            mockCandidateRepository.findById.mockResolvedValue({ candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);

            const result = await candidateService.getResumeInfo(candidateId);

            expect(result).toEqual({
                hasResume: true,
                originalName: mockResumeInfo.resumeOriginalName,
                uploadDate: mockResumeInfo.resumeUploadDate,
                s3Key: mockResumeInfo.resumeFilename,
            });
        });

        it('should return no resume info when resume does not exist', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            const result = await candidateService.getResumeInfo(candidateId);

            expect(result).toEqual({
                hasResume: false,
                originalName: null,
                uploadDate: null,
                s3Key: null,
            });
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.getResumeInfo(candidateId))
                .rejects
                .toMatchObject({ errorCode: 'CANDIDATE_NOT_FOUND' });
        });
    });

    describe('getAllCandidates', () => {
        it('should return all candidates (repository ignores limit/offset in service)', async () => {
            const mockCandidates = [
                { candidateId: 1, name: 'John Doe' },
                { candidateId: 2, name: 'Jane Smith' },
            ];
            mockCandidateRepository.findAll.mockResolvedValue(mockCandidates);

            const result = await candidateService.getAllCandidates();

            expect(mockCandidateRepository.findAll).toHaveBeenCalledWith(null, null, mockClient);
            expect(result).toEqual(mockCandidates);
        });

        it('should call findAll with null,null regardless of options', async () => {
            const mockCandidates = [{ candidateId: 1, name: 'John Doe' }];
            mockCandidateRepository.findAll.mockResolvedValue(mockCandidates);

            const result = await candidateService.getAllCandidates({ limit: 10, offset: 5 });

            expect(mockCandidateRepository.findAll).toHaveBeenCalledWith(null, null, mockClient);
            expect(result).toEqual(mockCandidates);
        });
    });

    describe('getCandidatesWithPagination', () => {
        it('should return paginated candidates with metadata', async () => {
            const mockCandidates = [{ candidateId: 1, name: 'John Doe' }];
            mockCandidateRepository.searchCandidates.mockResolvedValue(mockCandidates);
            mockCandidateRepository.countCandidates.mockResolvedValue(25);

            const result = await candidateService.getCandidatesWithPagination(2, 10, {});

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith({}, 10, 10, mockClient);
            expect(mockCandidateRepository.countCandidates).toHaveBeenCalledWith({}, mockClient);
            expect(result).toMatchObject({
                candidates: mockCandidates,
                pagination: {
                    currentPage: 2,
                    pageSize: 10,
                    totalCount: 25,
                    totalPages: 3,
                    hasNextPage: true,
                    hasPreviousPage: true,
                },
            });
        });

        it('should handle first page correctly', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);
            mockCandidateRepository.countCandidates.mockResolvedValue(15);

            const result = await candidateService.getCandidatesWithPagination(1, 10);

            expect(result.pagination.hasPreviousPage).toBe(false);
            expect(result.pagination.hasNextPage).toBe(true);
        });

        it('should handle last page correctly', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);
            mockCandidateRepository.countCandidates.mockResolvedValue(25);

            const result = await candidateService.getCandidatesWithPagination(3, 10);

            expect(result.pagination.hasPreviousPage).toBe(true);
            expect(result.pagination.hasNextPage).toBe(false);
        });
    });

    describe('bulkUpdateCandidates', () => {
        const candidateIds = [1, 2, 3];
        const updateData = { statusId: 1 };

        it('should update all candidates successfully', async () => {
            mockCandidateRepository.update.mockResolvedValue(undefined);

            const result = await candidateService.bulkUpdateCandidates(candidateIds, updateData);

            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toMatchObject({
                totalProcessed: 3,
                successful: 3,
            });
            expect(result.results.every((r) => r.status === 'success')).toBe(true);
        });

        it('should rollback on partial failure', async () => {
            mockCandidateRepository.update
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Update failed'))
                .mockResolvedValueOnce(undefined);

            await expect(candidateService.bulkUpdateCandidates(candidateIds, updateData))
                .rejects
                .toMatchObject({
                    message: 'Bulk update failed for some records',
                    statusCode: 400,
                    errorCode: 'BULK_UPDATE_ERROR',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('bulkDeleteCandidates', () => {
        const candidateIds = [1, 2, 3];

        it('should delete all candidates successfully', async () => {
            mockCandidateRepository.findById
                .mockResolvedValueOnce({ candidateId: 1 })
                .mockResolvedValueOnce({ candidateId: 2 })
                .mockResolvedValueOnce({ candidateId: 3 });
            mockCandidateRepository.delete.mockResolvedValue(undefined);

            const result = await candidateService.bulkDeleteCandidates(candidateIds);

            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toMatchObject({
                totalProcessed: 3,
                successful: 3,
            });
        });

        it('should handle not found candidates', async () => {
            mockCandidateRepository.findById
                .mockResolvedValueOnce({ candidateId: 1 })
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ candidateId: 3 });
            mockCandidateRepository.delete.mockResolvedValue(undefined);

            const result = await candidateService.bulkDeleteCandidates(candidateIds);

            expect(result.results[1].status).toBe('not_found');
        });

        it('should rollback on delete failure', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId: 1 });
            mockCandidateRepository.delete
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Delete failed'))
                .mockResolvedValueOnce(undefined);

            await expect(candidateService.bulkDeleteCandidates(candidateIds))
                .rejects
                .toMatchObject({
                    message: 'Bulk delete failed for some records',
                    statusCode: 400,
                    errorCode: 'BULK_DELETE_ERROR',
                });

            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('searchCandidates', () => {
        it('should search candidates with all criteria', async () => {
            const searchCriteria = {
                name: 'John',
                email: 'john@example.com',
                jobRole: 'Developer',
                location: 'New York',
                minExperience: 2,
                maxExperience: 5,
                minExpectedCTC: 50000,
                maxExpectedCTC: 80000,
                statusId: 1,
                recruiterName: 'Jane',
            };

            const mockResults = [{ candidateId: 1, name: 'John Doe' }];
            mockCandidateRepository.searchCandidates.mockResolvedValue(mockResults);

            const result = await candidateService.searchCandidates(searchCriteria);

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith(
                {
                    candidateName: 'John',
                    email: 'john@example.com',
                    jobRole: 'Developer',
                    preferredJobLocation: 'New York',
                    experienceRange: { min: 2, max: 5 },
                    expectedCTCRange: { min: 50000, max: 80000 },
                    statusId: 1,
                    recruiterName: 'Jane',
                },
                mockClient
            );
            expect(result).toEqual(mockResults);
        });

        it('should handle partial search criteria', async () => {
            const searchCriteria = { name: 'John' };
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);

            await candidateService.searchCandidates(searchCriteria);

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith(
                { candidateName: 'John' },
                mockClient
            );
        });

        it('should handle empty search criteria', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);

            await candidateService.searchCandidates({});

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith({}, mockClient);
        });
    });

    describe('getCandidatesByStatus', () => {
        it('should return candidates by status', async () => {
            const statusId = 1;
            const mockCandidates = [{ candidateId: 1, statusId: 1 }];
            mockCandidateRepository.findByStatus.mockResolvedValue(mockCandidates);

            const result = await candidateService.getCandidatesByStatus(statusId);

            expect(mockCandidateRepository.findByStatus).toHaveBeenCalledWith(statusId, mockClient);
            expect(result).toEqual(mockCandidates);
        });
    });

    describe('getCandidateCount', () => {
        it('should return total candidate count', async () => {
            mockCandidateRepository.getCount.mockResolvedValue(42);

            const result = await candidateService.getCandidateCount();

            expect(mockCandidateRepository.getCount).toHaveBeenCalledWith(mockClient);
            expect(result).toBe(42);
        });

        it('should wrap repository errors', async () => {
            mockCandidateRepository.getCount.mockRejectedValue(new Error('db'));

            await expect(candidateService.getCandidateCount()).rejects.toMatchObject({
                errorCode: 'CANDIDATE_COUNT_FETCH_ERROR',
            });
        });
    });

    describe('uploadResume', () => {
        const file = { key: 'res/k.pdf', originalname: 'cv.pdf', size: 10, location: 's3' };

        it('should commit resume metadata', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId: 1 });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);
            mockCandidateRepository.updateResumeInfo.mockResolvedValue(undefined);

            const out = await candidateService.uploadResume(1, file);

            expect(out.filename).toBe(file.key);
            expect(mockCandidateRepository.updateResumeInfo).toHaveBeenCalled();
            expect(mockClient.commit).toHaveBeenCalled();
        });

        it('should delete key when candidate missing', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.uploadResume(9, file)).rejects.toMatchObject({
                errorCode: 'CANDIDATE_NOT_FOUND',
            });
        });

        it('should rollback on update failure', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId: 1 });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);
            mockCandidateRepository.updateResumeInfo.mockRejectedValue(new Error('db'));

            await expect(candidateService.uploadResume(1, file)).rejects.toMatchObject({
                errorCode: 'RESUME_UPLOAD_ERROR',
            });
        });
    });

    describe('downloadResume', () => {
        it('should return resume payload', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ candidateId: 1 });
            mockCandidateRepository.getResumeInfo.mockResolvedValue({
                resumeFilename: 'k.pdf',
                resumeOriginalName: 'cv.pdf',
                resumeUploadDate: new Date(),
            });

            const out = await candidateService.downloadResume(1);

            expect(out.s3Key).toBe('k.pdf');
        });

        it('should 404 when no resume row', async () => {
            mockCandidateRepository.findById.mockResolvedValue({});
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            await expect(candidateService.downloadResume(1)).rejects.toMatchObject({
                errorCode: 'RESUME_NOT_FOUND',
            });
        });
    });

    describe('getResumePresignedUrl', () => {
        it('should return URL payload', async () => {
            mockCandidateRepository.findById.mockResolvedValue({});
            mockCandidateRepository.getResumeInfo.mockResolvedValue({
                resumeFilename: 'k',
                resumeOriginalName: 'c.pdf',
            });

            const out = await candidateService.getResumePresignedUrl(1, 60);

            expect(out.downloadUrl).toBe('https://signed.example/candidate');
            expect(out.expiresIn).toBe(60);
        });
    });

    describe('deleteResume', () => {
        it('should delete and clear DB', async () => {
            mockCandidateRepository.findById.mockResolvedValue({});
            mockCandidateRepository.getResumeInfo.mockResolvedValue({ resumeFilename: 'k', resumeOriginalName: 'c.pdf' });
            mockCandidateRepository.deleteResumeInfo.mockResolvedValue(undefined);

            const out = await candidateService.deleteResume(1);

            expect(out.message).toMatch(/deleted/i);
        });
    });

    describe('getResumeInfo', () => {
        it('should describe resume presence', async () => {
            mockCandidateRepository.findById.mockResolvedValue({});
            mockCandidateRepository.getResumeInfo.mockResolvedValue({
                resumeFilename: 'x',
                resumeOriginalName: 'a.pdf',
            });

            const out = await candidateService.getResumeInfo(1);

            expect(out.hasResume).toBe(true);
        });
    });

    describe('updateCandidateResumeInfo', () => {
        it('should run transactional update', async () => {
            mockCandidateRepository.updateResumeInfo.mockResolvedValue(undefined);

            await candidateService.updateCandidateResumeInfo(1, {
                resumeFilename: 'k',
                resumeOriginalName: 'a.pdf',
            });

            expect(mockClient.commit).toHaveBeenCalled();
        });
    });

    describe('getFormData', () => {
        it('should delegate to repository', async () => {
            mockCandidateRepository.getFormData = jest.fn().mockResolvedValue({ skills: [] });

            const out = await candidateService.getFormData();

            expect(mockCandidateRepository.getFormData).toHaveBeenCalledWith(mockClient);
            expect(out).toEqual({ skills: [] });
        });
    });

    describe('permanentlyDeleteOldCandidates', () => {
        it('should return 0 when no stale candidates', async () => {
            mockClient.execute.mockResolvedValue([[], []]);

            const n = await candidateService.permanentlyDeleteOldCandidates();

            expect(n).toBe(0);
            expect(mockClient.commit).toHaveBeenCalled();
        });
    });

    describe('getCandidatesWithPagination', () => {
        it('should return page and total', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([{ candidateId: 1 }]);
            mockCandidateRepository.countCandidates.mockResolvedValue(25);

            const out = await candidateService.getCandidatesWithPagination(2, 10, { statusId: 1 });

            expect(out.pagination.currentPage).toBe(2);
            expect(out.candidates).toHaveLength(1);
            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith(
                { statusId: 1 },
                10,
                10,
                mockClient
            );
        });
    });

    describe('getAllCandidatesWithPagination', () => {
        it('should return pagination wrapper', async () => {
            mockCandidateRepository.findAll.mockResolvedValue([]);
            mockCandidateRepository.getCount.mockResolvedValue(0);

            const out = await candidateService.getAllCandidatesWithPagination(1, 20);

            expect(out.pagination.totalCount).toBe(0);
        });
    });
});
