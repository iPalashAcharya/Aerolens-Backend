const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, bucketName } = require('../config/s3');

async function generateSignedUrl(resumeKey) {
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: resumeKey
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    if (!signedUrl || !signedUrl.startsWith('https://')) {
        throw new Error('Signed URL must be HTTPS');
    }

    return signedUrl;
}

module.exports = {
    generateSignedUrl
};
