const LookupRepository = require('../../repositories/lookupRepository');
const AppError = require('../../utils/appError');

describe('LookupRepository', () => {
    let lookupRepository;
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        mockConnection = {
            query: jest.fn(),
            execute: jest.fn(),
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined)
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        lookupRepository = new LookupRepository(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getAll', () => {
        it('should return paginated lookup data with default parameters', async () => {
            const mockCountResult = [[{ total: 25 }]];
            const mockDataResult = [[
                { tag: 'TAG1', lookupKey: 1, value: 'value1' },
                { tag: 'TAG2', lookupKey: 2, value: 'value2' }
            ]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await lookupRepository.getAll(10, 1, mockConnection);

            expect(mockConnection.query).toHaveBeenCalledTimes(2);
            expect(mockConnection.query).toHaveBeenNthCalledWith(1,
                'SELECT COUNT(lookupKey) as total FROM lookup'
            );
            expect(mockConnection.query).toHaveBeenNthCalledWith(2,
                expect.stringContaining('SELECT tag, lookupKey, value FROM lookup'),
                [10, 0]
            );
            expect(result).toEqual({
                data: mockDataResult[0],
                totalRecords: 25
            });
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should calculate offset correctly for different pages', async () => {
            const mockCountResult = [[{ total: 50 }]];
            const mockDataResult = [[{ tag: 'TAG1', lookupKey: 11, value: 'value11' }]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            await lookupRepository.getAll(10, 3, mockConnection);

            expect(mockConnection.query).toHaveBeenNthCalledWith(2,
                expect.any(String),
                [10, 20] // page 3 with limit 10 = offset 20
            );
        });

        it('should handle custom limit and page parameters', async () => {
            const mockCountResult = [[{ total: 100 }]];
            const mockDataResult = [[{ tag: 'TAG1', lookupKey: 1, value: 'value1' }]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            await lookupRepository.getAll(20, 2, mockConnection);

            expect(mockConnection.query).toHaveBeenNthCalledWith(2,
                expect.any(String),
                [20, 20]
            );
        });

        it('should handle invalid limit by using minimum of 1', async () => {
            const mockCountResult = [[{ total: 10 }]];
            const mockDataResult = [[{ tag: 'TAG1', lookupKey: 1, value: 'value1' }]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            await lookupRepository.getAll(0, 1, mockConnection);

            expect(mockConnection.query).toHaveBeenNthCalledWith(2,
                expect.any(String),
                [1, 0] // limit should be at least 1
            );
        });

        it('should handle invalid offset by using minimum of 0', async () => {
            const mockCountResult = [[{ total: 10 }]];
            const mockDataResult = [[{ tag: 'TAG1', lookupKey: 1, value: 'value1' }]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            await lookupRepository.getAll(10, 0, mockConnection);

            expect(mockConnection.query).toHaveBeenNthCalledWith(2,
                expect.any(String),
                [10, 0] // offset should be at least 0
            );
        });

        it('should use provided client connection and not release it', async () => {
            const mockCountResult = [[{ total: 5 }]];
            const mockDataResult = [[{ tag: 'TAG1', lookupKey: 1, value: 'value1' }]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            await lookupRepository.getAll(10, 1, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should handle empty results', async () => {
            const mockCountResult = [[{ total: 0 }]];
            const mockDataResult = [[]];

            mockConnection.query
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await lookupRepository.getAll(10, 1, mockConnection);

            expect(result).toEqual({
                data: [],
                totalRecords: 0
            });
        });

        it('should throw AppError on database error', async () => {
            const dbError = new Error('Connection lost');
            dbError.code = 'ECONNRESET';
            mockConnection.query.mockRejectedValue(dbError);

            await expect(lookupRepository.getAll(10, 1, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.getAll(10, 1, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 503,
                    errorCode: 'DATABASE_CONNECTION_ERROR'
                });
        });
    });

    describe('getByKey', () => {
        it('should return lookup data for valid key', async () => {
            const mockLookupData = [{ tag: 'TEST_TAG', lookupKey: 123, value: 'test_value' }];
            mockConnection.query.mockResolvedValue([mockLookupData]);

            const result = await lookupRepository.getByKey(123, mockConnection);

            expect(mockConnection.query).toHaveBeenCalledWith(
                'SELECT tag, lookupKey, value FROM lookup WHERE lookupKey=?',
                [123]
            );
            expect(result).toEqual({
                data: mockLookupData
            });
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should return empty data array when key not found', async () => {
            mockConnection.query.mockResolvedValue([[]]);

            const result = await lookupRepository.getByKey(999, mockConnection);

            expect(result).toEqual({
                data: []
            });
        });

        it('should handle string lookupKey', async () => {
            const mockLookupData = [{ tag: 'TEST_TAG', lookupKey: 'ABC123', value: 'test_value' }];
            mockConnection.query.mockResolvedValue([mockLookupData]);

            const result = await lookupRepository.getByKey('ABC123', mockConnection);

            expect(mockConnection.query).toHaveBeenCalledWith(
                expect.any(String),
                ['ABC123']
            );
            expect(result.data).toEqual(mockLookupData);
        });

        it('should throw AppError on database error', async () => {
            const dbError = new Error('Table not found');
            dbError.code = 'ER_NO_SUCH_TABLE';
            mockConnection.query.mockRejectedValue(dbError);

            await expect(lookupRepository.getByKey(123, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.getByKey(123, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 500,
                    errorCode: 'DATABASE_SCHEMA_ERROR',
                    message: 'Required database table not found'
                });
        });

        it('should not release connection even on error', async () => {
            const dbError = new Error('Query error');
            dbError.code = 'UNKNOWN_ERROR';
            mockConnection.query.mockRejectedValue(dbError);

            await expect(lookupRepository.getByKey(123, mockConnection))
                .rejects
                .toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('getByTag', () => {
        it('should return lookup data for valid tag', async () => {
            const mockLookupData = [
                { lookupKey: 1, tag: 'STATUS', value: 'ACTIVE' },
                { lookupKey: 2, tag: 'STATUS', value: 'INACTIVE' }
            ];
            mockConnection.query.mockResolvedValue([mockLookupData]);

            const result = await lookupRepository.getByTag('STATUS', mockConnection);

            expect(mockConnection.query).toHaveBeenCalledWith(
                'SELECT lookupKey,tag,value FROM lookup WHERE tag=?',
                ['STATUS']
            );
            expect(result).toEqual({
                data: mockLookupData
            });
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should return empty data array when tag not found', async () => {
            mockConnection.query.mockResolvedValue([[]]);

            const result = await lookupRepository.getByTag('NON_EXISTENT_TAG', mockConnection);

            expect(result).toEqual({
                data: []
            });
        });

        it('should handle tags with special characters', async () => {
            const mockLookupData = [{ lookupKey: 1, tag: 'TAG_WITH-DASH', value: 'test' }];
            mockConnection.query.mockResolvedValue([mockLookupData]);

            const result = await lookupRepository.getByTag('TAG_WITH-DASH', mockConnection);

            expect(mockConnection.query).toHaveBeenCalledWith(
                expect.any(String),
                ['TAG_WITH-DASH']
            );
            expect(result.data).toEqual(mockLookupData);
        });

        it('should throw AppError on database access error', async () => {
            const dbError = new Error('Access denied');
            dbError.code = 'ER_ACCESS_DENIED_ERROR';
            mockConnection.query.mockRejectedValue(dbError);

            await expect(lookupRepository.getByTag('TEST', mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.getByTag('TEST', mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 500,
                    errorCode: 'DATABASE_ACCESS_ERROR',
                    message: 'Database access denied'
                });
        });
    });

    describe('create', () => {
        const lookupData = { tag: 'NEW_TAG', value: 'NEW_VALUE' };

        it('should create lookup entry successfully', async () => {
            const mockInsertResult = [{ insertId: 123 }];
            mockConnection.execute.mockResolvedValue(mockInsertResult);

            const result = await lookupRepository.create(lookupData, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO lookup'),
                ['NEW_TAG', 'NEW_VALUE']
            );
            expect(result).toEqual({
                lookupKey: 123,
                tag: 'NEW_TAG',
                value: 'NEW_VALUE'
            });
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should use provided client connection and not release it', async () => {
            const mockInsertResult = [{ insertId: 456 }];
            mockConnection.execute.mockResolvedValue(mockInsertResult);

            await lookupRepository.create(lookupData, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should throw AppError on duplicate entry', async () => {
            const dbError = new Error('Duplicate entry');
            dbError.code = 'ER_DUP_ENTRY';
            dbError.message = 'Duplicate entry for lookupKey';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 409,
                    errorCode: 'DUPLICATE_ENTRY',
                    message: 'A lookup entry with this information already exists'
                });

            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should throw AppError on data too long error', async () => {
            const dbError = new Error('Data too long for column value');
            dbError.code = 'ER_DATA_TOO_LONG';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 400,
                    errorCode: 'DATA_TOO_LONG'
                });
        });

        it('should throw AppError on connection timeout', async () => {
            const dbError = new Error('Connection timeout');
            dbError.code = 'ETIMEDOUT';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 503,
                    errorCode: 'DATABASE_CONNECTION_ERROR'
                });
        });

        it('should throw generic AppError on unknown error', async () => {
            const dbError = new Error('Unknown database error');
            dbError.code = 'UNKNOWN_CODE';
            dbError.sqlState = '45000';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 500,
                    errorCode: 'DATABASE_ERROR',
                    message: 'Database operation failed'
                });
        });

        it('should not release connection even on error', async () => {
            const dbError = new Error('Insert failed');
            dbError.code = 'ER_BAD_FIELD_ERROR';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.create(lookupData, mockConnection))
                .rejects
                .toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('should delete lookup entry successfully', async () => {
            const mockDeleteResult = [{ affectedRows: 1 }];
            mockConnection.execute.mockResolvedValue(mockDeleteResult);

            const result = await lookupRepository.delete(123, mockConnection);

            expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
            expect(mockConnection.execute).toHaveBeenCalledWith(
                'DELETE FROM lookup WHERE lookupKey = ?',
                [123]
            );
            expect(mockConnection.commit).not.toHaveBeenCalled();
            expect(result).toBe(1);
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should return false when no rows affected and rollback', async () => {
            const mockDeleteResult = [{ affectedRows: 0 }];
            mockConnection.execute.mockResolvedValue(mockDeleteResult);

            const result = await lookupRepository.delete(999, mockConnection);

            expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
            expect(result).toBe(false);
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should handle deletion of multiple rows', async () => {
            const mockDeleteResult = [{ affectedRows: 3 }];
            mockConnection.execute.mockResolvedValue(mockDeleteResult);

            const result = await lookupRepository.delete('MULTI_KEY', mockConnection);

            expect(result).toBe(3);
            expect(mockConnection.commit).not.toHaveBeenCalled();
        });

        it('should rollback and throw AppError on database error', async () => {
            const dbError = new Error('Schema error');
            dbError.code = 'ER_BAD_FIELD_ERROR';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.delete(123, mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.delete(123, mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 500,
                    errorCode: 'DATABASE_SCHEMA_ERROR',
                    message: 'Database schema error - invalid field reference'
                });

            expect(mockConnection.rollback).not.toHaveBeenCalled();
            expect(mockConnection.commit).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should not release connection even if rollback fails', async () => {
            const dbError = new Error('Delete failed');
            mockConnection.execute.mockRejectedValue(dbError);
            mockConnection.rollback.mockRejectedValue(new Error('Rollback failed'));

            await expect(lookupRepository.delete(123, mockConnection))
                .rejects
                .toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('exists', () => {
        it('should return lookup data when value exists', async () => {
            const mockResult = [[{ lookupKey: 123 }]];
            mockConnection.execute.mockResolvedValue(mockResult);

            const result = await lookupRepository.exists('EXISTING_VALUE', mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                'SELECT lookupKey FROM lookup WHERE value = ?',
                ['EXISTING_VALUE']
            );
            expect(result).toEqual({ lookupKey: 123 });
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should return null when value does not exist', async () => {
            const mockResult = [[]];
            mockConnection.execute.mockResolvedValue(mockResult);

            const result = await lookupRepository.exists('NON_EXISTENT_VALUE', mockConnection);

            expect(result).toBeNull();
        });

        it('should use provided client connection and not release it', async () => {
            const mockResult = [[{ lookupKey: 456 }]];
            mockConnection.execute.mockResolvedValue(mockResult);

            await lookupRepository.exists('TEST_VALUE', mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should handle empty string value', async () => {
            const mockResult = [[{ lookupKey: 789 }]];
            mockConnection.execute.mockResolvedValue(mockResult);

            const result = await lookupRepository.exists('', mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['']
            );
            expect(result).toEqual({ lookupKey: 789 });
        });

        it('should throw AppError on database error', async () => {
            const dbError = new Error('Connection reset');
            dbError.code = 'ECONNRESET';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.exists('TEST_VALUE', mockConnection))
                .rejects
                .toThrow(AppError);

            await expect(lookupRepository.exists('TEST_VALUE', mockConnection))
                .rejects
                .toMatchObject({
                    statusCode: 503,
                    errorCode: 'DATABASE_CONNECTION_ERROR'
                });
        });

        it('should not release connection even on error', async () => {
            const dbError = new Error('Query failed');
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(lookupRepository.exists('TEST', mockConnection))
                .rejects
                .toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('_handleDatabaseError', () => {
        it('should throw AppError for ER_BAD_FIELD_ERROR', () => {
            const error = new Error('Bad field');
            error.code = 'ER_BAD_FIELD_ERROR';

            expect(() => lookupRepository._handleDatabaseError(error, 'testOp'))
                .toThrow(AppError);

            try {
                lookupRepository._handleDatabaseError(error, 'testOp');
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_SCHEMA_ERROR');
                expect(e.details.operation).toBe('testOp');
            }
        });

        it('should throw AppError for ER_NO_SUCH_TABLE', () => {
            const error = new Error('Table not found');
            error.code = 'ER_NO_SUCH_TABLE';

            expect(() => lookupRepository._handleDatabaseError(error, 'getAll'))
                .toThrow(AppError);

            try {
                lookupRepository._handleDatabaseError(error, 'getAll');
            } catch (e) {
                expect(e.message).toBe('Required database table not found');
                expect(e.errorCode).toBe('DATABASE_SCHEMA_ERROR');
            }
        });

        it('should throw AppError for ER_ACCESS_DENIED_ERROR', () => {
            const error = new Error('Access denied');
            error.code = 'ER_ACCESS_DENIED_ERROR';

            try {
                lookupRepository._handleDatabaseError(error, 'create');
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_ACCESS_ERROR');
                expect(e.details.hint).toBe('Check database permissions');
            }
        });

        it('should throw AppError for ETIMEDOUT', () => {
            const error = new Error('Timeout');
            error.code = 'ETIMEDOUT';

            try {
                lookupRepository._handleDatabaseError(error, 'getByKey');
            } catch (e) {
                expect(e.statusCode).toBe(503);
                expect(e.errorCode).toBe('DATABASE_CONNECTION_ERROR');
                expect(e.message).toBe('Database connection timeout');
            }
        });

        it('should throw AppError for ECONNRESET', () => {
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';

            try {
                lookupRepository._handleDatabaseError(error, 'delete');
            } catch (e) {
                expect(e.statusCode).toBe(503);
                expect(e.errorCode).toBe('DATABASE_CONNECTION_ERROR');
            }
        });

        it('should throw AppError for ER_DUP_ENTRY with field detection', () => {
            const error = new Error('Duplicate entry for lookupKey');
            error.code = 'ER_DUP_ENTRY';

            try {
                lookupRepository._handleDatabaseError(error, 'create');
            } catch (e) {
                expect(e.statusCode).toBe(409);
                expect(e.errorCode).toBe('DUPLICATE_ENTRY');
                expect(e.details.duplicateField).toBe('name');
            }
        });

        it('should throw AppError for ER_DUP_ENTRY without field detection', () => {
            const error = new Error('Duplicate entry');
            error.code = 'ER_DUP_ENTRY';

            try {
                lookupRepository._handleDatabaseError(error, 'create');
            } catch (e) {
                expect(e.details.duplicateField).toBe('unknown');
            }
        });

        it('should throw AppError for ER_DATA_TOO_LONG', () => {
            const error = new Error('Data too long for column value');
            error.code = 'ER_DATA_TOO_LONG';

            try {
                lookupRepository._handleDatabaseError(error, 'create');
            } catch (e) {
                expect(e.statusCode).toBe(400);
                expect(e.errorCode).toBe('DATA_TOO_LONG');
                expect(e.details.field).toBe('Data too long for column value');
            }
        });

        it('should throw generic AppError for unknown error codes', () => {
            const error = new Error('Unknown error');
            error.code = 'UNKNOWN_CODE';
            error.sqlState = '45000';

            try {
                lookupRepository._handleDatabaseError(error, 'testOp');
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_ERROR');
                expect(e.message).toBe('Database operation failed');
                expect(e.details.operation).toBe('testOp');
                expect(e.details.code).toBe('UNKNOWN_CODE');
                expect(e.details.sqlState).toBe('45000');
            }
        });

        it('should handle errors without code property', () => {
            const error = new Error('Generic error');

            try {
                lookupRepository._handleDatabaseError(error, 'testOp');
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_ERROR');
                expect(e.details.code).toBeUndefined();
            }
        });
    });
});