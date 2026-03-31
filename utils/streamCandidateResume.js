const { GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

function getMimeType(filename) {
    const ext = path.extname(filename || '').toLowerCase();
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

function sanitizeFilename(filename) {
    return String(filename || 'resume').replace(/["\\\r\n]/g, '');
}

/**
 * Stream a candidate resume from S3 to an Express response (shared by authenticated + public share flows).
 */
async function streamCandidateResumeToResponse(candidateService, resumeData, res, { inline = false } = {}) {
    const command = new GetObjectCommand({
        Bucket: candidateService.bucketName,
        Key: resumeData.s3Key
    });

    const s3Response = await candidateService.s3Client.send(command);
    const mimeType = getMimeType(resumeData.originalName);
    const sanitizedFilename = sanitizeFilename(resumeData.originalName);
    const disposition = inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${sanitizedFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (s3Response.ContentLength) {
        res.setHeader('Content-Length', s3Response.ContentLength);
    }

    if (s3Response.Body.pipe) {
        s3Response.Body.pipe(res);
    } else {
        const stream = s3Response.Body;
        for await (const chunk of stream) {
            res.write(chunk);
        }
        res.end();
    }
}

module.exports = {
    streamCandidateResumeToResponse,
    getMimeType,
    sanitizeFilename
};
