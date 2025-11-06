const cron = require('node-cron');
const tokenRepository = require('../repositories/tokenRepository');

class TokenCleanup {
    static initializeAll() {
        // Token cleanup job - runs every day at 2 AM
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('🧹 Running token cleanup job...');
                const deletedCount = await tokenRepository.cleanupExpiredTokens();
                console.log(`✅ Token cleanup completed: ${deletedCount} tokens removed`);
            } catch (error) {
                console.error('❌ Token cleanup job failed:', error);
            }
        });

        console.log('✅ Cron jobs initialized - Token cleanup scheduled for 2 AM daily');
    }
}

module.exports = TokenCleanup;