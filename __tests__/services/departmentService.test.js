const DepartmentService = require('../../services/departmentService');
const AppError = require('../../utils/appError');

describe('DepartmentService', () => {
    let departmentService;
    let mockDepartmentRepository;
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

        mockDepartmentRepository = {
            existsByName: jest.fn(),
            create: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByClientId: jest.fn()
        };

        departmentService = new DepartmentService(mockDepartmentRepository, mockDb);

        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.clearAllMocks();
        console.error.mockRestore();
    });

    describe('createDepartment', () => {
        const validDepartmentData = {
            departmentName: 'Engineering',
            clientId: 1
        };

        describe('Success Cases', () => {
            it('should create a department successfully with valid data', async () => {
                const expectedResult = { id: 1, ...validDepartmentData };
                mockDepartmentRepository.existsByName.mockResolvedValue(false);
                mockDepartmentRepository.create.mockResolvedValue(expectedResult);

                const result = await departmentService.createDepartment(validDepartmentData);

                expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
                expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
                expect(mockDepartmentRepository.existsByName).toHaveBeenCalledWith(
                    validDepartmentData.departmentName,
                    validDepartmentData.clientId,
                    null,
                    mockClient
                );
                expect(mockDepartmentRepository.create).toHaveBeenCalledWith(validDepartmentData, mockClient);
                expect(mockClient.commit).toHaveBeenCalledTimes(1);
                expect(mockClient.rollback).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
                expect(result).toEqual(expectedResult);
            });
        });

        describe('Validation Errors', () => {
            it('should throw AppError when department name already exists', async () => {
                mockDepartmentRepository.existsByName.mockResolvedValue(true);

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toThrow(AppError);

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toMatchObject({
                        message: 'A department with this name already exists for this client',
                        statusCode: 409,
                        errorCode: 'DUPLICATE_DEPARTMENT_NAME'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(2);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockDepartmentRepository.create).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(2);
            });

            it('should rollback transaction on duplicate name error', async () => {
                mockDepartmentRepository.existsByName.mockResolvedValue(true);

                try {
                    await departmentService.createDepartment(validDepartmentData);
                } catch (error) {
                    expect(mockClient.beginTransaction).toHaveBeenCalled();
                    expect(mockClient.rollback).toHaveBeenCalled();
                    expect(mockClient.commit).not.toHaveBeenCalled();
                }
            });
        });

        describe('Database Errors', () => {
            it('should handle database connection failure', async () => {
                mockDb.getConnection.mockRejectedValue(new Error('Connection failed'));

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toThrow('Connection failed');
            });

            it('should rollback and throw AppError on repository create failure', async () => {
                mockDepartmentRepository.existsByName.mockResolvedValue(false);
                mockDepartmentRepository.create.mockRejectedValue(new Error('DB Insert Error'));

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toMatchObject({
                        message: 'Failed to create Department',
                        statusCode: 500,
                        errorCode: 'DEPARTMENT_CREATION_ERROR'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
                expect(console.error).toHaveBeenCalled();
            });

            it('should handle transaction begin failure', async () => {
                mockClient.beginTransaction.mockRejectedValue(new Error('Transaction error'));

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toThrow();

                expect(mockClient.release).toHaveBeenCalled();
            });

            it('should handle transaction commit failure', async () => {
                mockDepartmentRepository.existsByName.mockResolvedValue(false);
                mockDepartmentRepository.create.mockResolvedValue({ id: 1 });
                mockClient.commit.mockRejectedValue(new Error('Commit failed'));

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toThrow();

                expect(mockClient.rollback).toHaveBeenCalled();
            });
        });

        describe('Edge Cases', () => {
            it('should ensure client is released even when rollback fails', async () => {
                mockDepartmentRepository.existsByName.mockResolvedValue(false);
                mockDepartmentRepository.create.mockRejectedValue(new Error('Create failed'));
                mockClient.rollback.mockRejectedValue(new Error('Rollback failed'));

                await expect(departmentService.createDepartment(validDepartmentData))
                    .rejects
                    .toThrow();

                expect(mockClient.release).toHaveBeenCalled();
            });
        });
    });

    describe('getDepartmentById', () => {
        const departmentId = 1;
        const existingDepartment = {
            id: departmentId,
            departmentName: 'Engineering',
            clientId: 1
        };

        it('should return department by id if found', async () => {
            mockDepartmentRepository.findById.mockResolvedValue(existingDepartment);

            const result = await departmentService.getDepartmentById(departmentId);

            expect(mockDepartmentRepository.findById).toHaveBeenCalledWith(departmentId);
            expect(result).toEqual(existingDepartment);
        });

        it('should throw AppError if department not found', async () => {
            mockDepartmentRepository.findById.mockResolvedValue(null);

            await expect(departmentService.getDepartmentById(departmentId))
                .rejects
                .toMatchObject({
                    message: `Department with ID ${departmentId} not found`,
                    statusCode: 404,
                    errorCode: 'DEPARTMENT_NOT_FOUND'
                });
        });
    });

    describe('updateDepartment', () => {
        const departmentId = 1;
        const existingDepartment = {
            id: departmentId,
            departmentName: 'Engineering',
            clientId: 1
        };

        describe('Success Cases', () => {
            it('should update department with valid data', async () => {
                const updateData = { departmentName: 'HR' };

                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(existingDepartment);
                mockDepartmentRepository.existsByName.mockResolvedValue(false);
                mockDepartmentRepository.update.mockResolvedValue(undefined);
                mockClient.commit.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue({ ...existingDepartment, ...updateData });

                const result = await departmentService.updateDepartment(departmentId, updateData);

                expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
                expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
                expect(mockDepartmentRepository.findById).toHaveBeenCalledWith(departmentId, mockClient);
                expect(mockDepartmentRepository.existsByName).toHaveBeenCalledWith(
                    updateData.departmentName,
                    existingDepartment.clientId,
                    departmentId,
                    mockClient
                );
                expect(mockDepartmentRepository.update).toHaveBeenCalledWith(departmentId, updateData, mockClient);
                expect(mockClient.commit).toHaveBeenCalledTimes(1);
                expect(mockClient.rollback).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
                expect(result.departmentName).toBe(updateData.departmentName);
            });
        });

        describe('Validation Errors', () => {
            it('should throw AppError if department not found', async () => {
                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(null);

                await expect(departmentService.updateDepartment(departmentId, { departmentName: 'HR' }))
                    .rejects
                    .toMatchObject({
                        message: `Department with ID ${departmentId} not found`,
                        statusCode: 404,
                        errorCode: 'DEPARTMENT_NOT_FOUND'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
            });

            it('should throw AppError for duplicate department name when updating', async () => {
                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(existingDepartment);
                mockDepartmentRepository.existsByName.mockResolvedValue(true);

                await expect(departmentService.updateDepartment(departmentId, { departmentName: 'HR' }))
                    .rejects
                    .toMatchObject({
                        message: 'A department with this name already exists for this client',
                        statusCode: 409,
                        errorCode: 'DUPLICATE_DEPARTMENT_NAME'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
            });
        });

        describe('Database Errors', () => {
            it('should handle update failure', async () => {
                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(existingDepartment);
                mockDepartmentRepository.existsByName.mockResolvedValue(false);
                mockDepartmentRepository.update.mockRejectedValue(new Error('Update failed'));

                await expect(departmentService.updateDepartment(departmentId, { departmentName: 'HR' }))
                    .rejects
                    .toThrow();

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('deleteDepartment', () => {
        const departmentId = 1;
        const existingDepartment = {
            id: departmentId,
            departmentName: 'Engineering',
            clientId: 1
        };

        describe('Success Cases', () => {
            it('should delete department successfully', async () => {
                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(existingDepartment);
                mockDepartmentRepository.delete.mockResolvedValue(undefined);
                mockClient.commit.mockResolvedValue(undefined);

                const result = await departmentService.deleteDepartment(departmentId);

                expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
                expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
                expect(mockDepartmentRepository.findById).toHaveBeenCalledWith(departmentId, mockClient);
                expect(mockDepartmentRepository.delete).toHaveBeenCalledWith(departmentId, mockClient);
                expect(mockClient.commit).toHaveBeenCalledTimes(1);
                expect(mockClient.rollback).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
                expect(result).toEqual({ deletedDepartment: existingDepartment });
            });
        });

        describe('Validation Errors', () => {
            it('should throw AppError if department not found before delete', async () => {
                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(null);

                await expect(departmentService.deleteDepartment(departmentId))
                    .rejects
                    .toMatchObject({
                        message: `Department with ID ${departmentId} not found`,
                        statusCode: 404,
                        errorCode: 'DEPARTMENT_NOT_FOUND'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
            });
        });

        describe('Database Errors', () => {
            it('should handle repository delete failure', async () => {
                mockDb.getConnection.mockResolvedValue(mockClient);
                mockClient.beginTransaction.mockResolvedValue(undefined);
                mockDepartmentRepository.findById.mockResolvedValue(existingDepartment);
                mockDepartmentRepository.delete.mockRejectedValue(new Error('Delete failed'));

                await expect(departmentService.deleteDepartment(departmentId))
                    .rejects
                    .toThrow();

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('getDepartmentsByClientId', () => {
        it('should return array of departments for client', async () => {
            const clientId = 1;
            const departments = [
                { id: 1, departmentName: 'HR', clientId },
                { id: 2, departmentName: 'Finance', clientId }
            ];
            mockDepartmentRepository.findByClientId.mockResolvedValue(departments);

            const result = await departmentService.getDepartmentsByClientId(clientId);

            expect(mockDepartmentRepository.findByClientId).toHaveBeenCalledWith(clientId);
            expect(result).toEqual(departments);
        });
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with repository and database', () => {
            const service = new DepartmentService(mockDepartmentRepository, mockDb);

            expect(service.departmentRepository).toBe(mockDepartmentRepository);
            expect(service.db).toBe(mockDb);
        });

        it('should work with different repository implementations', () => {
            const alternateRepo = { ...mockDepartmentRepository };
            const service = new DepartmentService(alternateRepo, mockDb);

            expect(service.departmentRepository).toBe(alternateRepo);
        });
    });

    describe('Error Handling Consistency', () => {
        it('should always log errors before throwing wrapped errors', async () => {
            mockDepartmentRepository.existsByName.mockResolvedValue(false);
            mockDepartmentRepository.create.mockRejectedValue(new Error('Test error'));

            try {
                await departmentService.createDepartment({ departmentName: 'Test', clientId: 1 });
            } catch (error) {
                expect(console.error).toHaveBeenCalled();
                expect(error).toBeInstanceOf(AppError);
            }
        });

        it('should preserve original AppError instances', async () => {
            const originalError = new AppError('Original', 400, 'ORIGINAL_CODE');
            mockDepartmentRepository.existsByName.mockRejectedValue(originalError);

            try {
                await departmentService.createDepartment({ departmentName: 'Test', clientId: 1 });
            } catch (error) {
                expect(error).toBe(originalError);
            }
        });

        it('should include operation context in all error metadata', async () => {
            const operations = [
                {
                    method: () => departmentService.createDepartment({ departmentName: 'Test', clientId: 1 }),
                    setup: () => {
                        mockDepartmentRepository.existsByName.mockResolvedValue(false);
                        mockDepartmentRepository.create.mockRejectedValue(new Error('Error'));
                    },
                    operation: 'createDepartment'
                },
                {
                    method: () => departmentService.updateDepartment(1, { departmentName: 'Test' }),
                    setup: () => {
                        mockDepartmentRepository.findById.mockRejectedValue(new Error('Error'));
                    },
                    operation: 'updateDepartment'
                },
                {
                    method: () => departmentService.deleteDepartment(1),
                    setup: () => {
                        mockDepartmentRepository.findById.mockRejectedValue(new Error('Error'));
                    },
                    operation: 'deleteDepartment'
                }
            ];

            for (const { method, setup, operation } of operations) {
                jest.clearAllMocks();
                setup();

                try {
                    await method();
                } catch (error) {
                    expect(error.details.operation).toBe(operation);
                }
            }
        });
    });
});