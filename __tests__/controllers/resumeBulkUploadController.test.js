jest.mock('../../config/resumeBulkRedisState', () => ({
    getBatchState: jest.fn(),
}));

const resumeBulkUploadService = require('../../services/resumeBulkUploadService');
const { getBatchState } = require('../../config/resumeBulkRedisState');
const ResumeBulkUploadController = require('../../controllers/resumeBulkUploadController');
const AppError = require('../../utils/appError');

describe('ResumeBulkUploadController', () => {
    let controller;
    let queue;
    let uploadSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        queue = { add: jest.fn() };
        controller = new ResumeBulkUploadController(queue);
        uploadSpy = jest.spyOn(resumeBulkUploadService, 'uploadZipAndStartBatch').mockResolvedValue({ batchId: 'b1' });
    });

    afterEach(() => {
        uploadSpy.mockRestore();
    });

    it('uploadZip rejects when file missing', async () => {
        const req = { file: null };
        const res = {};
        const next = jest.fn();

        await controller.uploadZip(req, res, next);

        expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
        expect(next.mock.calls[0][0].errorCode).toBe('MISSING_ZIP_FILE');
    });

    it('uploadZip returns batchId', async () => {
        const req = { file: { buffer: Buffer.from('z') } };
        const json = jest.fn();
        const res = { status: jest.fn().mockReturnValue({ json }) };
        const next = jest.fn();

        await controller.uploadZip(req, res, next);

        expect(uploadSpy).toHaveBeenCalledWith(req.file.buffer, queue);
        expect(json).toHaveBeenCalledWith({ status: 'success', batchId: 'b1' });
    });

    it('getBatchStatus 404 when state missing', async () => {
        getBatchState.mockResolvedValue(null);
        const req = { params: { batchId: 'x' } };
        const next = jest.fn();

        await controller.getBatchStatus(req, {}, next);

        expect(next.mock.calls[0][0].errorCode).toBe('BATCH_NOT_FOUND');
    });
});
