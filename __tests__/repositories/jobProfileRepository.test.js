const JobProfileRepository = require('../../repositories/jobProfileRepository');
const AppError = require('../../utils/appError');

describe('JobProfileRepository', () => {
    let repository;
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        mockConnection = {
            execute: jest.fn(),
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

    describe('create', () => {
        const jobProfileData = {
            clientId: 'client-123',
            departmentId: 'dept-1',
            jobProfileDescription: 'Senior developer position',
            jobRole: 'Software Engineer',
            techSpecification: 'Node.js, React',
            positions: 3,
            estimatedCloseDate: '2025-12-31',
            locationId: 'loc-1',
            statusId: 7,
        };

        it('should create job profile successfully without client', async () => {
            const mockResult = { insertId: 101 };
            mockConnection.execute.mockResolvedValue([mockResult]);

            const result = await repository.create(jobProfileData, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO jobProfile'),
                [
                    jobProfileData.clientId,
                    jobProfileData.departmentId,
                    jobProfileData.jobProfileDescription,
                    jobProfileData.jobRole,
                    jobProfileData.techSpecification,
                    jobProfileData.positions,
                    jobProfileData.estimatedCloseDate,
                    jobProfileData.locationId,
                    jobProfileData.statusId,
                ]
            );
            expect(mockConnection.release).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                jobProfileId: 101,
                ...jobProfileData,
            });
            expect(result.receivedOn).toBeInstanceOf(Date);
        });

        it('should create job profile with provided client connection', async () => {
            const mockResult = { insertId: 102 };
            mockConnection.execute.mockResolvedValue([mockResult]);

            const result = await repository.create(jobProfileData, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
            expect(result.jobProfileId).toBe(102);
        });

        it('should use default statusId of 7 when not provided', async () => {
            const dataWithoutStatus = { ...jobProfileData };
            delete dataWithoutStatus.statusId;

            const mockResult = { insertId: 103 };
            mockConnection.execute.mockResolvedValue([mockResult]);

            await repository.create(dataWithoutStatus, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([7])
            );
        });

        it('should use null for estimatedCloseDate when not provided', async () => {
            const dataWithoutDate = { ...jobProfileData };
            delete dataWithoutDate.estimatedCloseDate;

            const mockResult = { insertId: 104 };
            mockConnection.execute.mockResolvedValue([mockResult]);

            await repository.create(dataWithoutDate, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([null])
            );
        });

        it('should handle duplicate entry error', async () => {
            const dbError = { code: 'ER_DUP_ENTRY', message: 'Duplicate entry' };
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(repository.create(jobProfileData, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'A job profile with this role already exists for this client',
                    statusCode: 409,
                    errorCode: 'DUPLICATE_ENTRY',
                });

            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should handle foreign key constraint error', async () => {
            const dbError = { code: 'ER_NO_REFERENCED_ROW_2', message: 'Foreign key constraint' };
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(repository.create(jobProfileData, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Invalid foreign key provided - referenced record does not exist',
                    statusCode: 400,
                    errorCode: 'FOREIGN_KEY_CONSTRAINT',
                });
        });

        it('should not release connection when error occurs', async () => {
            mockConnection.execute.mockRejectedValue(new Error('Database error'));

            await expect(repository.create(jobProfileData, mockConnection)).rejects.toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should not release connection when client is provided and error occurs', async () => {
            mockConnection.execute.mockRejectedValue(new Error('Database error'));

            await expect(repository.create(jobProfileData, mockConnection)).rejects.toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('findById', () => {
        const jobProfileId = 'profile-123';
        const mockJobProfile = {
            jobProfileId,
            clientId: 'client-123',
            clientName: 'Tech Corp',
            departmentId: 'dept-1',
            departmentName: 'Engineering',
            jobRole: 'Software Engineer',
        };

        it('should find job profile by id successfully', async () => {
            mockConnection.execute.mockResolvedValue([[mockJobProfile]]);

            const result = await repository.findById(jobProfileId, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT jp.jobProfileId'),
                [jobProfileId]
            );
            expect(mockConnection.release).not.toHaveBeenCalled();
            expect(result).toEqual(mockJobProfile);
        });

        it('should return null when job profile not found', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await repository.findById(jobProfileId, mockConnection);

            expect(result).toBeNull();
        });

        it('should throw AppError when jobProfileId is missing', async () => {
            await expect(repository.findById(null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Job Profile ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_JOB_PROFILE_ID',
                });

            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should work with provided client connection', async () => {
            mockConnection.execute.mockResolvedValue([[mockJobProfile]]);

            const result = await repository.findById(jobProfileId, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
            expect(result).toEqual(mockJobProfile);
        });

        it('should rethrow AppError without wrapping', async () => {
            const appError = new AppError('Custom error', 400, 'CUSTOM_ERROR');
            mockConnection.execute.mockRejectedValue(appError);

            await expect(repository.findById(jobProfileId, mockConnection)).rejects.toBe(appError);
        });

        it('should handle database errors', async () => {
            const dbError = { code: 'ECONNREFUSED', message: 'Connection refused' };
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(repository.findById(jobProfileId, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Database connection refused',
                    statusCode: 503,
                    errorCode: 'DATABASE_CONNECTION_ERROR',
                });
        });
    });

    describe('update', () => {
        const jobProfileId = 'profile-123';
        const updateData = {
            jobRole: 'Senior Software Engineer',
            positions: 5,
            statusId: 8,
        };

        it('should update job profile successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await repository.update(jobProfileId, updateData, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE jobProfile SET'),
                ['Senior Software Engineer', 5, 8, jobProfileId]
            );
            expect(mockConnection.release).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                jobProfileId,
                ...updateData
            });
        });

        it('should filter out non-allowed fields', async () => {
            const dataWithInvalidFields = {
                ...updateData,
                invalidField: 'should be filtered',
                anotherBadField: 'also filtered',
            };

            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await repository.update(jobProfileId, dataWithInvalidFields, mockConnection);

            const executedQuery = mockConnection.execute.mock.calls[0][0];
            expect(executedQuery).not.toContain('invalidField');
            expect(executedQuery).not.toContain('anotherBadField');
        });

        it('should throw AppError when jobProfileId is missing', async () => {
            await expect(repository.update(null, updateData, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Job Profile ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_JOB_PROFILE_ID',
                });
        });

        it('should throw AppError when updateData is missing', async () => {
            await expect(repository.update(jobProfileId, null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Update data is required',
                    statusCode: 400,
                    errorCode: 'MISSING_UPDATE_DATA',
                });
        });

        it('should throw AppError when updateData is empty object', async () => {
            await expect(repository.update(jobProfileId, {}, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Update data is required',
                    statusCode: 400,
                    errorCode: 'MISSING_UPDATE_DATA',
                });
        });

        it('should throw AppError when no valid fields to update', async () => {
            await expect(repository.update(jobProfileId, { invalidField: 'value' }, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'No valid fields to update',
                    statusCode: 400,
                    errorCode: 'NO_VALID_FIELDS',
                });
        });

        it('should throw AppError when job profile not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(repository.update(jobProfileId, updateData, mockConnection))
                .rejects
                .toMatchObject({
                    message: `Job profile with ID ${jobProfileId} not found`,
                    statusCode: 404,
                    errorCode: 'JOB_PROFILE_NOT_FOUND',
                });
        });

        it('should work with provided client connection', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await repository.update(jobProfileId, updateData, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should handle data too long error', async () => {
            const dbError = { code: 'ER_DATA_TOO_LONG', message: 'Data too long' };
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(repository.update(jobProfileId, updateData, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'One or more fields exceed the maximum allowed length',
                    statusCode: 400,
                    errorCode: 'DATA_TOO_LONG',
                });
        });
    });

    describe('delete', () => {
        const jobProfileId = 'profile-123';

        it('should delete job profile successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await repository.delete(jobProfileId, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM jobProfile'),
                [jobProfileId]
            );
            expect(mockConnection.release).not.toHaveBeenCalled();
            expect(result).toBe(1);
        });

        it('should throw AppError when jobProfileId is missing', async () => {
            await expect(repository.delete(null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Job Profile ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_JOB_PROFILE_ID',
                });
        });

        it('should throw AppError when job profile not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(repository.delete(jobProfileId, mockConnection))
                .rejects
                .toMatchObject({
                    message: `Job profile with ID ${jobProfileId} not found`,
                    statusCode: 404,
                    errorCode: 'JOB_PROFILE_NOT_FOUND',
                });
        });

        it('should handle foreign key constraint on delete', async () => {
            const dbError = { code: 'ER_ROW_IS_REFERENCED_2', message: 'Row referenced' };
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(repository.delete(jobProfileId, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Cannot delete record - it is referenced by other records',
                    statusCode: 400,
                    errorCode: 'FOREIGN_KEY_CONSTRAINT_DELETE',
                });
        });

        it('should work with provided client connection', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await repository.delete(jobProfileId, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('findByClientId', () => {
        const clientId = 'client-123';
        const mockProfiles = [
            { jobProfileId: 'profile-1', jobRole: 'Developer' },
            { jobProfileId: 'profile-2', jobRole: 'Designer' },
        ];

        it('should find job profiles by client id', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            const result = await repository.findByClientId(clientId, null, null, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE jp.clientId = ?'),
                [clientId]
            );
            expect(result).toEqual(mockProfiles);
        });

        it('should throw AppError when clientId is missing', async () => {
            await expect(repository.findByClientId(null, null, null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Client ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_CLIENT_ID',
                });
        });

        it('should apply limit when provided', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findByClientId(clientId, 10, null, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('LIMIT ?');
            expect(params).toEqual([clientId, 10]);
        });

        it('should apply limit and offset when both provided', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findByClientId(clientId, 10, 20, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('LIMIT ?');
            expect(query).toContain('OFFSET ?');
            expect(params).toEqual([clientId, 10, 20]);
        });

        it('should not apply offset when limit is not provided', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findByClientId(clientId, null, 20, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).not.toContain('LIMIT');
            expect(query).not.toContain('OFFSET');
            expect(params).toEqual([clientId]);
        });

        it('should order by receivedOn DESC', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findByClientId(clientId, null, null, mockConnection);

            const [query] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('ORDER BY jp.receivedOn DESC');
        });
    });

    describe('findByStatus', () => {
        const statusId = 'active';
        const mockProfiles = [{ jobProfileId: 'profile-1', status: 'active' }];

        it('should find job profiles by status', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            const result = await repository.findByStatus(statusId, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE jp.statusId = ?'),
                [statusId]
            );
            expect(result).toEqual(mockProfiles);
        });

        it('should throw AppError when statusId is missing', async () => {
            await expect(repository.findByStatus(null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Status ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_STATUS_ID',
                });
        });
    });

    describe('findByDepartment', () => {
        const departmentId = 'dept-1';
        const mockProfiles = [{ jobProfileId: 'profile-1', departmentId }];

        it('should find job profiles by department', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            const result = await repository.findByDepartment(departmentId, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE jp.departmentId = ?'),
                [departmentId]
            );
            expect(result).toEqual(mockProfiles);
        });

        it('should throw AppError when departmentId is missing', async () => {
            await expect(repository.findByDepartment(null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Department ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_DEPARTMENT_ID',
                });
        });
    });

    describe('countByClient', () => {
        const clientId = 'client-123';

        it('should return count of job profiles for client', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 15 }]]);

            const result = await repository.countByClient(clientId, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*) as count FROM jobProfile'),
                [clientId]
            );
            expect(result).toBe(15);
        });

        it('should throw AppError when clientId is missing', async () => {
            await expect(repository.countByClient(null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Client ID is required',
                    statusCode: 400,
                    errorCode: 'MISSING_CLIENT_ID',
                });
        });

        it('should return 0 when no profiles exist', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 0 }]]);

            const result = await repository.countByClient(clientId, mockConnection);

            expect(result).toBe(0);
        });
    });

    describe('existsByRole', () => {
        const jobRole = 'Software Engineer';
        const clientId = 'client-123';

        it('should return true when job role exists', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 1 }]]);

            const result = await repository.existsByRole(jobRole, clientId, null, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*) as count'),
                [jobRole, clientId]
            );
            expect(result).toBe(true);
        });

        it('should return false when job role does not exist', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 0 }]]);

            const result = await repository.existsByRole(jobRole, clientId, null, mockConnection);

            expect(result).toBe(false);
        });

        it('should exclude specified id when provided', async () => {
            const excludeId = 'profile-123';
            mockConnection.execute.mockResolvedValue([[{ count: 0 }]]);

            await repository.existsByRole(jobRole, clientId, excludeId, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('AND jobProfileId != ?');
            expect(params).toEqual([jobRole, clientId, excludeId]);
        });

        it('should not include exclude clause when excludeId is null', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 0 }]]);

            await repository.existsByRole(jobRole, clientId, null, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).not.toContain('AND jobProfileId != ?');
            expect(params).toEqual([jobRole, clientId]);
        });

        it('should throw AppError when jobRole is missing', async () => {
            await expect(repository.existsByRole(null, clientId, null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Job Role and Client ID are required',
                    statusCode: 400,
                    errorCode: 'MISSING_REQUIRED_PARAMETERS',
                });
        });

        it('should throw AppError when clientId is missing', async () => {
            await expect(repository.existsByRole(jobRole, null, null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Job Role and Client ID are required',
                    statusCode: 400,
                    errorCode: 'MISSING_REQUIRED_PARAMETERS',
                });
        });
    });

    describe('findAll', () => {
        const mockProfiles = [
            { jobProfileId: 'profile-1', jobRole: 'Developer' },
            { jobProfileId: 'profile-2', jobRole: 'Designer' },
        ];

        it('should find all job profiles without pagination', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            const result = await repository.findAll(null, null, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('FROM jobProfile jp'),
                []
            );
            expect(result).toEqual(mockProfiles);
        });

        it('should apply limit when provided', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findAll(10, null, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('LIMIT ?');
            expect(params).toEqual([10]);
        });

        it('should apply limit and offset when both provided', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findAll(10, 20, mockConnection);

            const [query, params] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('LIMIT ?');
            expect(query).toContain('OFFSET ?');
            expect(params).toEqual([10, 20]);
        });

        it('should order by receivedOn DESC', async () => {
            mockConnection.execute.mockResolvedValue([mockProfiles]);

            await repository.findAll(null, null, mockConnection);

            const [query] = mockConnection.execute.mock.calls[0];
            expect(query).toContain('ORDER BY jp.receivedOn DESC');
        });

        it('should handle database errors', async () => {
            const dbError = { code: 'ER_ACCESS_DENIED_ERROR', message: 'Access denied' };
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(repository.findAll(null, null, mockConnection))
                .rejects
                .toMatchObject({
                    message: 'Database access denied',
                    statusCode: 503,
                    errorCode: 'DATABASE_ACCESS_DENIED',
                });
        });
    });

    describe('_handleDatabaseError', () => {
        it('should handle ER_DUP_ENTRY error', () => {
            const error = { code: 'ER_DUP_ENTRY', message: 'Duplicate entry' };

            expect(() => repository._handleDatabaseError(error))
                .toThrow(AppError);

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(409);
                expect(e.errorCode).toBe('DUPLICATE_ENTRY');
            }
        });

        it('should handle ER_DATA_TOO_LONG error', () => {
            const error = { code: 'ER_DATA_TOO_LONG', message: 'Data too long' };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(400);
                expect(e.errorCode).toBe('DATA_TOO_LONG');
            }
        });

        it('should handle ER_BAD_NULL_ERROR error', () => {
            const error = { code: 'ER_BAD_NULL_ERROR', message: 'Cannot be null' };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(400);
                expect(e.errorCode).toBe('NULL_CONSTRAINT_VIOLATION');
            }
        });

        it('should handle ER_NO_REFERENCED_ROW_2 error', () => {
            const error = { code: 'ER_NO_REFERENCED_ROW_2', message: 'Foreign key error' };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(400);
                expect(e.errorCode).toBe('FOREIGN_KEY_CONSTRAINT');
            }
        });

        it('should handle ER_ROW_IS_REFERENCED_2 error', () => {
            const error = { code: 'ER_ROW_IS_REFERENCED_2', message: 'Row referenced' };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(400);
                expect(e.errorCode).toBe('FOREIGN_KEY_CONSTRAINT_DELETE');
            }
        });

        it('should handle ECONNREFUSED error', () => {
            const error = { code: 'ECONNREFUSED', message: 'Connection refused' };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(503);
                expect(e.errorCode).toBe('DATABASE_CONNECTION_ERROR');
            }
        });

        it('should handle ER_ACCESS_DENIED_ERROR error', () => {
            const error = { code: 'ER_ACCESS_DENIED_ERROR', message: 'Access denied' };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(503);
                expect(e.errorCode).toBe('DATABASE_ACCESS_DENIED');
            }
        });

        it('should handle unknown database errors', () => {
            const error = {
                code: 'UNKNOWN_ERROR',
                sqlState: '42000',
                message: 'Unknown database error',
            };

            try {
                repository._handleDatabaseError(error);
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_ERROR');
                expect(e.details).toMatchObject({
                    code: 'UNKNOWN_ERROR',
                    sqlState: '42000',
                    message: 'Unknown database error',
                });
            }
        });
    });
});