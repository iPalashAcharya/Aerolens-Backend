const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class JobProfileController {
    constructor(candidateService) {
        this.candidateService = candidateService;
    }

    createCandidate = catchAsync(async (req, res) => {
        const candidate = await this.candidateService.createCandidate(req.body);

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
}

module.exports = JobProfileController;