jest.mock('@aws-sdk/client-s3', () => ({
    GetObjectCommand: class GetObjectCommand {
        constructor(input) {
            this.input = input;
        }
    },
}));

const JobProfileController = require('../../controllers/jobProfileController');

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('JobProfileController', () => {
    let controller;
    let mockService;
    let req;
    let res;

    beforeEach(() => {
        mockService = {
            getJDInfo: jest.fn(),
            deleteFromS3: jest.fn(),
            uploadJD: jest.fn(),
            downloadJD: jest.fn(),
            deleteJD: jest.fn(),
            createJobProfile: jest.fn(),
            renameS3File: jest.fn(),
            updateJobProfileJDInfo: jest.fn(),
            getJobProfileById: jest.fn(),
            getAllJobProfiles: jest.fn(),
            updateJobProfile: jest.fn(),
            deleteJobProfile: jest.fn(),
            getAllJobProfilesWithPagination: jest.fn(),
            s3Client: { send: jest.fn() },
            bucketName: 'b',
        };
        controller = new JobProfileController(mockService);
        req = { params: {}, query: {}, body: {}, auditContext: {}, file: null };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
        };
    });

    it('helpers: mime, preview, sanitize', () => {
        expect(controller.getMimeType('j.pdf')).toBe('application/pdf');
        expect(controller.supportsInlinePreview('j.pdf')).toBe(true);
        expect(controller.sanitizeFilename('a"b')).toBe('ab');
    });

    it('getJDInfo augments when JD present', async () => {
        req.params.id = '1';
        mockService.getJDInfo.mockResolvedValue({
            hasJD: true,
            originalName: 'jd.pdf',
        });

        controller.getJDInfo(req, res);
        await flushAsync();

        const data = res.json.mock.calls[0][0].data;
        expect(data.supportsPreview).toBe(true);
        expect(data.mimeType).toBe('application/pdf');
    });

    it('deleteJD delegates', async () => {
        req.params.id = '2';
        mockService.deleteJD.mockResolvedValue({ ok: 1 });

        controller.deleteJD(req, res);
        await flushAsync();

        expect(mockService.deleteJD).toHaveBeenCalledWith(2);
    });

    it('getJobProfile returns transformed profile', async () => {
        req.params.id = '3';
        mockService.getJobProfileById.mockResolvedValue({
            jobProfileId: 3,
            jobRole: 'Dev',
        });

        controller.getJobProfile(req, res);
        await flushAsync();

        expect(res.json.mock.calls[0][0].data).toHaveProperty('position', 'Dev');
    });

    it('getAllJobProfile lists', async () => {
        mockService.getAllJobProfiles.mockResolvedValue([]);

        controller.getAllJobProfile(req, res);
        await flushAsync();

        expect(mockService.getAllJobProfiles).toHaveBeenCalled();
    });

    it('getAllJobProfilesWithPagination', async () => {
        req.query = { page: '2', pageSize: '5' };
        mockService.getAllJobProfilesWithPagination.mockResolvedValue({
            jobProfiles: [{ jobProfileId: 1, jobRole: 'R' }],
            pagination: { page: 2 },
        });

        controller.getAllJobProfilesWithPagination(req, res);
        await flushAsync();

        expect(mockService.getAllJobProfilesWithPagination).toHaveBeenCalledWith(2, 5);
    });

    it('deleteJobProfile removes JD when present', async () => {
        req.params.id = '9';
        mockService.getJDInfo.mockResolvedValue({ hasJD: true, s3Key: 'k' });
        mockService.deleteJD.mockResolvedValue(undefined);
        mockService.deleteJobProfile.mockResolvedValue(undefined);

        controller.deleteJobProfile(req, res);
        await flushAsync();

        expect(mockService.deleteJD).toHaveBeenCalledWith(9);
        expect(mockService.deleteJobProfile).toHaveBeenCalledWith(9, req.auditContext);
    });

    it('createJobProfile without file returns transformed profile', async () => {
        req.body = { clientId: 1 };
        mockService.createJobProfile.mockResolvedValue({ jobProfileId: 10, jobRole: 'X' });

        controller.createJobProfile(req, res, jest.fn());
        await flushAsync();

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0].data).toHaveProperty('position', 'X');
    });

    it('uploadJD requires file', async () => {
        req.params.id = '1';
        const next = jest.fn();

        controller.uploadJD(req, res, next);
        await flushAsync();

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('downloadJD pipes Body when pipe exists', async () => {
        req.params.id = '1';
        const pipe = jest.fn();
        mockService.downloadJD.mockResolvedValue({ s3Key: 'k', originalName: 'f.pdf' });
        mockService.s3Client.send.mockImplementation(() =>
            Promise.resolve({
                Body: { pipe },
                ContentLength: 5,
            })
        );

        controller.downloadJD(req, res);
        await flushAsync();

        expect(pipe).toHaveBeenCalledWith(res);
    });

    it('previewJD rejects non-pdf', async () => {
        req.params.id = '1';
        mockService.downloadJD.mockResolvedValue({ s3Key: 'k', originalName: 'x.docx' });
        const next = jest.fn();

        controller.previewJD(req, res, next);
        await flushAsync();

        expect(next).toHaveBeenCalled();
        expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
});
