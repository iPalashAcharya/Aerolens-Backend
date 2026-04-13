jest.mock('node-cron', () => ({
    schedule: jest.fn(),
}));

jest.mock('../../repositories/tokenRepository', () => ({
    cleanupExpiredTokens: jest.fn().mockResolvedValue(3),
}));

const cron = require('node-cron');
const tokenRepository = require('../../repositories/tokenRepository');
const ScheduledJobs = require('../../jobs/scheduledJobs');

describe('ScheduledJobs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.log.mockRestore();
        console.error.mockRestore();
    });

    it('initializeAll registers cron and logs', () => {
        ScheduledJobs.initializeAll();

        expect(cron.schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('cron jobs'));
    });

    it('cron callback runs cleanupExpiredTokens', async () => {
        ScheduledJobs.initializeAll();
        const cronCb = cron.schedule.mock.calls[0][1];

        await cronCb();

        expect(tokenRepository.cleanupExpiredTokens).toHaveBeenCalled();
    });
});
