jest.mock('../../db', () => ({
    getConnection: jest.fn(),
    execute: jest.fn(),
}));

const db = require('../../db');
const WhatsappQueueRepository = require('../../repositories/whatsappQueueRepository');

describe('WhatsappQueueRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn(),
        };
        db.getConnection.mockResolvedValue(mockConn);
        repo = new WhatsappQueueRepository();
        jest.clearAllMocks();
    });

    it('insertPendingEnqueue returns insertId', async () => {
        mockConn.execute.mockResolvedValue([{ insertId: 77 }]);

        const id = await repo.insertPendingEnqueue(1, 2);

        expect(id).toBe(77);
        expect(mockConn.commit).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('insertPendingEnqueue rolls back on error', async () => {
        mockConn.execute.mockRejectedValue(new Error('db'));

        await expect(repo.insertPendingEnqueue(1, 2)).rejects.toThrow('db');
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    it('updateToProcessing calls db.execute', async () => {
        await repo.updateToProcessing(9, 1);

        expect(db.execute).toHaveBeenCalledWith(
            expect.stringContaining('PROCESSING'),
            [1, 9]
        );
    });

    it('getById returns row or null', async () => {
        mockConn.execute.mockResolvedValue([[{ id: 5, candidateId: 1 }]]);

        const row = await repo.getById(5);

        expect(row.id).toBe(5);
        expect(mockConn.release).toHaveBeenCalled();
    });
});
