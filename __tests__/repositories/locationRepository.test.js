const LocationRepository = require('../../repositories/locationRepository');
const AppError = require('../../utils/appError');

describe('LocationRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            query: jest.fn(),
            execute: jest.fn(),
            rollback: jest.fn(),
        };
        repo = new LocationRepository({});
    });

    describe('getAll', () => {
        it('returns data wrapper', async () => {
            const rows = [{ locationId: 1 }];
            mockConn.query.mockResolvedValue([rows]);

            const result = await repo.getAll(mockConn);

            expect(result.data).toEqual(rows);
        });
    });

    describe('create', () => {
        it('returns inserted location shape', async () => {
            mockConn.execute.mockResolvedValue([{ insertId: 3 }]);

            const result = await repo.create(
                { country: 'IN', city: 'Mumbai', state: 'MH' },
                mockConn
            );

            expect(result.locationId).toBe(3);
            expect(result.city).toBe('Mumbai');
        });
    });

    describe('exists', () => {
        it('returns row when city exists', async () => {
            mockConn.execute.mockResolvedValue([[{ locationId: 9 }]]);

            const result = await repo.exists('Mumbai', mockConn);

            expect(result.locationId).toBe(9);
        });
    });

    describe('update', () => {
        it('throws when locationId missing', async () => {
            await expect(repo.update(null, { city: 'x' }, mockConn)).rejects.toMatchObject({
                errorCode: 'MISSING_LOCATION_ID',
            });
        });

        it('throws when no valid fields', async () => {
            await expect(repo.update(1, { foo: 'bar' }, mockConn)).rejects.toMatchObject({
                errorCode: 'NO_VALID_FIELDS',
            });
        });
    });
});
