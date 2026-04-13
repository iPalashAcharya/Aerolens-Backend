const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: mockSend,
    })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => input),
}));

describe('s3CleanupMiddleware', () => {
    let cleanupS3OnError;
    const originalBucket = process.env.AWS_S3_BUCKET;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env.AWS_S3_BUCKET = 'test-bucket';
        cleanupS3OnError = require('../../middleware/s3CleanupMiddleware');
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env.AWS_S3_BUCKET = originalBucket;
        console.log.mockRestore();
        console.error.mockRestore();
    });

    it('passes err to next when no file key', (done) => {
        const err = new Error('validation');
        cleanupS3OnError(err, { file: {} }, {}, (e) => {
            expect(e).toBe(err);
            expect(mockSend).not.toHaveBeenCalled();
            done();
        });
    });

    it('deletes S3 object then passes original error', async () => {
        mockSend.mockResolvedValue({});
        const err = new Error('bad');
        const req = { file: { key: 'uploads/x.pdf' } };

        await new Promise((resolve, reject) => {
            cleanupS3OnError(err, req, {}, (e) => {
                try {
                    expect(e).toBe(err);
                    expect(mockSend).toHaveBeenCalled();
                    resolve();
                } catch (x) {
                    reject(x);
                }
            });
        });
    });
});
