const DepartmentRepository = require('../../repositories/departmentRepository');
const AppError = require('../../utils/appError');

describe('DepartmentRepository', () => {
    let departmentRepository;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        mockClient = {
            execute: jest.fn(),
            release: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        departmentRepository = new DepartmentRepository(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findById', () => {
        const mockDepartmentId = 1;
        const mockDepartment = {
            departmentId: 1,
            departmentName: 'Engineering',
            departmentDescription: 'Engineering Dept',
            clientId: 1
        };

        it('should retrieve department by ID successfully', async () => {
            mockClient.execute.mockResolvedValue([[mockDepartment]]);

            const result = await departmentRepository.findById(mockDepartmentId, mockClient);

            expect(result).toEqual(mockDepartment);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT departmentId'),
                [mockDepartmentId]
            );
        });

        it('should return null when department is not found', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            const result = await departmentRepository.findById(999, mockClient);

            expect(result).toBeNull();
        });

        it('should handle database errors properly', async () => {
            const dbError = new Error('Database error');
            dbError.code = 'ER_BAD_FIELD_ERROR';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(departmentRepository.findById(mockDepartmentId, mockClient))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when error occurs', async () => {
            mockClient.execute.mockRejectedValue(new Error('Connection lost'));

            await expect(departmentRepository.findById(mockDepartmentId, mockClient)).rejects.toThrow();
        });
    });

    describe('create', () => {
        const mockDepartmentData = {
            departmentName: 'Sales',
            departmentDescription: 'Sales Dept',
            clientId: 2
        };

        const mockInsertResult = {
            insertId: 42,
            affectedRows: 1
        };

        it('should create department successfully', async () => {
            mockClient.execute.mockResolvedValue([mockInsertResult]);

            const result = await departmentRepository.create(mockDepartmentData, mockClient);

            expect(result).toEqual({
                departmentId: 42,
                ...mockDepartmentData
            });
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO department'),
                [
                    mockDepartmentData.departmentName,
                    mockDepartmentData.departmentDescription,
                    mockDepartmentData.clientId
                ]
            );
        });

        it('should handle duplicate entry error', async () => {
            const dupError = new Error('Duplicate entry');
            dupError.code = 'ER_DUP_ENTRY';
            mockClient.execute.mockRejectedValue(dupError);

            await expect(departmentRepository.create(mockDepartmentData, mockClient))
                .rejects
                .toMatchObject({
                    statusCode: 409,
                    errorCode: 'DUPLICATE_ENTRY'
                });
        });

        it('should handle other database errors with AppError', async () => {
            const dbError = new Error('Other DB error');
            dbError.code = 'ER_ACCESS_DENIED_ERROR';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(departmentRepository.create(mockDepartmentData, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('update', () => {
        const mockDepartmentId = 1;
        const mockUpdateData = {
            departmentName: 'Marketing',
            departmentDescription: 'Marketing Dept'
        };

        it('should update department successfully', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await departmentRepository.update(mockDepartmentId, mockUpdateData, mockClient);

            expect(result).toEqual({
                departmentId: mockDepartmentId,
                ...mockUpdateData
            });
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE department SET'),
                expect.arrayContaining([...Object.values(mockUpdateData), mockDepartmentId])
            );
        });

        it('should throw AppError when department not found on update', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(departmentRepository.update(mockDepartmentId, mockUpdateData, mockClient))
                .rejects
                .toMatchObject({
                    statusCode: 404,
                    errorCode: 'DEPARTMENT_NOT_FOUND'
                });
        });

        it('should handle database errors properly during update', async () => {
            const dbError = new Error('Update failed');
            dbError.code = 'ER_DATA_TOO_LONG';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(departmentRepository.update(mockDepartmentId, mockUpdateData, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('delete', () => {
        const mockDepartmentId = 1;

        it('should delete department successfully', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await departmentRepository.delete(mockDepartmentId, mockClient);

            expect(result).toBe(1);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM department'),
                [mockDepartmentId]
            );
        });

        it('should throw AppError when department not found on delete', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(departmentRepository.delete(mockDepartmentId, mockClient))
                .rejects
                .toMatchObject({
                    statusCode: 404,
                    errorCode: 'DEPARTMENT_NOT_FOUND'
                });
        });

        it('should handle database errors during delete', async () => {
            const dbError = new Error('Delete failed');
            dbError.code = 'ER_ACCESS_DENIED_ERROR';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(departmentRepository.delete(mockDepartmentId, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('findByClientId', () => {
        const clientId = 1;
        const mockDepartments = [
            { departmentId: 1, departmentName: 'HR', clientId },
            { departmentId: 2, departmentName: 'Finance', clientId }
        ];

        it('should return departments for given client ID', async () => {
            mockClient.execute.mockResolvedValue([mockDepartments]);

            const result = await departmentRepository.findByClientId(clientId, mockClient);

            expect(result).toEqual(mockDepartments);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT departmentId'),
                [clientId]
            );
        });

        it('should handle database errors during findByClientId', async () => {
            const dbError = new Error('Query failed');
            dbError.code = 'ER_NO_SUCH_TABLE';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(departmentRepository.findByClientId(clientId, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('existsByName', () => {
        const departmentName = 'HR';
        const clientId = 1;

        it('should return true when department name exists', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 1 }]]);

            const result = await departmentRepository.existsByName(departmentName, clientId, null, mockClient);

            expect(result).toBe(true);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*) as count'),
                [departmentName, clientId]
            );
        });

        it('should return false when department name does not exist', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 0 }]]);

            const result = await departmentRepository.existsByName('NonExistentDept', clientId, null, mockClient);

            expect(result).toBe(false);
        });

        it('should exclude a department ID when provided', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 0 }]]);
            const excludeId = 5;

            await departmentRepository.existsByName(departmentName, clientId, excludeId, mockClient);

            const queryCalled = mockClient.execute.mock.calls[0][0];
            const paramsCalled = mockClient.execute.mock.calls[0][1];

            expect(queryCalled).toContain('AND departmentId != ?');
            expect(paramsCalled).toEqual([departmentName, clientId, excludeId]);
        });

        it('should use provided client connection when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[{ count: 1 }]])
            };

            await departmentRepository.existsByName(departmentName, clientId, null, externalClient);

            expect(externalClient.execute).toHaveBeenCalledTimes(1);
        });

        it('should handle database errors in existsByName', async () => {
            const dbError = new Error('Query failed');
            dbError.code = 'ER_NO_SUCH_TABLE';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(departmentRepository.existsByName(departmentName, clientId, null, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('_handleDatabaseError', () => {
        it('should throw AppError for ER_DUP_ENTRY', () => {
            const error = new Error('Duplicate entry for departmentName');
            error.code = 'ER_DUP_ENTRY';

            expect(() => departmentRepository._handleDatabaseError(error))
                .toThrow(AppError);

            try {
                departmentRepository._handleDatabaseError(error);
            } catch (err) {
                expect(err.statusCode).toBe(409);
                expect(err.errorCode).toBe('DUPLICATE_ENTRY');
                expect(err.message).toContain('already exists');
            }
        });

        it('should throw AppError for ER_DATA_TOO_LONG', () => {
            const error = new Error('Data too long for column');
            error.code = 'ER_DATA_TOO_LONG';

            try {
                departmentRepository._handleDatabaseError(error);
            } catch (err) {
                expect(err.statusCode).toBe(400);
                expect(err.errorCode).toBe('DATA_TOO_LONG');
            }
        });

        it('should throw AppError for ER_BAD_NULL_ERROR', () => {
            const error = new Error('Null constraint violation');
            error.code = 'ER_BAD_NULL_ERROR';

            try {
                departmentRepository._handleDatabaseError(error);
            } catch (err) {
                expect(err.statusCode).toBe(400);
                expect(err.errorCode).toBe('NULL_CONSTRAINT_VIOLATION');
            }
        });

        it('should throw AppError for ER_NO_REFERENCED_ROW_2', () => {
            const error = new Error('Invalid clientId');
            error.code = 'ER_NO_REFERENCED_ROW_2';

            try {
                departmentRepository._handleDatabaseError(error);
            } catch (err) {
                expect(err.statusCode).toBe(400);
                expect(err.errorCode).toBe('FOREIGN_KEY_CONSTRAINT');
            }
        });

        it('should throw generic AppError for unknown error codes', () => {
            const error = new Error('Unknown error');
            error.code = 'UNKNOWN_ERROR';
            error.sqlState = '42000';

            try {
                departmentRepository._handleDatabaseError(error);
            } catch (err) {
                expect(err.statusCode).toBe(500);
                expect(err.errorCode).toBe('DATABASE_ERROR');
                expect(err.details.code).toBe('UNKNOWN_ERROR');
                expect(err.details.sqlState).toBe('42000');
            }
        });
    });
});