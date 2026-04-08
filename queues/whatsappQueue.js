const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');
const WhatsappQueueRepository = require('../repositories/whatsappQueueRepository');

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

const whatsappQueueRepository = new WhatsappQueueRepository();

async function enqueueWhatsAppResumeJob(payload) {
    const queueId = await whatsappQueueRepository.insertPendingEnqueue(
        payload.candidateId,
        payload.groupId
    );

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
