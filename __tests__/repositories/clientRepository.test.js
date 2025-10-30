const ClientRepository = require('../../repositories/clientRepository');
const AppError = require('../../utils/appError');

describe('ClientRepository', () => {
    let clientRepository;
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        // Mock connection object with all necessary methods
        mockConnection = {
            query: jest.fn(),
            execute: jest.fn(),
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };

        // Mock database with getConnection method
        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        clientRepository = new ClientRepository(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('getAll', () => {
        const mockClients = [
            { clientId: 1, clientName: 'Client A', address: '123 Main St', location: null },
            { clientId: 2, clientName: 'Client B', address: '456 Oak Ave', location: null }
        ];

        it('should retrieve all clients with default pagination', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[{ total: 10 }]])
                .mockResolvedValueOnce([mockClients]);

            const result = await clientRepository.getAll(10, 1, mockConnection);

            expect(mockConnection.query).toHaveBeenCalledTimes(2);
            expect(mockConnection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('COUNT'));
            expect(mockConnection.query).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('SELECT clientId'),
                [10, 0]
            );
            expect(result).toEqual({
                data: mockClients,
                totalRecords: 10
            });
        });

        it('should handle custom pagination parameters', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[{ total: 50 }]])
                .mockResolvedValueOnce([mockClients]);

            const result = await clientRepository.getAll(20, 3, mockConnection);

            expect(mockConnection.query).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('SELECT clientId'),
                [20, 40]
            );
            expect(result.totalRecords).toBe(50);
        });

        it('should handle invalid limit by using minimum value of 1', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[{ total: 10 }]])
                .mockResolvedValueOnce([mockClients]);

            await clientRepository.getAll(-5, 1, mockConnection);

            expect(mockConnection.query).toHaveBeenNthCalledWith(
                2,
                expect.anything(),
                [1, 0]
            );
        });

        it('should handle database errors appropriately', async () => {
            const dbError = new Error('Connection lost');
            dbError.code = 'ECONNRESET';
            mockConnection.query.mockRejectedValueOnce(dbError);

            await expect(clientRepository.getAll(10, 1, mockConnection))
                .rejects.toMatchObject({ statusCode: 503, errorCode: 'DATABASE_CONNECTION_ERROR' });
        });

        it('should return empty array when no clients exist', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[{ total: 0 }]])
                .mockResolvedValueOnce([[]]);

            const result = await clientRepository.getAll(10, 1, mockConnection);

            expect(result).toEqual({
                data: [],
                totalRecords: 0
            });
        });
    });

    describe('getById', () => {
        const mockClientDetails = {
            clientId: 1,
            clientName: 'Test Client',
            address: '123 Main St',
            location: null,
            departments: [],
            clientContact: []
        };

        it('should retrieve client by ID with all related data', async () => {
            mockConnection.execute.mockResolvedValueOnce([[mockClientDetails]]);

            const result = await clientRepository.getById(1, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                [1]
            );
            expect(result).toEqual(mockClientDetails);
        });

        it('should return null when client does not exist', async () => {
            mockConnection.execute.mockResolvedValueOnce([[]]);

            const result = await clientRepository.getById(999, mockConnection);

            expect(result).toBeNull();
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Table not found');
            dbError.code = 'ER_NO_SUCH_TABLE';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.getById(1, mockConnection))
                .rejects.toMatchObject({ statusCode: 500, errorCode: 'DATABASE_SCHEMA_ERROR' });
        });

        it('should properly aggregate departments and contacts', async () => {
            const clientWithData = {
                ...mockClientDetails,
                departments: [
                    { departmentId: 1, departmentName: 'IT', departmentDescription: 'IT Dept' }
                ],
                clientContact: [
                    { clientContactId: 1, contactPersonName: 'John Doe', phone: '123456' }
                ]
            };
            mockConnection.execute.mockResolvedValueOnce([[clientWithData]]);

            const result = await clientRepository.getById(1, mockConnection);

            expect(result.departments).toHaveLength(1);
            expect(result.clientContact).toHaveLength(1);
        });
    });

    describe('getAllWithDepartments', () => {
        const mockData = [
            { clientId: 1, clientName: 'Client A', departments: [] },
            { clientId: 2, clientName: 'Client B', departments: [{ departmentId: 1, departmentName: 'IT' }] }
        ];

        it('should retrieve all clients with departments', async () => {
            mockConnection.query.mockResolvedValueOnce([mockData]);

            const result = await clientRepository.getAllWithDepartments(mockConnection);

            expect(mockConnection.query).toHaveBeenCalledWith(
                expect.stringContaining('JSON_ARRAYAGG')
            );
            expect(result).toEqual(mockData);
        });

        it('should return null when no clients exist', async () => {
            mockConnection.query.mockResolvedValueOnce([[]]);

            const result = await clientRepository.getAllWithDepartments(mockConnection);

            expect(result).toBeNull();
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Bad field');
            dbError.code = 'ER_BAD_FIELD_ERROR';
            mockConnection.query.mockRejectedValueOnce(dbError);

            await expect(clientRepository.getAllWithDepartments(mockConnection)).rejects.toThrow(AppError);
        });
    });

    describe('create', () => {
        const clientData = {
            name: 'New Client',
            address: '789 Pine Rd'
        };
        const location = { lat: 40.7128, lon: -74.0060 };

        it('should create a new client successfully', async () => {
            mockConnection.execute.mockResolvedValueOnce([{ insertId: 1 }]);

            const result = await clientRepository.create(clientData, location, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO client'),
                [clientData.name, clientData.address, `POINT(${location.lat} ${location.lon})`]
            );
            expect(result).toEqual({
                clientId: 1,
                clientName: clientData.name,
                address: clientData.address,
                location
            });
        });

        it('should handle duplicate entry error', async () => {
            const dbError = new Error('Duplicate entry');
            dbError.code = 'ER_DUP_ENTRY';
            dbError.message = 'Duplicate entry for clientName';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.create(clientData, location, mockConnection))
                .rejects.toMatchObject({ statusCode: 409, errorCode: 'DUPLICATE_ENTRY' });
        });

        it('should handle data too long error', async () => {
            const dbError = new Error('Data too long');
            dbError.code = 'ER_DATA_TOO_LONG';
            dbError.message = 'Data too long for column clientName';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.create(clientData, location, mockConnection))
                .rejects.toMatchObject({ statusCode: 400, errorCode: 'DATA_TOO_LONG' });
        });

        it('should properly format geographic point', async () => {
            mockConnection.execute.mockResolvedValueOnce([{ insertId: 1 }]);

            await clientRepository.create(clientData, { lat: 51.5074, lon: -0.1278 }, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining(['POINT(51.5074 -0.1278)'])
            );
        });
    });

    describe('update', () => {
        const clientId = 1;
        const updateData = {
            name: 'Updated Client',
            address: '999 New St'
        };

        it('should update client without location', async () => {
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

            const result = await clientRepository.update(clientId, updateData, null, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE client SET clientName = ?, address = ?'),
                [updateData.name, updateData.address, clientId]
            );
            expect(result).toEqual({
                clientId,
                ...updateData
            });
        });

        it('should update client with location', async () => {
            const location = { lat: 40.7128, lon: -74.0060 };
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

            const result = await clientRepository.update(clientId, updateData, location, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('location = ST_GeomFromText'),
                [updateData.name, updateData.address, `POINT(${location.lat} ${location.lon})`, clientId]
            );
            expect(result).toEqual({
                clientId,
                ...updateData,
                location
            });
        });

        it('should return null when client does not exist', async () => {
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

            const result = await clientRepository.update(999, updateData, null, mockConnection);

            expect(result).toBeNull();
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Connection timeout');
            dbError.code = 'ETIMEDOUT';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.update(clientId, updateData, null, mockConnection))
                .rejects.toThrow(AppError);
        });
    });

    describe('delete', () => {
        it('should delete client successfully', async () => {
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

            const result = await clientRepository.delete(1, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM client'),
                [1]
            );
            expect(result).toBe(1);
        });

        it('should return false when client does not exist', async () => {
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

            const result = await clientRepository.delete(999, mockConnection);

            expect(result).toBe(false);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Access denied');
            dbError.code = 'ER_ACCESS_DENIED_ERROR';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.delete(1, mockConnection)).rejects.toThrow(AppError);
        });
    });

    describe('exists', () => {
        const mockClient = {
            clientId: 1,
            clientName: 'Test Client',
            address: '123 Main St'
        };

        it('should return client data when client exists', async () => {
            mockConnection.execute.mockResolvedValueOnce([[mockClient]]);

            const result = await clientRepository.exists(1, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT clientId, clientName, address'),
                [1]
            );
            expect(result).toEqual(mockClient);
        });

        it('should return null when client does not exist', async () => {
            mockConnection.execute.mockResolvedValueOnce([[]]);

            const result = await clientRepository.exists(999, mockConnection);

            expect(result).toBeNull();
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Unknown error');
            dbError.code = 'UNKNOWN_ERROR';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.exists(1, mockConnection)).rejects.toThrow(AppError);
        });
    });

    describe('existsByName', () => {
        it('should return true when client name exists', async () => {
            mockConnection.execute.mockResolvedValueOnce([[{ count: 1 }]]);

            const result = await clientRepository.existsByName('Test Client', null, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE clientName = ?'),
                ['Test Client']
            );
            expect(result).toBe(true);
        });

        it('should return false when client name does not exist', async () => {
            mockConnection.execute.mockResolvedValueOnce([[{ count: 0 }]]);

            const result = await clientRepository.existsByName('Non-existent Client', null, mockConnection);

            expect(result).toBe(false);
        });

        it('should exclude specific client ID when provided', async () => {
            mockConnection.execute.mockResolvedValueOnce([[{ count: 0 }]]);

            const result = await clientRepository.existsByName('Test Client', 5, mockConnection);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND clientId != ?'),
                ['Test Client', 5]
            );
            expect(result).toBe(false);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database error');
            dbError.code = 'ER_GENERIC';
            mockConnection.execute.mockRejectedValueOnce(dbError);

            await expect(clientRepository.existsByName('Test', null, mockConnection))
                .rejects.toThrow(AppError);
        });
    });

    describe('_handleDatabaseError', () => {
        it('should throw AppError with correct details for ER_DUP_ENTRY', () => {
            const error = new Error('Duplicate entry for clientName');
            error.code = 'ER_DUP_ENTRY';

            expect(() => clientRepository._handleDatabaseError(error, 'create')).toThrow(AppError);

            try {
                clientRepository._handleDatabaseError(error, 'create');
            } catch (e) {
                expect(e.statusCode).toBe(409);
                expect(e.errorCode).toBe('DUPLICATE_ENTRY');
                expect(e.details.duplicateField).toBe('name');
            }
        });

        it('should throw AppError with correct details for ER_NO_SUCH_TABLE', () => {
            const error = new Error('Table not found');
            error.code = 'ER_NO_SUCH_TABLE';

            try {
                clientRepository._handleDatabaseError(error, 'getAll');
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_SCHEMA_ERROR');
                expect(e.details.operation).toBe('getAll');
            }
        });

        it('should throw AppError with correct details for connection errors', () => {
            const error = new Error('Connection timeout');
            error.code = 'ETIMEDOUT';

            try {
                clientRepository._handleDatabaseError(error, 'update');
            } catch (e) {
                expect(e.statusCode).toBe(503);
                expect(e.errorCode).toBe('DATABASE_CONNECTION_ERROR');
            }
        });

        it('should throw generic database error for unknown error codes', () => {
            const error = new Error('Unknown error');
            error.code = 'UNKNOWN_CODE';
            error.sqlState = '42000';

            try {
                clientRepository._handleDatabaseError(error, 'delete');
            } catch (e) {
                expect(e.statusCode).toBe(500);
                expect(e.errorCode).toBe('DATABASE_ERROR');
                expect(e.details.code).toBe('UNKNOWN_CODE');
                expect(e.details.sqlState).toBe('42000');
            }
        });
    });
});