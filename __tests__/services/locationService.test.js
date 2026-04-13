const LocationService = require('../../services/locationService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('LocationService', () => {
    let service;
    let mockRepo;
    let mockDb;
    let mockClient;

    const auditContext = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
        };
        mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
        mockRepo = {
            getById: jest.fn(),
            getAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            exists: jest.fn(),
        };
        service = new LocationService(mockRepo, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('getLocationById throws when repository returns null', async () => {
        mockRepo.getById.mockResolvedValue(null);

        await expect(service.getLocationById(1)).rejects.toMatchObject({
            errorCode: 'LOCATION_ID_NOT_FOUND',
        });
    });

    it('getLocationById returns location when found', async () => {
        const loc = { locationId: 1, city: 'Pune' };
        mockRepo.getById.mockResolvedValue(loc);

        await expect(service.getLocationById(1)).resolves.toEqual(loc);
    });

    it('getLocation delegates to repository', async () => {
        mockRepo.getAll.mockResolvedValue({ data: [] });

        await expect(service.getLocation()).resolves.toEqual({ data: [] });
    });

    it('createLocation creates when city is unique', async () => {
        mockRepo.exists.mockResolvedValue(null);
        mockRepo.create.mockResolvedValue({ locationId: 2, city: 'Goa' });

        const result = await service.createLocation(
            { country: 'IN', city: 'Goa', state: 'GA' },
            auditContext
        );

        expect(result.locationId).toBe(2);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('createLocation rejects duplicate city', async () => {
        mockRepo.exists.mockResolvedValue({ locationId: 1 });

        await expect(
            service.createLocation({ country: 'IN', city: 'Dup', state: 'X' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'DUPLICATE_LOCATION_VALUE' });
    });

    it('updateLocation updates when location exists', async () => {
        mockRepo.getById.mockResolvedValueOnce({ locationId: 1, city: 'Old' });
        mockRepo.update.mockResolvedValue({ locationId: 1, city: 'New' });

        const out = await service.updateLocation(1, { city: 'New' }, auditContext);

        expect(out.city).toBe('New');
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateLocation throws when location missing', async () => {
        mockRepo.getById.mockResolvedValue(null);

        await expect(service.updateLocation(99, { city: 'X' }, auditContext)).rejects.toMatchObject({
            errorCode: 'LOCATION_NOT_FOUND'
        });
    });

    it('deleteLocation removes row and audits', async () => {
        mockRepo.getById.mockResolvedValue({ locationId: 5, city: 'X' });
        mockRepo.delete.mockResolvedValue(1);

        const out = await service.deleteLocation(5, auditContext);

        expect(out.deletedLocation.locationId).toBe(5);
        expect(mockClient.commit).toHaveBeenCalled();
    });
});
