// middleware/s3CleanupMiddleware.js

const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1'
});

/**
 * Middleware to cleanup S3 files on validation errors
 * Place this AFTER validator middlewares in the route chain
 */
const cleanupS3OnError = (err, req, res, next) => {
    // If there's an error and a file was uploaded to S3
    if (err && req.file && req.file.key) {
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: req.file.key
        });

        s3Client.send(command)
            .then(() => {
                console.log(`✓ Cleaned up S3 file after error: ${req.file.key}`);
            })
            .catch(deleteError => {
                console.error('✗ Failed to cleanup S3 file:', deleteError);
            })
            .finally(() => {
                // Pass the original error to next error handler
                next(err);
            });
    } else {
        // No file to cleanup, just pass error along
        next(err);
    }
};

module.exports = cleanupS3OnError;