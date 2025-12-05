const cron = require('node-cron');
const tokenRepository = require('../repositories/tokenRepository');
const interviewRepository = require('../repositories/interviewRepository');
const memberRepository = require('../repositories/memberRepository');

class ScheduledJobs {
    static initializeAll() {
        this.scheduleTokenCleanup();
        this.scheduleInterviewCleanup();
        this.scheduleMemberCleanup();

        console.log('✅ All cron jobs initialized');
    }

    static scheduleTokenCleanup() {
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('🧹 Running token cleanup job...');
                const deletedCount = await tokenRepository.cleanupExpiredTokens();
                console.log(`✅ Token cleanup completed: ${deletedCount} tokens removed`);
            } catch (error) {
                console.error('❌ Token cleanup job failed:', error);
            }
        });
    }

    static scheduleInterviewCleanup() {
        cron.schedule('0 3 * * *', async () => {
            try {
                console.log('🧹 Running interview cleanup job...');
                const deletedCount = await interviewRepository.cleanupInactiveInterviews();
                console.log(`✅ Interview cleanup completed: ${deletedCount} interviews removed`);
            } catch (error) {
                console.error('❌ Interview cleanup job failed:', error);
            }
        });
    }

    static scheduleMemberCleanup() {
        cron.schedule('0 4 * * 0', async () => {
            try {
                console.log('🧹 Running member cleanup job...');
                const deletedCount = await memberRepository.deleteAccount();
                console.log(`✅ Member cleanup completed: ${deletedCount} members removed`);
            } catch (error) {
                console.error('❌ Member cleanup job failed:', error);
            }
        });
    }
}

module.exports = ScheduledJobs;