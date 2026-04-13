jest.mock('@aws-sdk/client-s3', () => ({
    GetObjectCommand: class GetObjectCommand {
        constructor(input) {
            this.input = input;
        }
    },
}));

const CandidateController = require('../../controllers/candidateController');

/** catchAsync handlers do not return a promise; flush the microtask queue before asserting. */
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('CandidateController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            createCandidate: jest.fn(),
            renameS3File: jest.fn(),
            updateCandidateResumeInfo: jest.fn(),
            deleteFromS3: jest.fn(),
            getCandidateById: jest.fn(),
            getFormData: jest.fn(),
            getAllCandidates: jest.fn(),
            getResumeInfo: jest.fn(),
            updateCandidate: jest.fn(),
            deleteCandidate: jest.fn(),
            deleteResume: jest.fn(),
            uploadResume: jest.fn(),
            downloadResume: jest.fn(),
            s3Client: { send: jest.fn() },
            bucketName: 'test-bucket',
        };
        controller = new CandidateController(mockService);
        req = { params: {}, query: {}, body: {}, auditContext: {}, file: null };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
        };
    });

    it('getMimeType maps known extensions', () => {
        expect(controller.getMimeType('a.pdf')).toBe('application/pdf');
        expect(controller.getMimeType('b.docx')).toContain('wordprocessingml');
        expect(controller.getMimeType('unknown.bin')).toBe('application/octet-stream');
    });

    it('supportsInlinePreview is true for pdf only', () => {
        expect(controller.supportsInlinePreview('x.pdf')).toBe(true);
        expect(controller.supportsInlinePreview('x.doc')).toBe(false);
    });

    it('sanitizeFilename strips quotes and newlines', () => {
        expect(controller.sanitizeFilename('a"b\\\r\n')).toBe('ab');
    });

    it('getCandidate loads by id', async () => {
        req.params.id = '5';
        mockService.getCandidateById.mockResolvedValue({ id: 5 });

        controller.getCandidate(req, res);
        await flushAsync();

        expect(mockService.getCandidateById).toHaveBeenCalledWith(5);
    });

    it('getCreateData returns form sections', async () => {
        mockService.getFormData.mockResolvedValue({
            recruiters: [],
            vendors: [],
            locations: [],
            jobProfiles: [],
            currencies: [],
            compensationTypes: [],
            workModes: [],
        });

        controller.getCreateData(req, res);
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toHaveProperty('jobProfiles');
    });

    it('getAllCandidates parses page and limit', async () => {
        req.query = { page: '2', limit: '20' };
        mockService.getAllCandidates.mockResolvedValue([]);

        controller.getAllCandidates(req, res);
        await flushAsync();

        expect(mockService.getAllCandidates).toHaveBeenCalled();
    });

    it('deleteCandidate deletes resume when present then candidate', async () => {
        req.params.id = '3';
        mockService.getResumeInfo.mockResolvedValue({ hasResume: true, s3Key: 'k' });
        mockService.deleteResume.mockResolvedValue(undefined);
        mockService.deleteCandidate.mockResolvedValue(undefined);

        controller.deleteCandidate(req, res);
        await flushAsync();

        expect(mockService.deleteResume).toHaveBeenCalledWith(3);
        expect(mockService.deleteCandidate).toHaveBeenCalledWith(3, req.auditContext);
    });

    it('getResumeInfo enriches when originalName present', async () => {
        req.params.id = '1';
        mockService.getResumeInfo.mockResolvedValue({
            hasResume: true,
            originalName: 'cv.pdf',
        });

        controller.getResumeInfo(req, res);
        await flushAsync();

        const payload = res.json.mock.calls[0][0].data;
        expect(payload.mimeType).toBe('application/pdf');
        expect(payload.supportsPreview).toBe(true);
    });

    it('deleteResume delegates to service', async () => {
        req.params.id = '2';
        mockService.deleteResume.mockResolvedValue({ ok: true });

        controller.deleteResume(req, res);
        await flushAsync();

        expect(mockService.deleteResume).toHaveBeenCalledWith(2);
    });

    it('uploadResume requires file', async () => {
        req.params.id = '1';
        const next = jest.fn();

        controller.uploadResume(req, res, next);
        await flushAsync();

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('uploadResume uploads when file present', async () => {
        req.params.id = '4';
        req.file = { originalname: 'r.pdf' };
        mockService.getResumeInfo.mockResolvedValue({ hasResume: false });
        mockService.uploadResume.mockResolvedValue({ uploaded: true });

        controller.uploadResume(req, res);
        await flushAsync();

        expect(mockService.uploadResume).toHaveBeenCalledWith(4, req.file);
    });

    it('downloadResume streams with pipe when Body.pipe exists', async () => {
        req.params.id = '1';
        const pipe = jest.fn();
        mockService.downloadResume.mockResolvedValue({
            s3Key: 'key',
            originalName: 'doc.pdf',
        });
        mockService.s3Client.send.mockImplementation(() =>
            Promise.resolve({
                Body: { pipe },
                ContentLength: 100,
            })
        );

        controller.downloadResume(req, res);
        await flushAsync();

        expect(mockService.s3Client.send).toHaveBeenCalled();
        expect(pipe).toHaveBeenCalledWith(res);
    });

    it('previewResume rejects non-pdf', async () => {
        req.params.id = '1';
        mockService.downloadResume.mockResolvedValue({
            s3Key: 'k',
            originalName: 'x.docx',
        });
        const next = jest.fn();

        controller.previewResume(req, res, next);
        await flushAsync();

        expect(next).toHaveBeenCalled();
        expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('previewResume streams pdf via async iteration when no pipe', async () => {
        req.params.id = '1';
        mockService.downloadResume.mockResolvedValue({
            s3Key: 'k',
            originalName: 'x.pdf',
        });
        async function* body() {
            yield Buffer.from('x');
        }
        mockService.s3Client.send.mockImplementation(() =>
            Promise.resolve({
                Body: body(),
                ContentLength: 1,
            })
        );

        controller.previewResume(req, res);
        await flushAsync();

        expect(res.write).toHaveBeenCalled();
        expect(res.end).toHaveBeenCalled();
    });
});
