const CandidateService = require('../../services/candidateService');
const AppError = require('../../utils/appError');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('fs');
jest.mock('multer');

describe('CandidateService', () => {
    let candidateService;
    let mockCandidateRepository;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock database client
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined)
        };

        // Mock database
        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        // Mock repository
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
            getResumeInfo: jest.fn(),
            updateResumeInfo: jest.fn(),
            deleteResumeInfo: jest.fn()
        };

        // Mock fs.promises
        fs.promises = {
            access: jest.fn().mockResolvedValue(undefined),
            mkdir: jest.fn().mockResolvedValue(undefined),
            unlink: jest.fn().mockResolvedValue(undefined)
        };

        candidateService = new CandidateService(mockCandidateRepository, mockDb);
    });

    describe('createCandidate', () => {
        const mockCandidateData = {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '1234567890'
        };

        it('should create a candidate successfully', async () => {
            const expectedCandidate = { id: 1, ...mockCandidateData };
            mockCandidateRepository.checkEmailExists.mockResolvedValue(false);
            mockCandidateRepository.create.mockResolvedValue(expectedCandidate);

            const result = await candidateService.createCandidate(mockCandidateData);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.checkEmailExists).toHaveBeenCalledWith(
                mockCandidateData.email,
                null,
                mockClient
            );
            expect(mockCandidateRepository.create).toHaveBeenCalledWith(mockCandidateData, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(result).toEqual(expectedCandidate);
        });

        it('should throw error when email already exists', async () => {
            mockCandidateRepository.checkEmailExists.mockResolvedValue(true);

            await expect(candidateService.createCandidate(mockCandidateData))
                .rejects
                .toThrow(AppError);

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(mockCandidateRepository.create).not.toHaveBeenCalled();
        });

        it('should rollback transaction on database error', async () => {
            mockCandidateRepository.checkEmailExists.mockResolvedValue(false);
            mockCandidateRepository.create.mockRejectedValue(new Error('DB Error'));

            await expect(candidateService.createCandidate(mockCandidateData))
                .rejects
                .toThrow('DB Error');

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('getCandidateById', () => {
        it('should return candidate when found', async () => {
            const mockCandidate = { id: 1, name: 'John Doe', email: 'john@example.com' };
            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);

            const result = await candidateService.getCandidateById(1);

            expect(mockCandidateRepository.findById).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockCandidate);
        });

        it('should throw AppError when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.getCandidateById(999))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('updateCandidate', () => {
        const candidateId = 1;
        const existingCandidate = { id: 1, name: 'John Doe', email: 'john@example.com' };
        const updateData = { name: 'Jane Doe' };

        it('should update candidate successfully', async () => {
            const updatedCandidate = { ...existingCandidate, ...updateData };
            mockCandidateRepository.findById
                .mockResolvedValueOnce(existingCandidate)
                .mockResolvedValueOnce(updatedCandidate);
            mockCandidateRepository.update.mockResolvedValue(undefined);

            const result = await candidateService.updateCandidate(candidateId, updateData);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.update).toHaveBeenCalledWith(candidateId, updateData, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toEqual(updatedCandidate);
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.updateCandidate(candidateId, updateData))
                .rejects
                .toThrow(AppError);

            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should check email uniqueness when updating email', async () => {
            const updateDataWithEmail = { email: 'newemail@example.com' };
            mockCandidateRepository.findById.mockResolvedValue(existingCandidate);
            mockCandidateRepository.checkEmailExists.mockResolvedValue(false);
            mockCandidateRepository.update.mockResolvedValue(undefined);

            await candidateService.updateCandidate(candidateId, updateDataWithEmail);

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

            await expect(candidateService.updateCandidate(candidateId, updateDataWithEmail))
                .rejects
                .toThrow(AppError);

            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should not check email uniqueness when email unchanged', async () => {
            const updateDataSameEmail = { name: 'Jane Doe', email: existingCandidate.email };
            mockCandidateRepository.findById.mockResolvedValue(existingCandidate);
            mockCandidateRepository.update.mockResolvedValue(undefined);

            await candidateService.updateCandidate(candidateId, updateDataSameEmail);

            expect(mockCandidateRepository.checkEmailExists).not.toHaveBeenCalled();
        });
    });

    describe('deleteCandidate', () => {
        it('should delete candidate successfully', async () => {
            const mockCandidate = { id: 1, name: 'John Doe' };
            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.delete.mockResolvedValue(undefined);

            const result = await candidateService.deleteCandidate(1);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.delete).toHaveBeenCalledWith(1, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toEqual({ deletedCandidate: mockCandidate });
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.deleteCandidate(999))
                .rejects
                .toThrow(AppError);

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockCandidateRepository.delete).not.toHaveBeenCalled();
        });
    });

    describe('uploadResume', () => {
        const candidateId = 1;
        const mockFile = {
            filename: 'candidate_1_123456_resume.pdf',
            originalname: 'resume.pdf',
            path: '/path/to/resume.pdf',
            size: 1024000
        };

        it('should upload resume successfully', async () => {
            const mockCandidate = { id: candidateId, name: 'John Doe' };
            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);
            mockCandidateRepository.updateResumeInfo.mockResolvedValue(undefined);

            const result = await candidateService.uploadResume(candidateId, mockFile);

            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockCandidateRepository.updateResumeInfo).toHaveBeenCalledWith(
                candidateId,
                mockFile.filename,
                mockFile.originalname,
                mockClient
            );
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toMatchObject({
                candidateId,
                filename: mockFile.filename,
                originalName: mockFile.originalname,
                size: mockFile.size
            });
        });

        it('should delete old resume before uploading new one', async () => {
            const mockCandidate = { id: candidateId, name: 'John Doe' };
            const existingResume = {
                resumeFilename: 'old_resume.pdf',
                resumeOriginalName: 'old.pdf'
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(existingResume);
            mockCandidateRepository.updateResumeInfo.mockResolvedValue(undefined);

            await candidateService.uploadResume(candidateId, mockFile);

            expect(fs.promises.unlink).toHaveBeenCalled();
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.uploadResume(candidateId, mockFile))
                .rejects
                .toThrow(AppError);

            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should cleanup uploaded file on database error', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ id: candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);
            mockCandidateRepository.updateResumeInfo.mockRejectedValue(new Error('DB Error'));

            await expect(candidateService.uploadResume(candidateId, mockFile))
                .rejects
                .toThrow();

            expect(fs.promises.unlink).toHaveBeenCalledWith(mockFile.path);
            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('downloadResume', () => {
        const candidateId = 1;

        it('should return resume file info successfully', async () => {
            const mockCandidate = { id: candidateId, name: 'John Doe' };
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original_resume.pdf'
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            fs.promises.access.mockResolvedValue(undefined);

            const result = await candidateService.downloadResume(candidateId);

            expect(result).toMatchObject({
                originalName: mockResumeInfo.resumeOriginalName,
                filename: mockResumeInfo.resumeFilename
            });
            expect(result.filePath).toContain(mockResumeInfo.resumeFilename);
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.downloadResume(candidateId))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when resume not found in database', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ id: candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            await expect(candidateService.downloadResume(candidateId))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when resume file does not exist', async () => {
            const mockResumeInfo = {
                resumeFilename: 'missing.pdf',
                resumeOriginalName: 'resume.pdf'
            };

            mockCandidateRepository.findById.mockResolvedValue({ id: candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            fs.promises.access.mockRejectedValue(new Error('File not found'));

            await expect(candidateService.downloadResume(candidateId))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('deleteResume', () => {
        const candidateId = 1;

        it('should delete resume successfully', async () => {
            const mockCandidate = { id: candidateId, name: 'John Doe' };
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original_resume.pdf'
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            mockCandidateRepository.deleteResumeInfo.mockResolvedValue(undefined);
            fs.promises.unlink.mockResolvedValue(undefined);

            const result = await candidateService.deleteResume(candidateId);

            expect(fs.promises.unlink).toHaveBeenCalled();
            expect(mockCandidateRepository.deleteResumeInfo).toHaveBeenCalledWith(candidateId, mockClient);
            expect(result).toMatchObject({
                message: 'Resume deleted successfully',
                deletedFile: mockResumeInfo.resumeOriginalName
            });
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.deleteResume(candidateId))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when no resume exists', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ id: candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            await expect(candidateService.deleteResume(candidateId))
                .rejects
                .toThrow(AppError);
        });

        it('should continue with database update even if file deletion fails', async () => {
            const mockCandidate = { id: candidateId, name: 'John Doe' };
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original_resume.pdf'
            };

            mockCandidateRepository.findById.mockResolvedValue(mockCandidate);
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);
            mockCandidateRepository.deleteResumeInfo.mockResolvedValue(undefined);
            fs.promises.unlink.mockRejectedValue(new Error('File delete failed'));

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
                resumeUploadDate: new Date()
            };

            mockCandidateRepository.findById.mockResolvedValue({ id: candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(mockResumeInfo);

            const result = await candidateService.getResumeInfo(candidateId);

            expect(result).toEqual({
                hasResume: true,
                originalName: mockResumeInfo.resumeOriginalName,
                uploadDate: mockResumeInfo.resumeUploadDate
            });
        });

        it('should return no resume info when resume does not exist', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ id: candidateId });
            mockCandidateRepository.getResumeInfo.mockResolvedValue(null);

            const result = await candidateService.getResumeInfo(candidateId);

            expect(result).toEqual({
                hasResume: false,
                originalName: null,
                uploadDate: null
            });
        });

        it('should throw error when candidate not found', async () => {
            mockCandidateRepository.findById.mockResolvedValue(null);

            await expect(candidateService.getResumeInfo(candidateId))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('getAllCandidates', () => {
        it('should return all candidates with default options', async () => {
            const mockCandidates = [
                { id: 1, name: 'John Doe' },
                { id: 2, name: 'Jane Smith' }
            ];
            mockCandidateRepository.findAll.mockResolvedValue(mockCandidates);

            const result = await candidateService.getAllCandidates();

            expect(mockCandidateRepository.findAll).toHaveBeenCalledWith(undefined, undefined);
            expect(result).toEqual(mockCandidates);
        });

        it('should return candidates with limit and offset', async () => {
            const mockCandidates = [{ id: 1, name: 'John Doe' }];
            mockCandidateRepository.findAll.mockResolvedValue(mockCandidates);

            const result = await candidateService.getAllCandidates({ limit: 10, offset: 5 });

            expect(mockCandidateRepository.findAll).toHaveBeenCalledWith(10, 5);
            expect(result).toEqual(mockCandidates);
        });
    });

    describe('getCandidatesWithPagination', () => {
        it('should return paginated candidates with metadata', async () => {
            const mockCandidates = [{ id: 1, name: 'John Doe' }];
            mockCandidateRepository.searchCandidates.mockResolvedValue(mockCandidates);
            candidateService.getCandidateCountWithFilters = jest.fn().mockResolvedValue(25);

            const result = await candidateService.getCandidatesWithPagination(2, 10, {});

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith({}, 10, 10);
            expect(result).toMatchObject({
                candidates: mockCandidates,
                pagination: {
                    currentPage: 2,
                    pageSize: 10,
                    totalCount: 25,
                    totalPages: 3,
                    hasNextPage: true,
                    hasPreviousPage: true
                }
            });
        });

        it('should handle first page correctly', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);
            candidateService.getCandidateCountWithFilters = jest.fn().mockResolvedValue(15);

            const result = await candidateService.getCandidatesWithPagination(1, 10);

            expect(result.pagination.hasPreviousPage).toBe(false);
            expect(result.pagination.hasNextPage).toBe(true);
        });

        it('should handle last page correctly', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);
            candidateService.getCandidateCountWithFilters = jest.fn().mockResolvedValue(25);

            const result = await candidateService.getCandidatesWithPagination(3, 10);

            expect(result.pagination.hasPreviousPage).toBe(true);
            expect(result.pagination.hasNextPage).toBe(false);
        });
    });

    describe('bulkUpdateCandidates', () => {
        const candidateIds = [1, 2, 3];
        const updateData = { status: 'active' };

        it('should update all candidates successfully', async () => {
            mockCandidateRepository.update.mockResolvedValue(undefined);

            const result = await candidateService.bulkUpdateCandidates(candidateIds, updateData);

            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toMatchObject({
                totalProcessed: 3,
                successful: 3
            });
            expect(result.results.every(r => r.status === 'success')).toBe(true);
        });

        it('should rollback on partial failure', async () => {
            mockCandidateRepository.update
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Update failed'))
                .mockResolvedValueOnce(undefined);

            await expect(candidateService.bulkUpdateCandidates(candidateIds, updateData))
                .rejects
                .toThrow(AppError);

            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('bulkDeleteCandidates', () => {
        const candidateIds = [1, 2, 3];

        it('should delete all candidates successfully', async () => {
            mockCandidateRepository.findById
                .mockResolvedValueOnce({ id: 1 })
                .mockResolvedValueOnce({ id: 2 })
                .mockResolvedValueOnce({ id: 3 });
            mockCandidateRepository.delete.mockResolvedValue(undefined);

            const result = await candidateService.bulkDeleteCandidates(candidateIds);

            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toMatchObject({
                totalProcessed: 3,
                successful: 3
            });
        });

        it('should handle not found candidates', async () => {
            mockCandidateRepository.findById
                .mockResolvedValueOnce({ id: 1 })
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id: 3 });
            mockCandidateRepository.delete.mockResolvedValue(undefined);

            const result = await candidateService.bulkDeleteCandidates(candidateIds);

            expect(result.results[1].status).toBe('not_found');
        });

        it('should rollback on delete failure', async () => {
            mockCandidateRepository.findById.mockResolvedValue({ id: 1 });
            mockCandidateRepository.delete
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Delete failed'));

            await expect(candidateService.bulkDeleteCandidates(candidateIds))
                .rejects
                .toThrow(AppError);

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
                recruiterName: 'Jane'
            };

            const mockResults = [{ id: 1, name: 'John Doe' }];
            mockCandidateRepository.searchCandidates.mockResolvedValue(mockResults);

            const result = await candidateService.searchCandidates(searchCriteria);

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith({
                candidateName: 'John',
                email: 'john@example.com',
                jobRole: 'Developer',
                preferredJobLocation: 'New York',
                experienceRange: { min: 2, max: 5 },
                expectedCTCRange: { min: 50000, max: 80000 },
                statusId: 1,
                recruiterName: 'Jane'
            });
            expect(result).toEqual(mockResults);
        });

        it('should handle partial search criteria', async () => {
            const searchCriteria = { name: 'John' };
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);

            await candidateService.searchCandidates(searchCriteria);

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith({
                candidateName: 'John'
            });
        });

        it('should handle empty search criteria', async () => {
            mockCandidateRepository.searchCandidates.mockResolvedValue([]);

            await candidateService.searchCandidates({});

            expect(mockCandidateRepository.searchCandidates).toHaveBeenCalledWith({});
        });
    });

    describe('getCandidatesByStatus', () => {
        it('should return candidates by status', async () => {
            const statusId = 1;
            const mockCandidates = [{ id: 1, statusId: 1 }];
            mockCandidateRepository.findByStatus.mockResolvedValue(mockCandidates);

            const result = await candidateService.getCandidatesByStatus(statusId);

            expect(mockCandidateRepository.findByStatus).toHaveBeenCalledWith(statusId);
            expect(result).toEqual(mockCandidates);
        });
    });

    describe('getCandidateCount', () => {
        it('should return total candidate count', async () => {
            mockCandidateRepository.getCount.mockResolvedValue(42);

            const result = await candidateService.getCandidateCount();

            expect(result).toBe(42);
        });
    });
});