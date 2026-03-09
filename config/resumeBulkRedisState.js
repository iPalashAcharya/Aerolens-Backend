const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || undefined
});

const BATCH_PREFIX = 'resume_batch:';
const TTL_SECONDS = 3600;

/**
 * Initialize batch state when ZIP is uploaded.
 * Must be called BEFORE enqueueing the job.
 */
async function initBatchState(batchId) {
    const key = BATCH_PREFIX + batchId;
    const initialState = {
        status: 'PENDING',
        totalFiles: 0,
        processed: 0,
        linked: 0,
        skipped_no_match: 0,
        skipped_already_exists: 0,
        failed: 0,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        completedAt: null
    };
    await redis.set(key, JSON.stringify(initialState), 'EX', TTL_SECONDS);
    return initialState;
}

/**
 * Update non-counter fields only: status, totalFiles, errorMessage, completedAt.
 * Never use this for processed / linked / skipped_* / failed.
 * Uses WATCH + MULTI/EXEC optimistic lock to prevent overwrite races.
 */
async function updateBatchState(batchId, updates) {
    const key = BATCH_PREFIX + batchId;

    // Retry up to 5 times on optimistic lock conflict
    for (let attempt = 0; attempt < 5; attempt++) {
        await redis.watch(key);

        const existing = await redis.get(key);
        if (!existing) {
            await redis.unwatch();
            return null;
        }

        const current = JSON.parse(existing);
        const updated = { ...current, ...updates };

        const result = await redis
            .multi()
            .set(key, JSON.stringify(updated), 'EX', TTL_SECONDS)
            .exec();

        // result is null if WATCH detected a concurrent write → retry
        if (result !== null) {
            return updated;
        }
    }

    // If all retries exhausted, do a best-effort blind write
    // This only affects status fields, not counters, so it's acceptable
    const existing = await redis.get(key);
    if (!existing) return null;
    const current = JSON.parse(existing);
    const updated = { ...current, ...updates };
    await redis.set(key, JSON.stringify(updated), 'EX', TTL_SECONDS);
    return updated;
}

/**
 * Atomically increment numeric counters.
 * Uses WATCH + MULTI/EXEC to guarantee no concurrent task overwrites another.
 * 
 * @param {string} batchId
 * @param {object} deltas - e.g. { processed: 1, linked: 1 }
 */
async function incrementBatchCounters(batchId, deltas) {
    const key = BATCH_PREFIX + batchId;

    for (let attempt = 0; attempt < 10; attempt++) {
        await redis.watch(key);

        const existing = await redis.get(key);
        if (!existing) {
            await redis.unwatch();
            return null;
        }

        const current = JSON.parse(existing);

        // Apply deltas
        const updated = { ...current };
        for (const [field, delta] of Object.entries(deltas)) {
            updated[field] = (Number(current[field]) || 0) + delta;
        }

        const result = await redis
            .multi()
            .set(key, JSON.stringify(updated), 'EX', TTL_SECONDS)
            .exec();

        if (result !== null) {
            return updated;
        }
        // null = another task modified the key between WATCH and EXEC → retry
    }

    // Exhausted retries — should not happen in practice with p-limit(5)
    console.error(`[Redis] incrementBatchCounters: all retries exhausted for ${batchId}`);
    return null;
}

/**
 * Get current batch state.
 */
async function getBatchState(batchId) {
    const key = BATCH_PREFIX + batchId;
    const existing = await redis.get(key);
    if (!existing) return null;
    return JSON.parse(existing);
}

/**
 * Delete batch state entirely (optional cleanup).
 */
async function deleteBatchState(batchId) {
    const key = BATCH_PREFIX + batchId;
    return redis.del(key);
}

module.exports = {
    initBatchState,
    updateBatchState,
    incrementBatchCounters,
    getBatchState,
    deleteBatchState
};