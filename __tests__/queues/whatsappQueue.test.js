const mockInsertPendingEnqueue = jest.fn();
const mockAdd = jest.fn();

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: mockAdd,
    })),
}));

jest.mock('../../config/redis', () => ({
    redisConnection: { host: 'localhost' },
}));

jest.mock('../../repositories/whatsappQueueRepository', () =>
    jest.fn().mockImplementation(() => ({
        insertPendingEnqueue: mockInsertPendingEnqueue,
    }))
);

describe('whatsappQueue enqueueWhatsAppResumeJob', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockInsertPendingEnqueue.mockResolvedValue(55);
        mockAdd.mockResolvedValue(undefined);
    });

    it('inserts pending row then adds bull job with queueId', async () => {
        const { enqueueWhatsAppResumeJob } = require('../../queues/whatsappQueue');

        const out = await enqueueWhatsAppResumeJob({
            candidateId: 1,
            groupId: 2,
            customMessage: 'hi',
        });

        expect(mockInsertPendingEnqueue).toHaveBeenCalledWith(1, 2);
        expect(mockAdd).toHaveBeenCalledWith(
            'send-resume',
            expect.objectContaining({
                candidateId: 1,
                groupId: 2,
                customMessage: 'hi',
                queueId: 55,
            })
        );
        expect(out).toEqual({ queueId: 55 });
    });
});
