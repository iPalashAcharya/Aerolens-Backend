const cron = require('node-cron');
const tokenRepository = require('../repositories/tokenRepository');
const candidateService = require('../services/candidateService');
const interviewService = require('../services/interviewService');
const memberService = require('../services/memberService');

class ScheduledJobs {
    static initializeAll() {
        this.scheduleTokenCleanup();
        this.scheduleCandidateCleanup();
        this.schedulePermanentInterviewCleanup();
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

    static scheduleCandidateCleanup() {
        // Run daily at 5 AM - Permanent deletion of soft-deleted candidates
        cron.schedule('0 5 * * *', async () => {
            try {
                console.log('🧹 Running candidate permanent cleanup job...');
                const deletedCount = await candidateService.permanentlyDeleteOldCandidates();
                console.log(`Candidate permanent cleanup completed: ${deletedCount} candidates permanently removed`);
            } catch (error) {
                console.error('Candidate permanent cleanup job failed:', error);
            }
        });
    }

    static schedulePermanentInterviewCleanup() {
        // Run daily at 6 AM - Permanent deletion of soft-deleted interviews
        cron.schedule('0 6 * * *', async () => {
            try {
                console.log('Running interview permanent cleanup job...');
                const deletedCount = await interviewService.permanentlyDeleteOldInterviews();
                console.log(`Interview permanent cleanup completed: ${deletedCount} interviews permanently removed`);
            } catch (error) {
                console.error('Interview permanent cleanup job failed:', error);
            }
        });
    }

    static schedulePermanentMemberCleanup() {
        // Run weekly on Sunday at 7 AM - Permanent deletion of deactivated members
        cron.schedule('0 7 * * 0', async () => {
            try {
                console.log('Running member permanent cleanup job...');
                const deletedCount = await memberService.permanentlyDeleteOldMembers();
                console.log(`Member permanent cleanup completed: ${deletedCount} members permanently removed`);
            } catch (error) {
                console.error('Member permanent cleanup job failed:', error);
            }
        });
    }
}

module.exports = ScheduledJobs;