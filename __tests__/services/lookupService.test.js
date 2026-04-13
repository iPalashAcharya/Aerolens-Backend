const LookupService = require('../../services/lookupService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('LookupService', () => {
    let lookupService;
    let mockLookupRepository;
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

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient),
        };

        mockLookupRepository = {
            getAll: jest.fn(),
            getByTag: jest.fn(),
            create: jest.fn(),
            exists: jest.fn(),
            getByKey: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };

        lookupService = new LookupService(mockLookupRepository, mockDb);
    });

    describe('getAll', () => {
        it('should return data from repository', async () => {
            const repoResult = { data: [{ lookupKey: 1, value: 'a' }] };
            mockLookupRepository.getAll.mockResolvedValue(repoResult);

            const result = await lookupService.getAll();

            expect(mockLookupRepository.getAll).toHaveBeenCalledWith(null, null, mockClient);
            expect(result).toEqual({ data: repoResult.data });
        });

        it('should wrap non-AppError failures', async () => {
            mockLookupRepository.getAll.mockRejectedValue(new Error('db'));

            await expect(lookupService.getAll()).rejects.toMatchObject({
                errorCode: 'LOOKUP_FETCH_ERROR',
            });
        });
    });

    describe('getDataByTag', () => {
        it('should return repository result', async () => {
            const row = { data: [{ tag: 't', value: 'v' }] };
            mockLookupRepository.getByTag.mockResolvedValue(row);

            const result = await lookupService.getDataByTag('t');

            expect(mockLookupRepository.getByTag).toHaveBeenCalledWith('t', mockClient);
            expect(result).toEqual(row);
        });

        it('should throw when repository returns falsy', async () => {
            mockLookupRepository.getByTag.mockResolvedValue(null);

            await expect(lookupService.getDataByTag('x')).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'LOOKUP_ENTRY_NOT_FOUND',
            });
        });

        it('should wrap unexpected errors', async () => {
            mockLookupRepository.getByTag.mockRejectedValue(new Error('db'));

            await expect(lookupService.getDataByTag('t')).rejects.toMatchObject({
                errorCode: 'LOOKUP_FETCH_ERROR',
            });
        });
    });

    describe('createLookup', () => {
        const lookupData = { tag: 'T', value: 'V' };

        it('should create when value is unique', async () => {
            mockLookupRepository.exists.mockResolvedValue(false);
            mockLookupRepository.create.mockResolvedValue({ lookupKey: 1, ...lookupData });

            const result = await lookupService.createLookup(lookupData, auditContext);

            expect(mockLookupRepository.exists).toHaveBeenCalledWith(lookupData.value, mockClient);
            expect(mockLookupRepository.create).toHaveBeenCalledWith(lookupData, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result.lookupKey).toBe(1);
        });

        it('should reject duplicate value', async () => {
            mockLookupRepository.exists.mockResolvedValue(true);

            await expect(lookupService.createLookup(lookupData, auditContext)).rejects.toMatchObject({
                statusCode: 409,
                errorCode: 'DUPLICATE_LOOKUP_VALUE',
            });
        });

        it('should wrap non-AppError from create', async () => {
            mockLookupRepository.exists.mockResolvedValue(false);
            mockLookupRepository.create.mockRejectedValue(new Error('insert fail'));

            await expect(lookupService.createLookup(lookupData, auditContext)).rejects.toMatchObject({
                errorCode: 'LOOKUP_CREATION_ERROR',
            });
        });
    });

    describe('getByKey', () => {
        it('should return lookup payload', async () => {
            const payload = { data: [{ lookupKey: 5 }] };
            mockLookupRepository.getByKey.mockResolvedValue(payload);

            const result = await lookupService.getByKey(5);

            expect(mockLookupRepository.getByKey).toHaveBeenCalledWith(5, mockClient);
            expect(result).toEqual(payload);
        });

        it('should throw when not found', async () => {
            mockLookupRepository.getByKey.mockResolvedValue(null);

            await expect(lookupService.getByKey(99)).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'LOOKUP_NOT_FOUND',
            });
        });

        it('should wrap unexpected errors', async () => {
            mockLookupRepository.getByKey.mockRejectedValue(new Error('db'));

            await expect(lookupService.getByKey(1)).rejects.toMatchObject({
                errorCode: 'LOOKUP_FETCH_ERROR',
            });
        });
    });

    describe('updateLookup', () => {
        it('should reject tag updates', async () => {
            mockLookupRepository.getByKey.mockResolvedValue({ data: [{ lookupKey: 1, tag: 'a', value: 'b' }] });

            await expect(
                lookupService.updateLookup(1, { tag: 'new' }, auditContext)
            ).rejects.toMatchObject({
                statusCode: 400,
                errorCode: 'TAG_UPDATE_NOT_ALLOWED',
            });
        });

        it('should update value', async () => {
            mockLookupRepository.getByKey.mockResolvedValue({ data: [{ lookupKey: 1, value: 'old' }] });
            mockLookupRepository.update.mockResolvedValue({ lookupKey: 1, value: 'new' });

            const result = await lookupService.updateLookup(1, { value: 'new' }, auditContext);

            expect(mockLookupRepository.update).toHaveBeenCalledWith(1, { value: 'new' }, mockClient);
            expect(result.value).toBe('new');
        });

        it('should throw when existing lookup missing', async () => {
            mockLookupRepository.getByKey.mockResolvedValue(null);

            await expect(lookupService.updateLookup(9, { value: 'x' }, auditContext)).rejects.toMatchObject({
                errorCode: 'LOOKUP_NOT_FOUND',
            });
        });

        it('should wrap non-AppError from update', async () => {
            mockLookupRepository.getByKey.mockResolvedValue({ data: [{ lookupKey: 1 }] });
            mockLookupRepository.update.mockRejectedValue(new Error('db'));

            await expect(lookupService.updateLookup(1, { value: 'n' }, auditContext)).rejects.toMatchObject({
                errorCode: 'LOOKUP_UPDATE_ERROR',
            });
        });
    });

    describe('deleteLookup', () => {
        it('should delete with audit context', async () => {
            mockLookupRepository.getByKey.mockResolvedValue({ data: [{ lookupKey: 9 }] });
            mockLookupRepository.delete.mockResolvedValue(true);

            const result = await lookupService.deleteLookup(9, auditContext);

            expect(mockLookupRepository.delete).toHaveBeenCalledWith(9, mockClient);
            expect(result.success).toBe(true);
            expect(result.data.lookupKey).toBe(9);
        });

        it('should throw when lookup row missing', async () => {
            mockLookupRepository.getByKey.mockResolvedValue(null);

            await expect(lookupService.deleteLookup(1, auditContext)).rejects.toMatchObject({
                errorCode: 'LOOKUP_NOT_FOUND',
            });
        });

        it('should throw when delete affects no rows', async () => {
            mockLookupRepository.getByKey.mockResolvedValue({ data: [{ lookupKey: 2 }] });
            mockLookupRepository.delete.mockResolvedValue(false);

            await expect(lookupService.deleteLookup(2, auditContext)).rejects.toMatchObject({
                errorCode: 'LOOKUP_NOT_FOUND',
            });
        });

        it('should wrap non-AppError from delete', async () => {
            mockLookupRepository.getByKey.mockResolvedValue({ data: [{ lookupKey: 3 }] });
            mockLookupRepository.delete.mockRejectedValue(new Error('db'));

            await expect(lookupService.deleteLookup(3, auditContext)).rejects.toMatchObject({
                errorCode: 'LOOKUP_DELETION_ERROR',
            });
        });
    });
});
