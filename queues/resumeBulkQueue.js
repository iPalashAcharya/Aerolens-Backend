const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const resumeBulkQueue = new Queue('resume-bulk-queue', {
    connection: redisConnection
});

module.exports = {
    resumeBulkQueue,
    redisConnection
};