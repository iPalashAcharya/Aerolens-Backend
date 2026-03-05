const { Worker } = require('bullmq');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const pLimit = require('p-limit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const CandidateRepository = require('../repositories/candidateRepository');
const db = require('../db');

const {
    updateBatchState,
    incrementBatchCounters,
    getBatchState
} = require('../config/resumeBulkRedisState');

const { redisConnection } = require('../queues/resumeBulkQueue');

// ----------------------------------------
// CONFIG
// ----------------------------------------

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET;
let S3_RESUME_FOLDER;
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
    S3_RESUME_FOLDER = 'development/resumes/';
} else if (process.env.NODE_ENV === 'production') {
    S3_RESUME_FOLDER = 'resumes/';
} else {
    S3_RESUME_FOLDER = 'development/resumes/';
}

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const candidateRepo = new CandidateRepository(db);
const limit = pLimit(5);

// ----------------------------------------
// UTILITIES
// ----------------------------------------

function extractEmail(text) {
    if (!text) return null;
    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g);
    return matches ? matches[0].toLowerCase() : null;
}

async function uploadToS3(buffer, key, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const contentTypeMap = {
        '.pdf':  'application/pdf',
        '.doc':  'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentTypeMap[ext] || 'application/octet-stream',
        ServerSideEncryption: 'AES256'
    }));
}

// ----------------------------------------
// WORKER
// ----------------------------------------

const resumeBulkWorker = new Worker(
    'resume-bulk-queue',
    async (job) => {
        const { batchId, zipBuffer } = job.data;

        try {
            // STEP 1 — Mark as processing
            await updateBatchState(batchId, { status: 'PROCESSING' });

            // STEP 2 — Extract ZIP in memory
            const zip = new AdmZip(Buffer.from(zipBuffer, 'base64'));
            const pdfEntries = zip
                .getEntries()
                .filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'));

            if (pdfEntries.length === 0) {
                await updateBatchState(batchId, {
                    status: 'COMPLETED',
                    totalFiles: 0,
                    completedAt: new Date().toISOString()
                });
                return true;
            }

            await updateBatchState(batchId, { totalFiles: pdfEntries.length });

            // STEP 3 — Process each PDF with capped concurrency
            const tasks = pdfEntries.map(entry =>
                limit(async () => {
                    // Safety: if batch state expired mid-run, abort
                    const alive = await getBatchState(batchId);
                    if (!alive) return;

                    const fileName = entry.name; // just filename, not full path
                    const pdfBuffer = entry.getData();

                    try {
                        // Parse PDF text
                        const parsed = await pdfParse(pdfBuffer);
                        const email = extractEmail(parsed.text);

                        if (!email) {
                            await incrementBatchCounters(batchId, { skipped_no_match: 1, processed: 1 });
                            return;
                        }

                        // DB work — one connection per PDF, released in finally
                        const client = await db.getConnection();
                        try {
                            // Match candidate by email
                            const candidate = await candidateRepo.findByEmail(email, client);

                            if (!candidate) {
                                await incrementBatchCounters(batchId, { skipped_no_match: 1, processed: 1 });
                                return;
                            }

                            // Check if resume already exists (Option A — silent skip)
                            const resumeInfo = await candidateRepo.getResumeInfo(candidate.candidateId, client);
                            if (resumeInfo && resumeInfo.resumeFilename) {
                                await incrementBatchCounters(batchId, { skipped_already_exists: 1, processed: 1 });
                                return;
                            }

                            // Upload to S3 — only after confirmed match + no existing resume
                            const timestamp = Date.now();
                            const ext = path.extname(fileName) || '.pdf';
                            const s3Key = `${S3_RESUME_FOLDER}candidate_${candidate.candidateId}_${timestamp}${ext}`;

                            await uploadToS3(pdfBuffer, s3Key, fileName);

                            // Update DB inside transaction
                            await client.beginTransaction();
                            await candidateRepo.updateResumeInfo(
                                candidate.candidateId,
                                s3Key,
                                fileName,
                                client
                            );
                            await client.commit();

                            await incrementBatchCounters(batchId, { linked: 1, processed: 1 });

                        } catch (err) {
                            console.error(`[Worker] DB/S3 error — file: ${fileName}`, err);
                            try { await client.rollback(); } catch (_) {}
                            await incrementBatchCounters(batchId, { failed: 1, processed: 1 });
                        } finally {
                            client.release(); // always released
                        }

                    } catch (err) {
                        // PDF parse failure or other unexpected error
                        console.error(`[Worker] Parse error — file: ${fileName}`, err);
                        await incrementBatchCounters(batchId, { failed: 1, processed: 1 });
                    }
                })
            );

            await Promise.all(tasks);

            // STEP 4 — Mark completed
            await updateBatchState(batchId, {
                status: 'COMPLETED',
                completedAt: new Date().toISOString()
            });

            return true;

        } catch (err) {
            console.error('[Worker] Fatal batch error', err);
            await updateBatchState(batchId, {
                status: 'FAILED',
                errorMessage: err.message
            });
            throw err; // rethrow so BullMQ marks job as failed
        }
    },
    {
        connection: redisConnection,
        concurrency: 1
    }
);

resumeBulkWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed permanently:`, err.message);
});

module.exports = resumeBulkWorker;