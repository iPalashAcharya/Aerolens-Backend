require('dotenv').config();
const { initBatchState, getBatchState } = require('./config/resumeBulkRedisState');

async function test() {
    const batchId = 'test-123';
    await initBatchState(batchId);
    const state = await getBatchState(batchId);
    console.log('State:', state);
    process.exit(0);
}

test().catch(console.error);