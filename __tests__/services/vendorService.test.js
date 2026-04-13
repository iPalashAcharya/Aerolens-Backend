const VendorService = require('../../services/vendorService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('VendorService', () => {
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
            getAll: jest.fn(),
            create: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            exists: jest.fn(),
        };
        service = new VendorService(mockRepo, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('getAllVendors returns repository rows', async () => {
        const rows = [{ vendorId: 1 }];
        mockRepo.getAll.mockResolvedValue(rows);

        await expect(service.getAllVendors()).resolves.toEqual(rows);
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('getAllVendors wraps generic errors', async () => {
        mockRepo.getAll.mockRejectedValue(new Error('db'));

        await expect(service.getAllVendors()).rejects.toMatchObject({ errorCode: 'DATABASE_ERROR' });
    });

    it('createVendor creates when no duplicate', async () => {
        mockRepo.exists.mockResolvedValue(false);
        mockRepo.create.mockResolvedValue({ vendorId: 1, vendorName: 'V' });

        const result = await service.createVendor(
            {
                vendorName: 'V',
                vendorEmail: 'a@a.com',
                vendorPhone: '+100',
                contactPersonName: 'C',
            },
            auditContext
        );

        expect(result.vendorId).toBe(1);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('createVendor rejects duplicate', async () => {
        mockRepo.exists.mockResolvedValue(true);

        await expect(
            service.createVendor(
                { vendorName: 'V', vendorEmail: 'a@a.com', vendorPhone: '+1', contactPersonName: 'C' },
                auditContext
            )
        ).rejects.toMatchObject({ errorCode: 'VENDOR_DUPLICATE' });
    });

    it('getVendorById returns vendor or 404', async () => {
        mockRepo.findById.mockResolvedValueOnce({ vendorId: 1 }).mockResolvedValueOnce(null);

        await expect(service.getVendorById(1)).resolves.toMatchObject({ vendorId: 1 });
        await expect(service.getVendorById(99)).rejects.toMatchObject({ errorCode: 'VENDOR_NOT_FOUND' });
    });

    it('deleteVendor deletes and audits', async () => {
        mockRepo.findById.mockResolvedValue({ vendorId: 1, vendorName: 'V' });
        mockRepo.delete.mockResolvedValue(1);

        const out = await service.deleteVendor(1, auditContext);

        expect(out.deletedVendor.vendorId).toBe(1);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateVendor updates allowed fields and returns fresh row', async () => {
        mockRepo.findById
            .mockResolvedValueOnce({ vendorId: 2, vendorName: 'Old' })
            .mockResolvedValueOnce({ vendorId: 2, vendorName: 'New' });
        mockRepo.exists.mockResolvedValue(false);
        mockRepo.update.mockResolvedValue(undefined);

        const result = await service.updateVendor(
            2,
            { vendorName: '  New  ', vendorPhone: '+1999888777' },
            auditContext
        );

        expect(result.vendorName).toBe('New');
        expect(mockRepo.update).toHaveBeenCalled();
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateVendor rejects when no valid fields after filter', async () => {
        mockRepo.findById.mockResolvedValue({ vendorId: 1 });

        await expect(
            service.updateVendor(1, { unknownField: 'x' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'INVALID_UPDATE_FIELDS' });
    });

    it('updateVendor rejects duplicate phone', async () => {
        mockRepo.findById.mockResolvedValue({ vendorId: 1 });
        mockRepo.exists.mockResolvedValue(true);

        await expect(
            service.updateVendor(1, { vendorPhone: '+100' }, auditContext)
        ).rejects.toMatchObject({ errorCode: 'VENDOR_DUPLICATE' });
    });
});
