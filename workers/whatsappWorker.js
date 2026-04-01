require('dotenv').config();

const { Worker } = require('bullmq');
const db = require('../db');
const { redisConnection } = require('../config/redis');
const { queueName } = require('../queues/whatsappQueue');
const { getCandidate } = require('../services/whatsappCandidateService');
const { generateSignedUrl } = require('../services/s3Service');
const { buildDynamicText } = require('../services/messageService');
const { getRecipients } = require('../services/groupService');
const { sendToGroup } = require('../services/whatsappService');
const { logMessages } = require('../services/whatsappLogService');

// ---------------------------------------------------------------------------
// Safe DB helper — logs but never throws, so it never masks the real error
// ---------------------------------------------------------------------------
async function safeDbExec(label, sql, params) {
    try {
        await db.execute(sql, params);
    } catch (err) {
        console.error(`[WA WORKER] DB update failed (${label})`, {
            error: err.message,
            sql,
            params
        });
    }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
const whatsappWorker = new Worker(
    queueName,
    async (job) => {
        const { candidateId, groupId, customMessage, queueId } = job.data;

        console.log('[WA JOB START]', {
            jobId:        job.id,
            attemptsMade: job.attemptsMade,
            candidateId,
            groupId,
            queueId
        });

        // Mark as PROCESSING — wrapped so a transient DB hiccup doesn't abort the job
        await safeDbExec(
            'PROCESSING',
            `UPDATE whatsapp_queue
             SET status = 'PROCESSING', retry_count = ?
             WHERE id = ?`,
            [job.attemptsMade, queueId]
        );

        // Tracked so the catch block can produce fallback log entries
        let candidate  = null;
        let recipients = [];

        try {
            // ----------------------------------------------------------------
            // Step 1 — Candidate
            // ----------------------------------------------------------------
            candidate = await getCandidate(candidateId);

            if (!candidate) {
                throw new Error(`Candidate not found: candidateId=${candidateId}`);
            }
            if (!candidate.resumeKey) {
                throw new Error(`Candidate resumeKey missing: candidateId=${candidateId}`);
            }

            console.log('[WA] Candidate fetched', {
                candidateId,
                name:      candidate.name,
                resumeKey: candidate.resumeKey
            });

            // ----------------------------------------------------------------
            // Step 2 — S3 signed URL
            // ----------------------------------------------------------------
            const signedUrl = await generateSignedUrl(candidate.resumeKey);
            console.log('[WA] Signed URL generated', { resumeKey: candidate.resumeKey });

            // ----------------------------------------------------------------
            // Step 3 — Dynamic text
            // ----------------------------------------------------------------
            const dynamicText = buildDynamicText(candidate);
            console.log('[WA] Dynamic text built');

            // ----------------------------------------------------------------
            // Step 4 — Recipients
            // ----------------------------------------------------------------
            recipients = await getRecipients(groupId);
            console.log('[WA] Recipients resolved', {
                groupId,
                count:  recipients.length,
                phones: recipients.map(r => r.phone_number)
            });

            if (!recipients.length) {
                throw new Error(`No active recipients for groupId=${groupId}`);
            }

            // ----------------------------------------------------------------
            // Step 5 — Send
            // sendToGroup never throws; per-recipient errors are in results
            // ----------------------------------------------------------------
            const results = await sendToGroup(recipients, dynamicText, customMessage, signedUrl);
            console.log('[WA] sendToGroup complete', {
                total:   results.length,
                success: results.filter(r => r.status === 'SUCCESS').length,
                failed:  results.filter(r => r.status === 'FAILED').length
            });

            // ----------------------------------------------------------------
            // Step 6 — Log every result (SENT or FAILED per recipient)
            // ----------------------------------------------------------------
            await logMessages(candidateId, groupId, results);
            console.log('[WA] Logged to whatsapp_message_log');

            // ----------------------------------------------------------------
            // Step 7 — Mark DONE
            // ----------------------------------------------------------------
            await safeDbExec(
                'DONE',
                `UPDATE whatsapp_queue
                 SET status = 'DONE', retry_count = ?, processed_at = NOW()
                 WHERE id = ?`,
                [job.attemptsMade, queueId]
            );

            console.log('[WA JOB DONE]', { jobId: job.id, queueId });
            return true;

        } catch (error) {
            // ----------------------------------------------------------------
            // Full error visibility — always log Meta API response when present
            // ----------------------------------------------------------------
            console.error('[WA ERROR]', {
                jobId:        job.id,
                queueId,
                candidateId,
                groupId,
                attemptsMade: job.attemptsMade,
                message:      error.message,
                stack:        error.stack,
                metaResponse: error.response?.data,
                metaStatus:   error.response?.status
            });

            // ----------------------------------------------------------------
            // Guarantee at least one log row even if failure happened before send
            // ----------------------------------------------------------------
            try {
                if (recipients.length > 0) {
                    // Recipients were resolved — write a FAILED row per member
                    const failedResults = recipients.map(r => ({
                        memberId:      r.member_id,
                        phone:         r.phone_number,
                        status:        'FAILED',
                        metaMessageId: null,
                        errorMessage:  error.message
                    }));
                    await logMessages(candidateId, groupId, failedResults);
                } else {
                    // Failure before recipients resolved — write a single sentinel row
                    await logMessages(candidateId, groupId, [{
                        memberId:      null,
                        phone:         null,
                        status:        'FAILED',
                        metaMessageId: null,
                        errorMessage:  error.message
                    }]);
                }
                console.log('[WA] Failure persisted to whatsapp_message_log');
            } catch (logErr) {
                console.error('[WA] Could not write failure log', { error: logErr.message });
            }

            // ----------------------------------------------------------------
            // Mark FAILED with processed_at so row is never stuck as PROCESSING
            // ----------------------------------------------------------------
            await safeDbExec(
                'FAILED',
                `UPDATE whatsapp_queue
                 SET status = 'FAILED', retry_count = ?, processed_at = NOW()
                 WHERE id = ?`,
                [job.attemptsMade + 1, queueId]
            );

            // Re-throw so BullMQ applies configured retry / backoff
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: 1
    }
);

// ---------------------------------------------------------------------------
// BullMQ event listeners
// ---------------------------------------------------------------------------
whatsappWorker.on('completed', (job) => {
    console.log('[WA WORKER] Job completed', {
        jobId: job.id,
        data:  job.data
    });
});

whatsappWorker.on('failed', (job, err) => {
    console.error('[WA WORKER] Job permanently failed', {
        jobId:        job?.id,
        attemptsMade: job?.attemptsMade,
        candidateId:  job?.data?.candidateId,
        groupId:      job?.data?.groupId,
        queueId:      job?.data?.queueId,
        error:        err.message
    });
});

whatsappWorker.on('error', (err) => {
    console.error('[WA WORKER] Worker-level error', { error: err.message, stack: err.stack });
});

module.exports = whatsappWorker;
