jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({ name: 'resume-bulk' })),
}));

jest.mock('../../config/redis', () => ({
    redisConnection: { host: '127.0.0.1' },
}));

describe('resumeBulkQueue module', () => {
    it('exports queue and redisConnection', () => {
        const mod = require('../../queues/resumeBulkQueue');

        expect(mod.resumeBulkQueue).toEqual({ name: 'resume-bulk' });
        expect(mod.redisConnection).toEqual({ host: '127.0.0.1' });
    });
});
