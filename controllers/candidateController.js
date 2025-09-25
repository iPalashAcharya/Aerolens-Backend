const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class CandidateController {
    constructor(candidateService) {
        this.candidateService = candidateService;
    }

    createCandidate = catchAsync(async (req, res) => {
        const candidateData = req.body;
        let resumeInfo = {};
        if (req.file) {
            resumeInfo = {
                resumeFilename: req.file.filename,
                resumeOriginalName: req.file.originalname,
                resumeUploadDate: new Date()
            };
        }
        const combined = { ...candidateData, ...resumeInfo };
        const candidate = await this.candidateService.createCandidate(combined);

        return ApiResponse.success(
            res,
            candidate,
            'Candidate created successfully',
            201
        );
    });

    getCandidate = catchAsync(async (req, res) => {
        const candidate = await this.candidateService.getCandidateById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            candidate,
            'Candidate retrieved successfully'
        );
    });

    getAllCandidates = catchAsync(async (req, res) => {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 10));

        const candidates = await this.candidateService.getAllCandidatesWithPagination(page, pageSize);

        return ApiResponse.success(
            res,
            candidates,
            'Candidates retrieved successfully'
        );
    });

    updateCandidate = catchAsync(async (req, res) => {
        const updatedCandidate = await this.candidateService.updateCandidate(
            parseInt(req.params.id),
            req.body
        );

        return ApiResponse.success(
            res,
            updatedCandidate,
            'Candidate updated successfully'
        );
    });

    deleteCandidate = catchAsync(async (req, res) => {
        await this.candidateService.deleteCandidate(parseInt(req.params.id));

        return ApiResponse.success(
            res,
            null,
            'Candidate deleted successfully'
        );
    });

    uploadResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        if (!req.file) {
            throw new AppError('No resume file uploaded', 400, 'NO_FILE_UPLOADED');
        }

        const result = await this.candidateService.uploadResume(candidateId, req.file);

        return ApiResponse.success(
            res,
            result,
            'Resume uploaded successfully',
            200
        );
    });

    downloadResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeData = await this.candidateService.downloadResume(candidateId);

        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${resumeData.originalName}"`);

        // Send file
        res.sendFile(resumeData.filePath);
    });

    previewResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeData = await this.candidateService.downloadResume(candidateId);

        // Set headers for PDF preview (inline display)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');

        // Send file for preview
        res.sendFile(resumeData.filePath);
    });

    deleteResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const result = await this.candidateService.deleteResume(candidateId);

        return ApiResponse.success(
            res,
            result,
            'Resume deleted successfully',
            200
        );
    });

    getResumeInfo = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeInfo = await this.candidateService.getResumeInfo(candidateId);

        return ApiResponse.success(
            res,
            resumeInfo,
            'Resume information retrieved successfully',
            200
        );
    });
}

module.exports = CandidateController;