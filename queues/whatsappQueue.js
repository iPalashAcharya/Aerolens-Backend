const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');
const db = require('../db');

const queueName = 'whatsapp-resume-queue';

const whatsappResumeQueue = new Queue(queueName, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

async function enqueueWhatsAppResumeJob(payload) {
    const [insertResult] = await db.execute(
        `INSERT INTO whatsapp_queue (candidate_id, group_id, status)
         VALUES (?, ?, 'PENDING')`,
        [payload.candidateId, payload.groupId]
    );

    const queueId = insertResult.insertId;

    await whatsappResumeQueue.add('send-resume', {
        ...payload,
        queueId
    });

    return { queueId };
}

module.exports = {
    queueName,
    whatsappResumeQueue,
    enqueueWhatsAppResumeJob
};
