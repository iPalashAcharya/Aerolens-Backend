let jobProcessor;

jest.mock('bullmq', () => ({
    Worker: jest.fn().mockImplementation((_name, processor) => {
        jobProcessor = processor;
        return {
            close: jest.fn().mockResolvedValue(undefined),
            on: jest.fn(),
        };
    }),
}));

jest.mock('../../config/redis', () => ({
    redisConnection: {},
}));

jest.mock('../../queues/whatsappQueue', () => ({
    queueName: 'whatsapp-resume-queue',
}));

jest.mock('../../repositories/whatsappQueueRepository', () =>
    jest.fn().mockImplementation(() => ({
        updateToProcessing: jest.fn().mockResolvedValue(undefined),
        updateToDone: jest.fn().mockResolvedValue(undefined),
        updateToFailed: jest.fn().mockResolvedValue(undefined),
    }))
);

jest.mock('../../services/whatsappCandidateService', () => ({
    getCandidate: jest.fn().mockResolvedValue({
        candidateId: 1,
        name: 'Test',
        resumeKey: 'resumes/x.pdf',
    }),
}));

jest.mock('../../services/s3Service', () => ({
    generateSignedUrl: jest.fn().mockResolvedValue('https://signed'),
}));

jest.mock('../../services/messageService', () => ({
    buildWhatsappTemplateBodyParams: jest.fn().mockReturnValue([]),
}));

jest.mock('../../services/groupService', () => ({
    getRecipients: jest.fn().mockResolvedValue([
        { member_id: 1, phone_number: '+10000000000' },
    ]),
}));

jest.mock('../../services/whatsappService', () => ({
    sendToGroup: jest.fn().mockResolvedValue([
        { status: 'SUCCESS', phone_number: '+10000000000' },
    ]),
    validateCustomMessage: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../services/whatsappLogService', () => ({
    logMessages: jest.fn().mockResolvedValue(undefined),
}));

describe('whatsappWorker job handler', () => {
    it('runs processor without throwing on happy path', async () => {
        require('../../workers/whatsappWorker');

        expect(typeof jobProcessor).toBe('function');

        const job = {
            id: 'job-1',
            attemptsMade: 0,
            data: {
                candidateId: 1,
                groupId: 2,
                queueId: 9,
                customMessage: undefined,
            },
        };

        await expect(jobProcessor(job)).resolves.toBe(true);
    });
});
