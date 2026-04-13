let jobProcessor;

jest.mock('bullmq', () => ({
    Worker: jest.fn().mockImplementation((_name, processor) => {
        jobProcessor = processor;
        return {
            close: jest.fn().mockResolvedValue(undefined),
            on: jest.fn()
        };
    })
}));

jest.mock('../../queues/resumeBulkQueue', () => ({
    redisConnection: {}
}));

jest.mock('../../config/resumeBulkRedisState', () => ({
    updateBatchState: jest.fn().mockResolvedValue(undefined),
    incrementBatchCounters: jest.fn().mockResolvedValue(undefined),
    getBatchState: jest.fn().mockResolvedValue({})
}));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({})
    })),
    PutObjectCommand: jest.fn()
}));

jest.mock('../../db', () => ({
    getConnection: jest.fn()
}));

jest.mock('../../repositories/candidateRepository', () =>
    jest.fn().mockImplementation(() => ({
        findByEmail: jest.fn(),
        getResumeInfo: jest.fn(),
        updateResumeInfo: jest.fn()
    }))
);

describe('resumeBulkWorker job handler', () => {
    it('completes batch when zip has no PDF entries', async () => {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        const zipBuffer = zip.toBuffer().toString('base64');

        const { updateBatchState } = require('../../config/resumeBulkRedisState');

        require('../../workers/resumeBulkWorker');

        expect(typeof jobProcessor).toBe('function');

        await expect(
            jobProcessor({ data: { batchId: 'batch-empty', zipBuffer } })
        ).resolves.toBe(true);

        expect(updateBatchState).toHaveBeenCalledWith(
            'batch-empty',
            expect.objectContaining({
                status: 'PROCESSING'
            })
        );
        expect(updateBatchState).toHaveBeenCalledWith(
            'batch-empty',
            expect.objectContaining({
                status: 'COMPLETED',
                totalFiles: 0
            })
        );
    });
});
