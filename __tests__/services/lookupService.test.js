const LookupService = require('../../services/lookupService');
const AppError = require('../../utils/appError');

describe('LookupService', () => {
    let lookupService;
    let mockLookupRepository;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined)
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        mockLookupRepository = {
            getAll: jest.fn(),
            getByTag: jest.fn(),
            create: jest.fn(),
            exists: jest.fn(),
            getByKey: jest.fn(),
            delete: jest.fn()
        };

        lookupService = new LookupService(mockLookupRepository, mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getAll', () => {
        it('should return paginated results with default pagination', async () => {
            const mockData = {
                data: [{ id: 1, value: 'test' }],
                totalRecords: 25
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll();

            expect(mockLookupRepository.getAll).toHaveBeenCalledWith(10, 1);
            expect(result).toEqual({
                data: mockData.data,
                pagination: {
                    currentPage: 1,
                    totalPages: 3,
                    totalRecords: 25,
                    limit: 10,
                    hasNextPage: true,
                    hasPrevPage: false,
                    nextPage: 2,
                    prevPage: null
                }
            });
        });

        it('should return paginated results with custom limit and page', async () => {
            const mockData = {
                data: [{ id: 1, value: 'test' }],
                totalRecords: 50
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll({ limit: 20, page: 2 });

            expect(mockLookupRepository.getAll).toHaveBeenCalledWith(20, 2);
            expect(result.pagination).toEqual({
                currentPage: 2,
                totalPages: 3,
                totalRecords: 50,
                limit: 20,
                hasNextPage: true,
                hasPrevPage: true,
                nextPage: 3,
                prevPage: 1
            });
        });

        it('should handle last page correctly', async () => {
            const mockData = {
                data: [{ id: 1, value: 'test' }],
                totalRecords: 25
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll({ limit: 10, page: 3 });

            expect(result.pagination).toMatchObject({
                currentPage: 3,
                totalPages: 3,
                hasNextPage: false,
                hasPrevPage: true,
                nextPage: null,
                prevPage: 2
            });
        });

        it('should handle empty results', async () => {
            const mockData = {
                data: [],
                totalRecords: 0
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll();

            expect(result.data).toEqual([]);
            expect(result.pagination.totalPages).toBe(0);
            expect(result.pagination.hasNextPage).toBe(false);
        });
    });

    describe('getDataByTag', () => {
        it('should return lookup data when tag exists', async () => {
            const mockLookup = { id: 1, tag: 'TEST_TAG', value: 'test' };
            mockLookupRepository.getByTag.mockResolvedValue(mockLookup);

            const result = await lookupService.getDataByTag('TEST_TAG');

            expect(mockLookupRepository.getByTag).toHaveBeenCalledWith('TEST_TAG');
            expect(result).toEqual(mockLookup);
        });

        it('should throw AppError when tag does not exist', async () => {
            mockLookupRepository.getByTag.mockResolvedValue(null);

            await expect(lookupService.getDataByTag('INVALID_TAG'))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.getDataByTag('INVALID_TAG'))
                .rejects
                .toMatchObject({
                    message: 'Lookup entry with INVALID_TAG not found',
                    statusCode: 404,
                    errorCode: 'LOOKUP_ENTRY_NOT_FOUND'
                });
        });

        it('should throw AppError when tag is undefined', async () => {
            mockLookupRepository.getByTag.mockResolvedValue(undefined);

            await expect(lookupService.getDataByTag('UNDEFINED_TAG'))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('createLookup', () => {
        const mockLookupData = { value: 'NEW_VALUE', tag: 'NEW_TAG' };

        it('should create lookup successfully when value does not exist', async () => {
            const mockCreatedLookup = { id: 1, ...mockLookupData };
            mockLookupRepository.exists.mockResolvedValue(false);
            mockLookupRepository.create.mockResolvedValue(mockCreatedLookup);

            const result = await lookupService.createLookup(mockLookupData);

            expect(mockDb.getConnection).toHaveBeenCalled();
            expect(mockClient.beginTransaction).toHaveBeenCalled();
            expect(mockLookupRepository.exists).toHaveBeenCalledWith(
                mockLookupData.value,
                null,
                mockClient
            );
            expect(mockLookupRepository.create).toHaveBeenCalledWith(mockLookupData);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(result).toEqual(mockCreatedLookup);
        });

        it('should throw AppError when duplicate value exists', async () => {
            mockLookupRepository.exists.mockResolvedValue(true);

            await expect(lookupService.createLookup(mockLookupData))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.createLookup(mockLookupData))
                .rejects
                .toMatchObject({
                    message: 'A lookup with this value already exists',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_LOOKUP_VALUE'
                });

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(mockLookupRepository.create).not.toHaveBeenCalled();
        });

        it('should rollback transaction and throw AppError on repository error', async () => {
            const dbError = new Error('Database error');
            mockLookupRepository.exists.mockResolvedValue(false);
            mockLookupRepository.create.mockRejectedValue(dbError);

            await expect(lookupService.createLookup(mockLookupData))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.createLookup(mockLookupData))
                .rejects
                .toMatchObject({
                    message: 'Failed to create lookup entry',
                    statusCode: 500,
                    errorCode: 'LOOKUP_CREATION_ERROR'
                });

            expect(mockClient.rollback).toHaveBeenCalled();
            expect(mockClient.release).toHaveBeenCalled();
            expect(mockClient.commit).not.toHaveBeenCalled();
        });

        it('should release connection even if rollback fails', async () => {
            mockLookupRepository.exists.mockResolvedValue(true);
            mockClient.rollback.mockRejectedValue(new Error('Rollback failed'));

            await expect(lookupService.createLookup(mockLookupData))
                .rejects
                .toThrow();

            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should re-throw AppError without wrapping', async () => {
            const customAppError = new AppError('Custom error', 400, 'CUSTOM_ERROR');
            mockLookupRepository.exists.mockResolvedValue(false);
            mockLookupRepository.create.mockRejectedValue(customAppError);

            await expect(lookupService.createLookup(mockLookupData))
                .rejects
                .toBe(customAppError);

            expect(mockClient.rollback).toHaveBeenCalled();
        });
    });

    describe('getByKey', () => {
        it('should return lookup data when key exists', async () => {
            const mockLookup = { id: 1, lookupKey: 'TEST_KEY', value: 'test' };
            mockLookupRepository.getByKey.mockResolvedValue(mockLookup);

            const result = await lookupService.getByKey('TEST_KEY');

            expect(mockLookupRepository.getByKey).toHaveBeenCalledWith('TEST_KEY');
            expect(result).toEqual(mockLookup);
        });

        it('should throw AppError when key does not exist', async () => {
            mockLookupRepository.getByKey.mockResolvedValue(null);

            await expect(lookupService.getByKey('INVALID_KEY'))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.getByKey('INVALID_KEY'))
                .rejects
                .toMatchObject({
                    message: 'Lookup Entry with Key INVALID_KEY not found',
                    statusCode: 404,
                    errorCode: 'LOOKUP_NOT_FOUND',
                    details: {
                        lookupKey: 'INVALID_KEY',
                        suggestion: 'Please verify the Lookup Key and try again',
                        searchHint: 'You can search for lookup entries using the list endpoint'
                    }
                });
        });

        it('should handle undefined return from repository', async () => {
            mockLookupRepository.getByKey.mockResolvedValue(undefined);

            await expect(lookupService.getByKey('UNDEFINED_KEY'))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('deleteLookup', () => {
        const lookupKey = 'TEST_KEY';

        it('should delete lookup successfully when key exists', async () => {
            const mockLookup = { id: 1, lookupKey, value: 'test' };
            mockLookupRepository.getByKey.mockResolvedValue(mockLookup);
            mockLookupRepository.delete.mockResolvedValue(true);

            const result = await lookupService.deleteLookup(lookupKey);

            expect(mockLookupRepository.getByKey).toHaveBeenCalledWith(lookupKey);
            expect(mockLookupRepository.delete).toHaveBeenCalledWith(lookupKey);
            expect(result).toMatchObject({
                success: true,
                message: 'Lookup entry deleted successfully',
                data: {
                    lookupKey
                }
            });
            expect(result.data.deletedAt).toBeDefined();
            expect(new Date(result.data.deletedAt).toString()).not.toBe('Invalid Date');
        });

        it('should throw AppError when lookup key does not exist on initial check', async () => {
            mockLookupRepository.getByKey.mockResolvedValue(null);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toMatchObject({
                    message: `Lookup Key with ${lookupKey} not found`,
                    statusCode: 404,
                    errorCode: 'LOOKUP_NOT_FOUND'
                });

            expect(mockLookupRepository.delete).not.toHaveBeenCalled();
        });

        it('should throw AppError when delete operation returns false', async () => {
            const mockLookup = { id: 1, lookupKey, value: 'test' };
            mockLookupRepository.getByKey.mockResolvedValue(mockLookup);
            mockLookupRepository.delete.mockResolvedValue(false);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toMatchObject({
                    message: `Lookup with lookup key ${lookupKey} not found`,
                    statusCode: 404,
                    errorCode: 'LOOKUP_NOT_FOUND',
                    details: {
                        lookupKey,
                        suggestion: 'Please verify the lookup key and try again'
                    }
                });
        });

        it('should throw AppError on repository error', async () => {
            const mockLookup = { id: 1, lookupKey, value: 'test' };
            const dbError = new Error('Database connection lost');
            mockLookupRepository.getByKey.mockResolvedValue(mockLookup);
            mockLookupRepository.delete.mockRejectedValue(dbError);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toThrow(AppError);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toMatchObject({
                    message: 'Failed to delete lookup entry',
                    statusCode: 500,
                    errorCode: 'LOOKUP_DELETION_ERROR',
                    details: {
                        lookupKey,
                        operation: 'deleteLookup'
                    }
                });
        });

        it('should re-throw AppError without wrapping', async () => {
            const customAppError = new AppError('Custom delete error', 403, 'FORBIDDEN');
            const mockLookup = { id: 1, lookupKey, value: 'test' };
            mockLookupRepository.getByKey.mockResolvedValue(mockLookup);
            mockLookupRepository.delete.mockRejectedValue(customAppError);

            await expect(lookupService.deleteLookup(lookupKey))
                .rejects
                .toBe(customAppError);
        });
    });

    describe('Edge Cases', () => {
        it('should handle null pagination options', async () => {
            const mockData = {
                data: [],
                totalRecords: 0
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll(null);

            expect(result.pagination.limit).toBe(10);
            expect(result.pagination.currentPage).toBe(1);
        });

        it('should handle undefined pagination options', async () => {
            const mockData = {
                data: [],
                totalRecords: 0
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll(undefined);

            expect(result.pagination.limit).toBe(10);
            expect(result.pagination.currentPage).toBe(1);
        });

        it('should calculate total pages correctly with exact division', async () => {
            const mockData = {
                data: [],
                totalRecords: 30
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll({ limit: 10, page: 1 });

            expect(result.pagination.totalPages).toBe(3);
        });

        it('should handle single record pagination', async () => {
            const mockData = {
                data: [{ id: 1 }],
                totalRecords: 1
            };
            mockLookupRepository.getAll.mockResolvedValue(mockData);

            const result = await lookupService.getAll({ limit: 10, page: 1 });

            expect(result.pagination).toMatchObject({
                currentPage: 1,
                totalPages: 1,
                totalRecords: 1,
                hasNextPage: false,
                hasPrevPage: false,
                nextPage: null,
                prevPage: null
            });
        });
    });
});