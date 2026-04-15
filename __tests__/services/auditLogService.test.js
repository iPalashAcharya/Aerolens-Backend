jest.mock('../../repositories/auditLogsRepository', () => ({
    create: jest.fn().mockResolvedValue(true),
    findMany: jest.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 }),
    findById: jest.fn().mockResolvedValue(null)
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

    it('logAction formats timestamp and delegates to repository.create with extended payload', async () => {
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
                entityType: 'candidate',
                entityId: 99,
                method: 'POST',
                path: '/candidate'
            },
            conn
        );

        expect(auditLogsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 1,
                action: 'CREATE',
                resourceType: 'candidate',
                resourceId: '99',
                verb: 'candidate.created',
                newValues: JSON.stringify({ a: 1 }),
                ipAddress: '1.1.1.1',
                userAgent: 'jest',
                httpMethod: 'POST',
                httpPath: '/candidate',
                timestamp: '2024-01-15 12:30:45',
                occurredAtUtc: '2024-01-15 12:30:45.000'
            }),
            conn
        );
    });

    it('maps previousValues to old_values payload', async () => {
        const conn = {};
        await auditLogService.logAction(
            {
                userId: 2,
                action: 'UPDATE',
                previousValues: { id: 1 },
                newValues: { id: 1, x: 2 },
                ipAddress: '0.0.0.0',
                userAgent: 'ua',
                timestamp: new Date('2024-06-01T00:00:00.000Z')
            },
            conn
        );

        expect(auditLogsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                oldValues: JSON.stringify({ id: 1 }),
                newValues: JSON.stringify({ id: 1, x: 2 })
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
                userAgent: 'ua'
            },
            conn
        );

        expect(auditLogsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                timestamp: null,
                occurredAtUtc: null
            }),
            conn
        );
    });
});
