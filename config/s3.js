const { S3Client } = require('@aws-sdk/client-s3');

// Consistent with the rest of the codebase (candidateService, resumeBulkWorker):
// credentials are resolved via SDK default chain (IAM role in prod, env vars if set).
// Do NOT pass explicit undefined values.
const s3Client = new S3Client({
    region: process.env.AWS_REGION
});

// .env uses AWS_S3_BUCKET; support S3_BUCKET_NAME as well for WhatsApp module
const bucketName = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME;

module.exports = {
    s3Client,
    bucketName
};
