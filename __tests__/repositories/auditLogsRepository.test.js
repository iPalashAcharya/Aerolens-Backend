const auditLogsRepository = require('../../repositories/auditLogsRepository');

describe('AuditLogRepository', () => {
    let mockConnection;

    beforeEach(() => {
        mockConnection = {
            execute: jest.fn().mockResolvedValue([{ insertId: 1 }]),
            release: jest.fn().mockResolvedValue(undefined),
        };
        auditLogsRepository.db = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
        };
    });

    const samplePayload = () => ({
        userId: 1,
        action: 'TEST',
        oldValues: null,
        newValues: null,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        reason: null,
        timestamp: '2024-01-01 00:00:00',
    });

    it('create executes insert and releases connection', async () => {
        const ok = await auditLogsRepository.create(samplePayload());

        expect(ok).toBe(true);
        expect(mockConnection.execute).toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    it('create with external client does not release', async () => {
        const client = {
            execute: jest.fn().mockResolvedValue([]),
        };

        await auditLogsRepository.create(samplePayload(), client);

        expect(auditLogsRepository.db.getConnection).not.toHaveBeenCalled();
        expect(client.execute).toHaveBeenCalled();
    });

    it.each([
        ['ER_DUP_ENTRY', 409, 'DUPLICATE_ENTRY'],
        ['ER_DATA_TOO_LONG', 400, 'DATA_TOO_LONG'],
        ['ER_BAD_NULL_ERROR', 400, 'NULL_CONSTRAINT_VIOLATION'],
        ['ER_NO_REFERENCED_ROW_2', 400, 'FOREIGN_KEY_CONSTRAINT'],
        ['ER_ROW_IS_REFERENCED_2', 400, 'FK_CONSTRAINT_DELETE'],
        ['ECONNREFUSED', 503, 'DATABASE_CONNECTION_ERROR'],
        ['ER_ACCESS_DENIED_ERROR', 503, 'DATABASE_ACCESS_DENIED'],
    ])('maps %s to AppError', async (code, status, errCode) => {
        mockConnection.execute.mockRejectedValue(Object.assign(new Error('db'), { code }));

        await expect(auditLogsRepository.create(samplePayload())).rejects.toMatchObject({
            statusCode: status,
            errorCode: errCode,
        });
    });

    it('maps unknown DB errors to generic DATABASE_ERROR', async () => {
        mockConnection.execute.mockRejectedValue(new Error('weird'));

        await expect(auditLogsRepository.create(samplePayload())).rejects.toMatchObject({
            statusCode: 500,
            errorCode: 'DATABASE_ERROR',
        });
    });
});
