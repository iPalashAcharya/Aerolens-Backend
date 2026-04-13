jest.mock('../../db', () => ({
    getConnection: jest.fn(),
    execute: jest.fn(),
}));

const db = require('../../db');
const WhatsappMessageLogRepository = require('../../repositories/whatsappMessageLogRepository');

describe('WhatsappMessageLogRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            execute: jest.fn(),
            release: jest.fn().mockResolvedValue(undefined),
        };
        db.getConnection.mockResolvedValue(mockConn);
        db.execute.mockResolvedValue([[]]);
        repo = new WhatsappMessageLogRepository();
        jest.clearAllMocks();
    });

    it('updateStatusByMetaMessageId sets delivered_at when setDeliveredAt is true', async () => {
        await repo.updateStatusByMetaMessageId('DELIVERED', 'meta-1', true);

        expect(db.execute).toHaveBeenCalledWith(
            expect.stringContaining('delivered_at = NOW()'),
            ['DELIVERED', 'meta-1']
        );
    });

    it('updateStatusByMetaMessageId omits delivered_at when false', async () => {
        await repo.updateStatusByMetaMessageId('SENT', 'meta-2', false);

        const [sql] = db.execute.mock.calls[0];
        expect(sql).not.toContain('delivered_at');
        expect(db.execute).toHaveBeenCalledWith(sql, ['SENT', 'meta-2']);
    });

    it('findForQueueJob without processedAt only lower bound', async () => {
        mockConn.execute.mockResolvedValue([[{ messageLogId: 1 }]]);

        const rows = await repo.findForQueueJob({
            candidateId: 1,
            groupId: 2,
            createdAt: '2020-01-01',
            processedAt: null,
        });

        expect(rows).toEqual([{ messageLogId: 1 }]);
        expect(mockConn.execute.mock.calls[0][1]).toEqual([1, 2, '2020-01-01']);
        expect(mockConn.release).toHaveBeenCalled();
    });

    it('findForQueueJob with processedAt adds upper bound', async () => {
        mockConn.execute.mockResolvedValue([[]]);

        await repo.findForQueueJob({
            candidateId: 1,
            groupId: 2,
            createdAt: 'a',
            processedAt: 'b',
        });

        expect(mockConn.execute.mock.calls[0][0]).toContain('sent_at <= ?');
        expect(mockConn.execute.mock.calls[0][1]).toEqual([1, 2, 'a', 'b']);
    });

    it('insertLogRows no-ops on empty array', async () => {
        await repo.insertLogRows([]);

        expect(db.execute).not.toHaveBeenCalled();
    });

    it('insertLogRows inserts each row', async () => {
        await repo.insertLogRows([
            {
                candidateId: 1,
                groupId: 2,
                memberId: 3,
                phone: '+1',
                messageStatus: 'SENT',
                metaMessageId: 'm1',
                errorMessage: null,
            },
        ]);

        expect(db.execute).toHaveBeenCalledTimes(1);
        expect(db.execute.mock.calls[0][1]).toEqual([1, 2, 3, '+1', 'SENT', 'm1', null]);
    });
});
