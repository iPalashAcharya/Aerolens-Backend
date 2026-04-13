jest.mock('../../config/resumeBulkRedisState', () => ({
    initBatchState: jest.fn().mockResolvedValue(undefined),
}));

const { initBatchState } = require('../../config/resumeBulkRedisState');
const resumeBulkUploadService = require('../../services/resumeBulkUploadService');
const AppError = require('../../utils/appError');

describe('ResumeBulkUploadService', () => {
    let queue;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        queue = { add: jest.fn().mockResolvedValue(undefined) };
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('throws when zipBuffer is missing', async () => {
        await expect(resumeBulkUploadService.uploadZipAndStartBatch(null, queue)).rejects.toMatchObject({
            errorCode: 'MISSING_ZIP_FILE',
            statusCode: 400,
        });
    });

    it('throws when queue is missing', async () => {
        await expect(resumeBulkUploadService.uploadZipAndStartBatch(Buffer.from('x'), null)).rejects.toMatchObject({
            errorCode: 'QUEUE_NOT_INITIALIZED',
            statusCode: 500,
        });
    });

    it('initializes Redis state, enqueues job, returns batchId', async () => {
        const buf = Buffer.from('zip');

        const out = await resumeBulkUploadService.uploadZipAndStartBatch(buf, queue);

        expect(initBatchState).toHaveBeenCalledWith(out.batchId);
        expect(queue.add).toHaveBeenCalledWith(
            'resume-bulk-job',
            { batchId: out.batchId, zipBuffer: buf.toString('base64') },
            expect.objectContaining({ attempts: 2 })
        );
        expect(out.batchId).toBeDefined();
    });

    it('rethrows AppError from initBatchState', async () => {
        const err = new AppError('redis down', 503, 'REDIS');
        initBatchState.mockRejectedValueOnce(err);

        await expect(resumeBulkUploadService.uploadZipAndStartBatch(Buffer.from('a'), queue)).rejects.toBe(err);
    });
});
