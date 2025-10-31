const cron = require('node-cron');
const tokenRepository = require('../repositories/tokenRepository');

// Run cleanup every day at 2 AM
const scheduleTokenCleanup = () => {
    cron.schedule('0 2 * * *', async () => {
        try {
            console.log('Running token cleanup job...');
            await tokenRepository.cleanupExpiredTokens();
            console.log('Token cleanup completed successfully');
        } catch (error) {
            console.error('Token cleanup job failed:', error);
        }
    });
};

module.exports = { scheduleTokenCleanup };