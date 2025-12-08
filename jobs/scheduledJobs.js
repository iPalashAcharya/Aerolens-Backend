const cron = require('node-cron');
const tokenRepository = require('../repositories/tokenRepository');

class ScheduledJobs {
    static initializeAll() {
        this.scheduleTokenCleanup();
        console.log('✅ All cron jobs initialized');
    }

    static scheduleTokenCleanup() {
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('🧹 Running token cleanup job...');
                const deletedCount = await tokenRepository.cleanupExpiredTokens();
                console.log(`✅ Token cleanup completed: ${deletedCount} tokens removed`);
            } catch (error) {
                console.error('Token cleanup job failed:', error);
            }
        });
    }
}

module.exports = ScheduledJobs;