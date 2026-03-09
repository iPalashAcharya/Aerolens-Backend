const crypto = require('crypto');
const AppError = require('../utils/appError');
const { initBatchState } = require('../config/resumeBulkRedisState');

class ResumeBulkUploadService {
    constructor() {}

    /**
     * 1. Init Redis batch state FIRST
     * 2. Enqueue BullMQ job with batchId + base64 ZIP
     * 3. Return batchId to controller immediately
     */
    async uploadZipAndStartBatch(zipBuffer, queue) {
        try {
            if (!zipBuffer) {
                throw new AppError('ZIP file is required', 400, 'MISSING_ZIP_FILE');
            }

            if (!queue) {
                throw new AppError(
                    'Queue instance missing',
                    500,
                    'QUEUE_NOT_INITIALIZED'
                );
            }

            const batchId = crypto.randomUUID();

            // Redis state MUST exist before worker starts reading it
            await initBatchState(batchId);

            // Convert buffer to base64 for BullMQ job payload
            const zipBase64 = zipBuffer.toString('base64');

            await queue.add(
                'resume-bulk-job',
                { batchId, zipBuffer: zipBase64 },
                {
                    attempts: 2,
                    backoff: { type: 'exponential', delay: 3000 },
                    removeOnComplete: true,
                    removeOnFail: false
                }
            );

            return { batchId };
        } catch (error) {
            console.error('[ResumeBulkUploadService] uploadZipAndStartBatch error:', error);
            if (error instanceof AppError) throw error;
            throw new AppError(
                error.message, // 👈 show real error temporarily
                500,
                'BULK_UPLOAD_ENQUEUE_FAILED'
            );
        }
    }
}

module.exports = new ResumeBulkUploadService();