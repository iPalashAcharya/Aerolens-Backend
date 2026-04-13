jest.mock('../../repositories/auditLogsRepository', () => ({
    create: jest.fn().mockResolvedValue(true),
}));

const auditLogsRepository = require('../../repositories/auditLogsRepository');
const auditLogService = require('../../services/auditLogService');

describe('auditLogService', () => {
    let logSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it('logAction formats timestamp and delegates to repository.create', async () => {
        const ts = new Date('2024-01-15T12:30:45.000Z');
        const conn = {};

        await auditLogService.logAction(
            {
                userId: 1,
                action: 'CREATE',
                oldValues: null,
                newValues: { a: 1 },
                ipAddress: '1.1.1.1',
                userAgent: 'jest',
                timestamp: ts,
            },
            conn
        );

        expect(auditLogsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 1,
                action: 'CREATE',
                newValues: JSON.stringify({ a: 1 }),
                ipAddress: '1.1.1.1',
                userAgent: 'jest',
                timestamp: '2024-01-15 12:30:45',
            }),
            conn
        );
    });

    it('logAction handles missing timestamp', async () => {
        const conn = {};
        await auditLogService.logAction(
            {
                userId: 2,
                action: 'DELETE',
                ipAddress: '0.0.0.0',
                userAgent: 'ua',
            },
            conn
        );

        expect(auditLogsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                timestamp: null,
            }),
            conn
        );
    });
});
