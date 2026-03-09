// controllers/resumeBulkUploadController.js

const AppError = require('../utils/appError');
const resumeBulkUploadService = require('../services/resumeBulkUploadService');
const { getBatchState } = require('../config/resumeBulkRedisState');

class ResumeBulkUploadController {
    constructor(queue) {
        this.queue = queue;
    }
    /**
     * POST /candidates/resume-bulk-upload
     * Receives ZIP via multer memory storage
     */
    async uploadZip(req, res, next) {
        try {
            if (!req.file || !req.file.buffer) {
                throw new AppError('ZIP file is required', 400, 'MISSING_ZIP_FILE');
            }

            const { batchId } =
                await resumeBulkUploadService.uploadZipAndStartBatch(
                    req.file.buffer,
                    this.queue
                );

            res.status(200).json({
                status: 'success',
                batchId
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /candidates/resume-bulk-upload/:batchId/status
     */
    async getBatchStatus(req, res, next) {
        try {
            const { batchId } = req.params;

            const state = await getBatchState(batchId);

            if (!state) {
                throw new AppError('Invalid or expired batchId', 404, 'BATCH_NOT_FOUND');
            }

            res.status(200).json({
                status: 'success',
                batchId,
                data: state
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = ResumeBulkUploadController;