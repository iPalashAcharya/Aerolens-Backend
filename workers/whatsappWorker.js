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

const whatsappWorker = new Worker(
    queueName,
    async (job) => {
        const { candidateId, groupId, customMessage, queueId } = job.data;

        await db.execute(
            `UPDATE whatsapp_queue
             SET status = 'PROCESSING', retry_count = ?
             WHERE id = ?`,
            [job.attemptsMade, queueId]
        );

        try {
            const candidate = await getCandidate(candidateId);
            if (!candidate) {
                throw new Error('Candidate not found');
            }
            if (!candidate.resumeKey) {
                throw new Error('Candidate resumeKey missing');
            }

            const signedUrl = await generateSignedUrl(candidate.resumeKey);
            const dynamicText = buildDynamicText(candidate);
            const recipients = await getRecipients(groupId);
            const results = await sendToGroup(recipients, dynamicText, customMessage, signedUrl);

            await logMessages(candidateId, groupId, results);

            await db.execute(
                `UPDATE whatsapp_queue
                 SET status = 'DONE', retry_count = ?, processed_at = NOW()
                 WHERE id = ?`,
                [job.attemptsMade, queueId]
            );

            return true;
        } catch (error) {
            await db.execute(
                `UPDATE whatsapp_queue
                 SET status = 'FAILED', retry_count = ?
                 WHERE id = ?`,
                [job.attemptsMade + 1, queueId]
            );
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: 1
    }
);

module.exports = whatsappWorker;
