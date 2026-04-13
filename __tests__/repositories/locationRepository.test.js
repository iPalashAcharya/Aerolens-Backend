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

    describe('getById', () => {
        it('returns data wrapper', async () => {
            mockConn.query.mockResolvedValue([[{ locationId: 2, city: 'Pune' }]]);
            const out = await repo.getById(2, mockConn);
            expect(out.data[0].city).toBe('Pune');
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

        it('throws when empty locationData', async () => {
            await expect(repo.update(1, {}, mockConn)).rejects.toMatchObject({
                errorCode: 'MISSING_LOCATION_DATA',
            });
        });

        it('updates allowed fields', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);
            const out = await repo.update(3, { city: 'X', country: 'IN' }, mockConn);
            expect(out.locationId).toBe(3);
        });

        it('throws when no row updated', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 0 }]);
            await expect(repo.update(99, { city: 'Y' }, mockConn)).rejects.toMatchObject({
                errorCode: 'LOCATION_NOT_FOUND',
            });
        });
    });

    describe('delete', () => {
        it('returns affected rows on success', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 2 }]);
            await expect(repo.delete(1, mockConn)).resolves.toBe(2);
        });

        it('returns false when no row deleted', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 0 }]);
            await expect(repo.delete(9, mockConn)).resolves.toBe(false);
            expect(mockConn.rollback).toHaveBeenCalled();
        });
    });

    describe('exists', () => {
        it('returns null when city not found', async () => {
            mockConn.execute.mockResolvedValue([[]]);
            await expect(repo.exists('Nowhere', mockConn)).resolves.toBeNull();
        });
    });

    describe('_handleDatabaseError', () => {
        it('maps ER_DUP_ENTRY with lookupKey message', () => {
            const err = { code: 'ER_DUP_ENTRY', message: 'lookupKey duplicate' };
            expect(() => repo._handleDatabaseError(err, 'op')).toThrow(AppError);
        });

        it('throws generic DATABASE_ERROR for unknown code', () => {
            const err = { code: 'UNKNOWN_X', message: 'fail', sqlState: 'HY000' };
            expect(() => repo._handleDatabaseError(err, 'op')).toThrow(AppError);
        });
    });
});
