const mockInsertLogRows = jest.fn().mockResolvedValue(undefined);

jest.mock('../../repositories/whatsappMessageLogRepository', () =>
    jest.fn().mockImplementation(() => ({
        insertLogRows: mockInsertLogRows,
    }))
);

const { logMessages } = require('../../services/whatsappLogService');

describe('whatsappLogService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does nothing when results array is empty', async () => {
        await logMessages(1, 2, []);

        expect(mockInsertLogRows).not.toHaveBeenCalled();
    });

    it('maps SUCCESS to SENT and inserts rows', async () => {
        await logMessages(10, 20, [
            { phone: '+1', status: 'SUCCESS', metaMessageId: 'm1', memberId: 3 },
            { phone: '+2', status: 'FAIL', errorMessage: 'e', memberId: null },
        ]);

        expect(mockInsertLogRows).toHaveBeenCalledWith([
            expect.objectContaining({
                candidateId: 10,
                groupId: 20,
                memberId: 3,
                phone: '+1',
                messageStatus: 'SENT',
                metaMessageId: 'm1',
                errorMessage: null,
            }),
            expect.objectContaining({
                messageStatus: 'FAILED',
                errorMessage: 'e',
            }),
        ]);
    });
});
