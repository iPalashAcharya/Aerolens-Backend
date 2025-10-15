const ClientService = require('../../services/clientService');
const GeocodingService = require('../../services/geocodingService2');
const AppError = require('../../utils/appError');

// Mock dependencies
jest.mock('../../services/geocodingService2');
jest.mock('../../utils/appError');

describe('ClientService', () => {
    let clientService;
    let mockClientRepository;
    let mockDb;
    let mockConnection;
    let mockGeocodingService;
    const mockLocation = { latitude: 40.7128, longitude: -74.0060 };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup AppError to actually throw
        AppError.mockImplementation((message, statusCode, errorCode, details) => {
            const error = new Error(message);
            error.statusCode = statusCode;
            error.errorCode = errorCode;
            error.details = details;
            error.name = 'AppError';
            return error;
        });

        // Mock database connection
        mockConnection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        // Mock client repository
        mockClientRepository = {
            getAll: jest.fn(),
            getAllWithDepartments: jest.fn(),
            getById: jest.fn(),
            exists: jest.fn(),
            existsByName: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        };

        // Mock geocoding service
        mockGeocodingService = {
            geocodeAddressWithFallback: jest.fn().mockResolvedValue(mockLocation)
        };

        GeocodingService.mockImplementation(() => mockGeocodingService);

        // Initialize service
        clientService = new ClientService(mockClientRepository, mockDb);
    });

    describe('constructor', () => {
        it('should initialize with repository, db, and geocoding service', () => {
            expect(clientService.db).toBe(mockDb);
            expect(clientService.clientRepository).toBe(mockClientRepository);
            expect(clientService.geocodingService).toBeDefined();
        });
    });

    describe('getAllClients', () => {
        const mockData = [
            { id: 1, name: 'Client 1', address: 'Address 1' },
            { id: 2, name: 'Client 2', address: 'Address 2' }
        ];

        it('should return paginated clients with default options', async () => {
            const mockResult = {
                data: mockData,
                totalRecords: 25
            };
            mockClientRepository.getAll.mockResolvedValue(mockResult);

            const result = await clientService.getAllClients();

            expect(mockClientRepository.getAll).toHaveBeenCalledWith(10, 1);
            expect(result).toEqual({
                data: mockData,
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

        it('should return paginated clients with custom options', async () => {
            const mockResult = {
                data: mockData.slice(0, 1),
                totalRecords: 25
            };
            mockClientRepository.getAll.mockResolvedValue(mockResult);

            const result = await clientService.getAllClients({ limit: 5, page: 3 });

            expect(mockClientRepository.getAll).toHaveBeenCalledWith(5, 3);
            expect(result.pagination).toEqual({
                currentPage: 3,
                totalPages: 5,
                totalRecords: 25,
                limit: 5,
                hasNextPage: true,
                hasPrevPage: true,
                nextPage: 4,
                prevPage: 2
            });
        });

        it('should handle last page correctly', async () => {
            const mockResult = {
                data: mockData,
                totalRecords: 20
            };
            mockClientRepository.getAll.mockResolvedValue(mockResult);

            const result = await clientService.getAllClients({ limit: 10, page: 2 });

            expect(result.pagination).toEqual({
                currentPage: 2,
                totalPages: 2,
                totalRecords: 20,
                limit: 10,
                hasNextPage: false,
                hasPrevPage: true,
                nextPage: null,
                prevPage: 1
            });
        });

        it('should handle empty results', async () => {
            const mockResult = {
                data: [],
                totalRecords: 0
            };
            mockClientRepository.getAll.mockResolvedValue(mockResult);

            const result = await clientService.getAllClients();

            expect(result.pagination.totalPages).toBe(0);
            expect(result.pagination.hasNextPage).toBe(false);
            expect(result.pagination.hasPrevPage).toBe(false);
        });
    });

    describe('getAllClientsWithDepartment', () => {
        it('should return clients with departments', async () => {
            const mockData = [
                { id: 1, name: 'Client 1', department: 'IT' },
                { id: 2, name: 'Client 2', department: 'HR' }
            ];
            mockClientRepository.getAllWithDepartments.mockResolvedValue(mockData);

            const result = await clientService.getAllClientsWithDepartment();

            expect(mockClientRepository.getAllWithDepartments).toHaveBeenCalledWith();
            expect(result).toEqual(mockData);
        });
    });

    describe('getClientById', () => {
        it('should return client data when client exists', async () => {
            const mockClient = { id: 1, name: 'John Doe', address: '123 Main St' };
            mockClientRepository.getById.mockResolvedValue(mockClient);

            const result = await clientService.getClientById(1);

            expect(mockClientRepository.getById).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockClient);
        });

        it('should throw AppError when client not found', async () => {
            mockClientRepository.getById.mockResolvedValue(null);

            await expect(clientService.getClientById(999)).rejects.toThrow('Client with ID 999 not found');

            expect(AppError).toHaveBeenCalledWith(
                'Client with ID 999 not found',
                404,
                'CLIENT_NOT_FOUND',
                {
                    clientId: 999,
                    suggestion: 'Please verify the client ID and try again',
                    searchHint: 'You can search for clients using the list endpoint'
                }
            );
        });
    });

    describe('createClient', () => {
        const mockClientData = {
            name: 'John Doe',
            address: '123 Main Street, City, State'
        };

        beforeEach(() => {
            mockGeocodingService.geocodeAddressWithFallback.mockResolvedValue(mockLocation);
            mockClientRepository.existsByName.mockResolvedValue(false);
            mockClientRepository.create.mockResolvedValue({ id: 1, ...mockClientData });
        });

        it('should create client successfully with geocoding', async () => {
            const result = await clientService.createClient(mockClientData);

            expect(mockDb.getConnection).toHaveBeenCalled();
            expect(mockConnection.beginTransaction).toHaveBeenCalled();
            expect(mockGeocodingService.geocodeAddressWithFallback).toHaveBeenCalledWith(mockClientData.address);
            expect(mockClientRepository.existsByName).toHaveBeenCalledWith(mockClientData.name, null, mockConnection);
            expect(mockClientRepository.create).toHaveBeenCalledWith(mockClientData, mockLocation);
            expect(mockConnection.commit).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
            expect(result).toEqual({ id: 1, ...mockClientData });
        });

        it('should rollback and throw error when geocoding fails', async () => {
            const geocodeError = new Error('Geocoding service unavailable');
            mockGeocodingService.geocodeAddressWithFallback.mockRejectedValue(geocodeError);

            await expect(clientService.createClient(mockClientData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Unable to find location for the provided address',
                422,
                'GEOCODING_ERROR',
                {
                    address: mockClientData.address,
                    geocodeError: geocodeError.message,
                    suggestion: 'Please verify the address format and try again'
                }
            );
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should rollback and throw error when client name already exists', async () => {
            mockClientRepository.existsByName.mockResolvedValue(true);

            await expect(clientService.createClient(mockClientData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'A client with this name already exists',
                409,
                'DUPLICATE_CLIENT_NAME'
            );
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should rollback and throw generic error when repository create fails', async () => {
            const dbError = new Error('Database connection failed');
            mockClientRepository.create.mockRejectedValue(dbError);

            await expect(clientService.createClient(mockClientData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Failed to create client',
                500,
                'CLIENT_CREATION_ERROR',
                { operation: 'createClient', clientData: { name: mockClientData.name } }
            );
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should ensure connection is released even if rollback fails', async () => {
            const dbError = new Error('Database error');
            mockClientRepository.create.mockRejectedValue(dbError);
            mockConnection.rollback.mockRejectedValue(new Error('Rollback failed'));

            await expect(clientService.createClient(mockClientData)).rejects.toThrow();

            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });
    });

    describe('updateClient', () => {
        const clientId = 1;
        const existingClient = {
            clientName: 'John Doe',
            address: '123 Old Street'
        };
        const updateData = {
            name: 'Jane Doe',
            address: '456 New Street'
        };

        beforeEach(() => {
            mockClientRepository.exists.mockResolvedValue(existingClient);
            mockClientRepository.update.mockResolvedValue(true);
            mockClientRepository.getById.mockResolvedValue({ id: clientId, ...updateData });
        });

        it('should update client successfully without address change', async () => {
            const updateOnlyName = { name: 'Jane Doe' };
            const result = await clientService.updateClient(clientId, updateOnlyName);

            expect(mockClientRepository.exists).toHaveBeenCalledWith(clientId);
            expect(mockClientRepository.update).toHaveBeenCalledWith(
                clientId,
                { name: 'Jane Doe', address: '123 Old Street' },
                null
            );
            expect(mockGeocodingService.geocodeAddressWithFallback).not.toHaveBeenCalled();
            expect(mockClientRepository.getById).toHaveBeenCalledWith(clientId);
        });

        it('should update client successfully with address change and geocoding', async () => {
            mockGeocodingService.geocodeAddressWithFallback.mockResolvedValue(mockLocation);

            const result = await clientService.updateClient(clientId, updateData);

            expect(mockClientRepository.exists).toHaveBeenCalledWith(clientId);
            expect(mockGeocodingService.geocodeAddressWithFallback).toHaveBeenCalledWith('456 New Street');
            expect(mockClientRepository.update).toHaveBeenCalledWith(
                clientId,
                { name: 'Jane Doe', address: '456 New Street' },
                mockLocation
            );
            expect(mockClientRepository.getById).toHaveBeenCalledWith(clientId);
        });

        it('should throw error when client does not exist', async () => {
            mockClientRepository.exists.mockResolvedValue(null);

            await expect(clientService.updateClient(999, updateData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Client with ID 999 does not exist',
                404,
                'CLIENT_NOT_FOUND',
                {
                    clientId: 999,
                    suggestion: 'Please verify the client ID and try again'
                }
            );
        });

        it('should throw error when geocoding fails for new address', async () => {
            const geocodeError = new Error('Invalid address format');
            mockGeocodingService.geocodeAddressWithFallback.mockRejectedValue(geocodeError);

            await expect(clientService.updateClient(clientId, updateData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Unable to find location for the new address',
                422,
                'GEOCODING_ERROR',
                {
                    newAddress: '456 New Street',
                    oldAddress: '123 Old Street',
                    geocodeError: geocodeError.message,
                    suggestion: 'Please verify the new address format or keep the existing address'
                }
            );
        });

        it('should throw error when update operation fails', async () => {
            mockClientRepository.update.mockResolvedValue(false);

            await expect(clientService.updateClient(clientId, updateData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'No changes were made to the client record',
                404,
                'UPDATE_FAILED',
                {
                    clientId,
                    reason: 'Client may have been deleted by another process'
                }
            );
        });

        it('should handle address unchanged scenario', async () => {
            const updateSameAddress = { address: '123 Old Street' };

            await clientService.updateClient(clientId, updateSameAddress);

            expect(mockGeocodingService.geocodeAddressWithFallback).not.toHaveBeenCalled();
            expect(mockClientRepository.update).toHaveBeenCalledWith(
                clientId,
                { name: 'John Doe', address: '123 Old Street' },
                null
            );
        });

        it('should throw generic error when repository operations fail', async () => {
            const dbError = new Error('Database connection lost');
            mockClientRepository.exists.mockRejectedValue(dbError);

            await expect(clientService.updateClient(clientId, updateData)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Failed to update client',
                500,
                'CLIENT_UPDATE_ERROR',
                { clientId, operation: 'updateClient' }
            );
        });
    });

    describe('deleteClient', () => {
        const clientId = 1;
        const mockClient = { id: clientId, name: 'John Doe', address: '123 Main St' };

        it('should delete client successfully', async () => {
            mockClientRepository.getById.mockResolvedValue(mockClient);
            mockClientRepository.delete.mockResolvedValue(true);

            const result = await clientService.deleteClient(clientId);

            expect(mockClientRepository.getById).toHaveBeenCalledWith(clientId);
            expect(mockClientRepository.delete).toHaveBeenCalledWith(clientId);
            expect(result).toEqual({
                success: true,
                message: 'Client details deleted successfully',
                data: {
                    clientId,
                    deletedAt: expect.any(String)
                }
            });
        });

        it('should throw error when client not found before delete', async () => {
            mockClientRepository.getById.mockResolvedValue(null);

            await expect(clientService.deleteClient(999)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Client with ID 999 not found',
                404,
                'CLIENT_NOT_FOUND'
            );
            expect(mockClientRepository.delete).not.toHaveBeenCalled();
        });

        it('should throw error when delete operation fails', async () => {
            mockClientRepository.getById.mockResolvedValue(mockClient);
            mockClientRepository.delete.mockResolvedValue(false);

            await expect(clientService.deleteClient(clientId)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Client with ID 1 not found',
                404,
                'CLIENT_NOT_FOUND',
                {
                    clientId,
                    suggestion: 'Please verify the client ID and try again'
                }
            );
        });

        it('should throw generic error when repository operations fail', async () => {
            const dbError = new Error('Database connection failed');
            mockClientRepository.getById.mockRejectedValue(dbError);

            await expect(clientService.deleteClient(clientId)).rejects.toThrow();

            expect(AppError).toHaveBeenCalledWith(
                'Failed to delete client',
                500,
                'CLIENT_DELETION_ERROR',
                { clientId, operation: 'deleteClient' }
            );
        });

        it('should return deletion timestamp in ISO format', async () => {
            mockClientRepository.getById.mockResolvedValue(mockClient);
            mockClientRepository.delete.mockResolvedValue(true);

            const result = await clientService.deleteClient(clientId);

            expect(result.data.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });
    });

    describe('Error Handling Edge Cases', () => {
        it('should handle database connection failure in createClient', async () => {
            mockDb.getConnection.mockRejectedValue(new Error('Connection pool exhausted'));

            await expect(clientService.createClient({ name: 'Test', address: 'Test Address' }))
                .rejects.toThrow('Connection pool exhausted');
        });

        it('should handle transaction begin failure in createClient', async () => {
            mockConnection.beginTransaction.mockRejectedValue(new Error('Transaction failed to start'));

            await expect(clientService.createClient({ name: 'Test', address: 'Test Address' }))
                .rejects.toThrow();

            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should properly handle AppError instances without wrapping', async () => {
            const customAppError = new AppError('Custom error', 400, 'CUSTOM_ERROR');
            mockClientRepository.getById.mockRejectedValue(customAppError);

            await expect(clientService.deleteClient(1)).rejects.toThrow('Custom error');
        });
    });

    describe('Async Operations and Promises', () => {
        it('should handle all async operations in parallel where applicable', async () => {
            const mockResult = { data: [], totalRecords: 0 };
            mockClientRepository.getAll.mockResolvedValue(mockResult);

            const startTime = Date.now();
            await clientService.getAllClients();
            const endTime = Date.now();

            // Should complete quickly since no external dependencies
            expect(endTime - startTime).toBeLessThan(100);
        });

        it('should handle rejected promises correctly in geocoding', async () => {
            mockGeocodingService.geocodeAddressWithFallback.mockRejectedValue(
                new Error('Network timeout')
            );

            await expect(clientService.createClient({
                name: 'Test',
                address: 'Invalid Address'
            })).rejects.toThrow();
        });
    });

    describe('Data Validation and Transformation', () => {
        it('should handle pagination calculation edge cases', async () => {
            const mockResult = { data: [], totalRecords: 1 };
            mockClientRepository.getAll.mockResolvedValue(mockResult);

            const result = await clientService.getAllClients({ limit: 1, page: 1 });

            expect(result.pagination.totalPages).toBe(1);
            expect(result.pagination.hasNextPage).toBe(false);
            expect(result.pagination.hasPrevPage).toBe(false);
        });

        it('should preserve original data structure from repository', async () => {
            const mockData = [
                { id: 1, name: 'Client 1', customField: 'custom_value' }
            ];
            mockClientRepository.getAllWithDepartments.mockResolvedValue(mockData);

            const result = await clientService.getAllClientsWithDepartment();

            expect(result).toEqual(mockData);
            expect(result[0].customField).toBe('custom_value');
        });
    });
});