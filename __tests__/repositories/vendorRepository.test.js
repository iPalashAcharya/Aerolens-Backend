const VendorRepository = require('../../repositories/vendorRepository');
const AppError = require('../../utils/appError');

describe('VendorRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            execute: jest.fn(),
        };
        repo = new VendorRepository({});
    });

    describe('getAll', () => {
        it('returns rows', async () => {
            const rows = [{ vendorId: 1 }];
            mockConn.execute.mockResolvedValue([rows]);

            const result = await repo.getAll(mockConn);

            expect(result).toEqual(rows);
        });
    });

    describe('create', () => {
        it('returns vendor with insertId', async () => {
            mockConn.execute.mockResolvedValue([{ insertId: 5 }]);

            const result = await repo.create(
                {
                    vendorName: 'V',
                    vendorEmail: 'e@e.com',
                    vendorPhone: '1',
                    contactPersonName: 'C',
                },
                mockConn
            );

            expect(result.vendorId).toBe(5);
            expect(result.vendorName).toBe('V');
        });
    });

    describe('findById', () => {
        it('returns first row or null', async () => {
            mockConn.execute.mockResolvedValue([[{ vendorId: 2 }]]);

            await expect(repo.findById(2, mockConn)).resolves.toEqual({ vendorId: 2 });
            mockConn.execute.mockResolvedValue([[]]);
            await expect(repo.findById(9, mockConn)).resolves.toBeNull();
        });
    });

    describe('update', () => {
        it('throws when no valid fields', async () => {
            await expect(repo.update(1, {}, mockConn)).rejects.toMatchObject({
                errorCode: 'INVALID_UPDATE_FIELDS',
            });
        });

        it('throws when vendor not found', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(repo.update(1, { vendorName: 'X' }, mockConn)).rejects.toMatchObject({
                errorCode: 'VENDOR_NOT_FOUND',
            });
        });

        it('returns true on success', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await expect(repo.update(1, { vendorName: 'Y' }, mockConn)).resolves.toBe(true);
        });
    });

    describe('delete', () => {
        it('throws when no row deleted', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(repo.delete(1, mockConn)).rejects.toMatchObject({ errorCode: 'VENDOR_NOT_FOUND' });
        });
    });

    describe('exists', () => {
        it('returns false when no phone or email', async () => {
            await expect(repo.exists(null, null, null, mockConn)).resolves.toBe(false);
        });

        it('returns true when count > 0', async () => {
            mockConn.execute.mockResolvedValue([[{ count: 1 }]]);

            await expect(repo.exists('+1', null, null, mockConn)).resolves.toBe(true);
        });
    });
});
