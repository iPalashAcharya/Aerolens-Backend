const ClientService = require('../../services/clientService');
const GeocodingService = require('../../services/geocodingService2');
const AppError = require('../../utils/appError');

jest.mock('../../services/geocodingService2');
jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('ClientService', () => {
    let clientService;
    let mockClientRepository;
    let mockDb;
    let mockConnection;
    let mockGeocodingService;

    const auditContext = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    const mockLocation = { lat: 40.7128, lon: -74.006 };

    beforeEach(() => {
        jest.clearAllMocks();

        mockConnection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
        };

        mockClientRepository = {
            getAll: jest.fn(),
            getAllWithDepartments: jest.fn(),
            getById: jest.fn(),
            exists: jest.fn(),
            existsByName: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };

        mockGeocodingService = {
            geocodeAddressWithFallback: jest.fn().mockResolvedValue(mockLocation),
        };

        GeocodingService.mockImplementation(() => mockGeocodingService);

        clientService = new ClientService(mockClientRepository, mockDb);
    });

    describe('getAllClients', () => {
        it('should return client rows from repository', async () => {
            const rows = [
                { clientId: 1, clientName: 'A' },
                { clientId: 2, clientName: 'B' },
            ];
            mockClientRepository.getAll.mockResolvedValue(rows);

            const result = await clientService.getAllClients();

            expect(mockClientRepository.getAll).toHaveBeenCalledWith(null, null, mockConnection);
            expect(result).toEqual({ data: rows });
        });

        it('should wrap non-AppError failures from repository', async () => {
            mockClientRepository.getAll.mockRejectedValue(new Error('db'));

            await expect(clientService.getAllClients()).rejects.toMatchObject({
                errorCode: 'CLIENT_FETCH_ERROR',
                statusCode: 500,
            });
        });

        it('should rethrow AppError from repository', async () => {
            const err = new AppError('x', 400, 'X');
            mockClientRepository.getAll.mockRejectedValue(err);

            await expect(clientService.getAllClients()).rejects.toBe(err);
        });
    });

    describe('getAllClientsWithDepartment', () => {
        it('should return payload from repository', async () => {
            const payload = { clientData: [], locationData: [] };
            mockClientRepository.getAllWithDepartments.mockResolvedValue(payload);

            const result = await clientService.getAllClientsWithDepartment();

            expect(mockClientRepository.getAllWithDepartments).toHaveBeenCalledWith(mockConnection);
            expect(result).toEqual(payload);
        });

        it('should wrap non-AppError failures from repository', async () => {
            mockClientRepository.getAllWithDepartments.mockRejectedValue(new Error('db'));

            await expect(clientService.getAllClientsWithDepartment()).rejects.toMatchObject({
                errorCode: 'CLIENT_FETCH_ERROR',
                statusCode: 500,
            });
        });
    });

    describe('getClientById', () => {
        it('should return client when found', async () => {
            const row = { clientId: 1, clientName: 'X' };
            mockClientRepository.getById.mockResolvedValue(row);

            const result = await clientService.getClientById(1);

            expect(mockClientRepository.getById).toHaveBeenCalledWith(1, mockConnection);
            expect(result).toEqual(row);
        });

        it('should throw when not found', async () => {
            mockClientRepository.getById.mockResolvedValue(null);

            await expect(clientService.getClientById(999)).rejects.toMatchObject({
                message: 'Client with ID 999 not found',
                statusCode: 404,
                errorCode: 'CLIENT_NOT_FOUND',
            });
        });

        it('should wrap non-AppError failures', async () => {
            mockClientRepository.getById.mockRejectedValue(new Error('db'));

            await expect(clientService.getClientById(1)).rejects.toMatchObject({
                errorCode: 'CLIENT_FETCH_ERROR',
                statusCode: 500,
            });
        });
    });

    describe('createClient', () => {
        const clientData = { name: 'Acme', address: '123 St, City' };

        beforeEach(() => {
            mockClientRepository.existsByName.mockResolvedValue(false);
            mockClientRepository.create.mockResolvedValue({ clientId: 1, clientName: 'Acme', address: clientData.address, location: mockLocation });
        });

        it('should geocode, create, audit, commit', async () => {
            const result = await clientService.createClient(clientData, auditContext);

            expect(mockGeocodingService.geocodeAddressWithFallback).toHaveBeenCalledWith(clientData.address);
            expect(mockClientRepository.existsByName).toHaveBeenCalledWith(clientData.name, null, mockConnection);
            expect(mockClientRepository.create).toHaveBeenCalledWith(clientData, mockLocation, mockConnection);
            expect(mockConnection.commit).toHaveBeenCalled();
            expect(result.clientId).toBe(1);
        });

        it('should throw 422 when geocoding fails', async () => {
            mockGeocodingService.geocodeAddressWithFallback.mockRejectedValueOnce(new Error('bad'));

            await expect(clientService.createClient(clientData, auditContext)).rejects.toMatchObject({
                statusCode: 422,
                errorCode: 'GEOCODING_ERROR',
            });
            expect(mockConnection.rollback).toHaveBeenCalled();
        });

        it('should throw on duplicate name', async () => {
            mockClientRepository.existsByName.mockResolvedValue(true);

            await expect(clientService.createClient(clientData, auditContext)).rejects.toMatchObject({
                statusCode: 409,
                errorCode: 'DUPLICATE_CLIENT_NAME',
            });
        });

        it('should wrap unexpected errors after geocoding', async () => {
            mockClientRepository.existsByName.mockRejectedValue(new Error('db'));

            await expect(clientService.createClient(clientData, auditContext)).rejects.toMatchObject({
                errorCode: 'CLIENT_CREATION_ERROR',
                statusCode: 500,
            });
            expect(mockConnection.rollback).toHaveBeenCalled();
        });
    });

    describe('updateClient', () => {
        const clientId = 1;
        const existing = { clientId: 1, clientName: 'Old', address: 'Old Addr' };

        beforeEach(() => {
            mockClientRepository.exists.mockResolvedValue(existing);
            mockClientRepository.update.mockResolvedValue({ clientId, clientName: 'New', address: 'New Addr' });
            mockClientRepository.getById.mockResolvedValue({ clientId, clientName: 'New', address: 'New Addr' });
        });

        it('should update without geocode when address unchanged', async () => {
            await clientService.updateClient(clientId, { name: 'New' }, auditContext);

            expect(mockGeocodingService.geocodeAddressWithFallback).not.toHaveBeenCalled();
            expect(mockClientRepository.update).toHaveBeenCalledWith(
                clientId,
                { name: 'New', address: 'Old Addr' },
                null,
                mockConnection
            );
        });

        it('should geocode when address changes', async () => {
            await clientService.updateClient(clientId, { address: 'New Addr' }, auditContext);

            expect(mockGeocodingService.geocodeAddressWithFallback).toHaveBeenCalledWith('New Addr');
            expect(mockClientRepository.update).toHaveBeenCalledWith(
                clientId,
                { name: 'Old', address: 'New Addr' },
                mockLocation,
                mockConnection
            );
        });

        it('should throw when client missing', async () => {
            mockClientRepository.exists.mockResolvedValue(null);

            await expect(clientService.updateClient(clientId, { name: 'X' }, auditContext)).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'CLIENT_NOT_FOUND',
            });
        });

        it('should throw 422 when geocoding fails on address change', async () => {
            mockGeocodingService.geocodeAddressWithFallback.mockRejectedValueOnce(new Error('geo'));

            await expect(
                clientService.updateClient(clientId, { address: 'New Addr' }, auditContext)
            ).rejects.toMatchObject({
                statusCode: 422,
                errorCode: 'GEOCODING_ERROR',
            });
            expect(mockConnection.rollback).toHaveBeenCalled();
        });

        it('should throw UPDATE_FAILED when repository update returns falsy', async () => {
            mockClientRepository.update.mockResolvedValue(null);

            await expect(
                clientService.updateClient(clientId, { address: 'New Addr' }, auditContext)
            ).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'UPDATE_FAILED',
            });
        });

        it('should wrap unexpected update errors', async () => {
            mockClientRepository.update.mockRejectedValue(new Error('db'));

            await expect(clientService.updateClient(clientId, { name: 'X' }, auditContext)).rejects.toMatchObject({
                errorCode: 'CLIENT_UPDATE_ERROR',
                statusCode: 500,
            });
        });
    });

    describe('deleteClient', () => {
        const clientId = 1;
        const row = { clientId, clientName: 'A' };

        it('should delete and return ISO deletedAt', async () => {
            mockClientRepository.getById.mockResolvedValue(row);
            mockClientRepository.delete.mockResolvedValue(1);

            const result = await clientService.deleteClient(clientId, auditContext);

            expect(mockClientRepository.getById).toHaveBeenCalledWith(clientId, mockConnection);
            expect(mockClientRepository.delete).toHaveBeenCalledWith(clientId, mockConnection);
            expect(result.success).toBe(true);
            expect(result.data.clientId).toBe(clientId);
            expect(result.data.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('should throw when client not found', async () => {
            mockClientRepository.getById.mockResolvedValue(null);

            await expect(clientService.deleteClient(clientId, auditContext)).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'CLIENT_NOT_FOUND',
            });
        });

        it('should throw when delete affects no rows', async () => {
            mockClientRepository.getById.mockResolvedValue(row);
            mockClientRepository.delete.mockResolvedValue(false);

            await expect(clientService.deleteClient(clientId, auditContext)).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'CLIENT_NOT_FOUND',
            });
        });

        it('should wrap unexpected delete errors', async () => {
            mockClientRepository.getById.mockResolvedValue(row);
            mockClientRepository.delete.mockRejectedValue(new Error('db'));

            await expect(clientService.deleteClient(clientId, auditContext)).rejects.toMatchObject({
                errorCode: 'CLIENT_DELETION_ERROR',
                statusCode: 500,
            });
        });
    });
});
