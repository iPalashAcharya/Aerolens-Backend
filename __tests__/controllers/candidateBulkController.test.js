jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
}));

const CandidateBulkController = require('../../controllers/candidateBulkController');
const AppError = require('../../utils/appError');

/** catchAsync does not return the inner Promise; wait for async work before assertions */
async function runCatchAsync(handler, req, res, next) {
    handler(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));
}

describe('CandidateBulkController', () => {
    let bulkService;
    let auditLog;
    let controller;
    let req;
    let res;
    let next;

    beforeEach(() => {
        bulkService = {
            processBulkUpload: jest.fn(),
            generateTemplate: jest.fn(),
            processBulkVendorPatch: jest.fn(),
        };
        auditLog = {
            logAction: jest.fn().mockResolvedValue(undefined),
        };
        controller = new CandidateBulkController(bulkService, {}, auditLog);
        req = {
            file: {
                originalname: 'rows.csv',
                path: '/tmp/x.csv',
                size: 100,
                mimetype: 'text/csv',
            },
            user: { userId: 1 },
            ip: '127.0.0.1',
            get: jest.fn().mockReturnValue('jest-agent'),
            auditContext: { userId: 1 },
        };
        res = {
            status: jest.fn(),
            json: jest.fn(),
            setHeader: jest.fn(),
            send: jest.fn(),
        };
        res.status.mockImplementation(() => res);
        res.json.mockImplementation(() => res);
        next = jest.fn();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('uploadBulk forwards AppError when no file', async () => {
        await runCatchAsync(controller.uploadBulk, { ...req, file: undefined }, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('uploadBulk returns 201 when all rows succeed', async () => {
        bulkService.processBulkUpload.mockResolvedValue({
            summary: { inserted: 3, failed: 0, totalRows: 3, skipped: 0, processingTime: '1s' },
            failedRows: [],
            hasMoreErrors: false,
        });

        await runCatchAsync(controller.uploadBulk, req, res, next);

        expect(bulkService.processBulkUpload).toHaveBeenCalled();
        expect(auditLog.logAction).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('uploadBulk returns 400 when nothing inserted', async () => {
        bulkService.processBulkUpload.mockResolvedValue({
            summary: { inserted: 0, failed: 5, totalRows: 5, skipped: 0, processingTime: '1s' },
            failedRows: [],
            hasMoreErrors: false,
        });

        await runCatchAsync(controller.uploadBulk, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('uploadBulk returns 207 on partial success', async () => {
        bulkService.processBulkUpload.mockResolvedValue({
            summary: { inserted: 2, failed: 1, totalRows: 3, skipped: 0, processingTime: '1s' },
            failedRows: [],
            hasMoreErrors: false,
        });

        await runCatchAsync(controller.uploadBulk, req, res, next);

        expect(res.status).toHaveBeenCalledWith(207);
    });

    it('uploadBulk continues when audit logging fails', async () => {
        auditLog.logAction.mockRejectedValueOnce(new Error('audit'));
        bulkService.processBulkUpload.mockResolvedValue({
            summary: { inserted: 1, failed: 0, totalRows: 1, skipped: 0, processingTime: '1s' },
            failedRows: [],
            hasMoreErrors: false,
        });

        await runCatchAsync(controller.uploadBulk, req, res, next);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('downloadTemplate sends CSV', async () => {
        bulkService.generateTemplate.mockResolvedValue({
            headers: ['candidate_name', 'email'],
            sampleData: [{ candidate_name: 'A', email: 'a@b.com' }],
        });

        await runCatchAsync(controller.downloadTemplate, req, res, next);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
        expect(res.send).toHaveBeenCalled();
    });

    it('validateBulk requires file', async () => {
        await runCatchAsync(controller.validateBulk, { ...req, file: undefined }, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('validateBulk returns placeholder payload', async () => {
        await runCatchAsync(controller.validateBulk, req, res, next);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('getUploadHistory returns empty history', async () => {
        await runCatchAsync(controller.getUploadHistory, req, res, next);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('patchVendors requires file', async () => {
        await runCatchAsync(controller.patchVendors, { ...req, file: undefined }, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('patchVendors returns success summary', async () => {
        bulkService.processBulkVendorPatch.mockResolvedValue({
            summary: { patched: 2, failed: 0, total: 2, skipped: 0 },
            failedRows: [],
        });

        await runCatchAsync(controller.patchVendors, req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});
