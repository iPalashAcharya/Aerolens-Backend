describe('config/redis', () => {
    const originalEnv = process.env;

    afterEach(() => {
        process.env = originalEnv;
        jest.resetModules();
    });

    it('exports redisConnection with host, port, and optional password', () => {
        process.env = {
            ...originalEnv,
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '6379',
            REDIS_PASSWORD: 'secret',
        };
        jest.resetModules();

        const { redisConnection } = require('../../config/redis');

        expect(redisConnection.host).toBe('127.0.0.1');
        expect(redisConnection.port).toBe(6379);
        expect(redisConnection.password).toBe('secret');
    });

    it('uses undefined password when REDIS_PASSWORD is unset', () => {
        process.env = { ...originalEnv, REDIS_HOST: 'h', REDIS_PORT: '1111' };
        delete process.env.REDIS_PASSWORD;
        jest.resetModules();

        const { redisConnection } = require('../../config/redis');

        expect(redisConnection.password).toBeUndefined();
    });
});
