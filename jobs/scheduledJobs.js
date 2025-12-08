const cron = require('node-cron');
const tokenRepository = require('../repositories/tokenRepository');
const candidateService = require('../services/candidateService');
const interviewService = require('../services/interviewService');
const memberService = require('../services/memberService');

class ScheduledJobs {
    static initializeAll() {
        this.scheduleTokenCleanup();
        this.schedulePermanentInterviewCleanup();
        this.schedulePermanentCandidateCleanup();
        this.schedulePermanentMemberCleanup();
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

    static schedulePermanentInterviewCleanup() {
        // Run daily at 5 AM - Delete interviews FIRST
        cron.schedule('0 5 * * *', async () => {
            try {
                console.log('🧹 Running interview permanent cleanup job...');
                const deletedCount = await interviewService.permanentlyDeleteOldInterviews();
                console.log(`✅ Interview permanent cleanup completed: ${deletedCount} interviews permanently removed`);
            } catch (error) {
                console.error('❌ Interview permanent cleanup job failed:', error);
            }
        });
    }

    static schedulePermanentCandidateCleanup() {
        // Run daily at 6 AM - Delete candidates SECOND
        cron.schedule('0 6 * * *', async () => {
            try {
                console.log('🧹 Running candidate permanent cleanup job...');
                const deletedCount = await candidateService.permanentlyDeleteOldCandidates();
                console.log(`✅ Candidate permanent cleanup completed: ${deletedCount} candidates permanently removed`);
            } catch (error) {
                console.error('❌ Candidate permanent cleanup job failed:', error);
            }
        });
    }

    static schedulePermanentMemberCleanup() {
        // Run daily at 7 AM - Delete members LAST
        cron.schedule('0 7 * * *', async () => {
            try {
                console.log('🧹 Running member permanent cleanup job...');
                const deletedCount = await memberService.permanentlyDeleteOldMembers();
                console.log(`✅ Member permanent cleanup completed: ${deletedCount} members permanently removed`);
            } catch (error) {
                console.error('❌ Member permanent cleanup job failed:', error);
            }
        });
    }
}

module.exports = ScheduledJobs;