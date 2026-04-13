function createMockRedis() {
    const store = new Map();

    const chain = {
        set: jest.fn(function set() {
            return chain;
        }),
        exec: jest.fn(),
    };

    const redis = {
        set: jest.fn(async (key, val, ...args) => {
            store.set(key, val);
            return 'OK';
        }),
        get: jest.fn(async (key) => store.get(key) ?? null),
        del: jest.fn(async (key) => {
            const had = store.has(key);
            store.delete(key);
            return had ? 1 : 0;
        }),
        watch: jest.fn().mockResolvedValue('OK'),
        unwatch: jest.fn().mockResolvedValue('OK'),
        multi: jest.fn(() => chain),
    };

    chain.set.mockImplementation(() => chain);
    chain.exec.mockResolvedValue([[null, 'OK']]);

    return { redis, store, chain };
}

let mockRedisImpl;

jest.mock('ioredis', () =>
    jest.fn().mockImplementation(() => mockRedisImpl)
);

describe('resumeBulkRedisState', () => {
    beforeEach(() => {
        jest.resetModules();
        const m = createMockRedis();
        mockRedisImpl = m.redis;
        process.env.REDIS_HOST = 'localhost';
        process.env.REDIS_PORT = '6379';
    });

    it('initBatchState writes JSON with TTL', async () => {
        const { initBatchState } = require('../../config/resumeBulkRedisState');

        const state = await initBatchState('b1');

        expect(state.status).toBe('PENDING');
        expect(state.totalFiles).toBe(0);
    });

    it('getBatchState parses stored JSON', async () => {
        const mod = require('../../config/resumeBulkRedisState');
        await mod.initBatchState('b2');

        const read = await mod.getBatchState('b2');

        expect(read.status).toBe('PENDING');
    });

    it('updateBatchState returns null when key missing', async () => {
        const { updateBatchState } = require('../../config/resumeBulkRedisState');

        const out = await updateBatchState('missing', { status: 'DONE' });

        expect(out).toBeNull();
    });

    it('updateBatchState merges fields when key exists', async () => {
        const { initBatchState, updateBatchState } = require('../../config/resumeBulkRedisState');
        await initBatchState('b3');

        const updated = await updateBatchState('b3', { status: 'PROCESSING', totalFiles: 5 });

        expect(updated.status).toBe('PROCESSING');
        expect(updated.totalFiles).toBe(5);
    });

    it('incrementBatchCounters applies deltas', async () => {
        const { initBatchState, incrementBatchCounters } = require('../../config/resumeBulkRedisState');
        await initBatchState('b4');

        const updated = await incrementBatchCounters('b4', { processed: 1, linked: 1 });

        expect(updated.processed).toBe(1);
        expect(updated.linked).toBe(1);
    });

    it('deleteBatchState removes key', async () => {
        const mod = require('../../config/resumeBulkRedisState');
        await mod.initBatchState('b5');

        await mod.deleteBatchState('b5');

        expect(await mod.getBatchState('b5')).toBeNull();
    });
});
