describe('config/s3', () => {
    const ORIGINAL_ENV = process.env;

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
        jest.resetModules();
    });

    it('exports bucketName from AWS_S3_BUCKET when set', () => {
        process.env = { ...ORIGINAL_ENV, AWS_S3_BUCKET: 'bucket-a', AWS_REGION: 'eu-west-1' };

        const s3 = require('../../config/s3');

        expect(s3.bucketName).toBe('bucket-a');
        expect(s3.s3Client).toBeDefined();
    });

    it('falls back to S3_BUCKET_NAME when AWS_S3_BUCKET unset', () => {
        process.env = { ...ORIGINAL_ENV, S3_BUCKET_NAME: 'bucket-b', AWS_REGION: 'us-east-1' };
        delete process.env.AWS_S3_BUCKET;

        const s3 = require('../../config/s3');

        expect(s3.bucketName).toBe('bucket-b');
    });
});
