const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class InterviewController {
    constructor(interviewService) {
        this.interviewService = interviewService;
    }

    getAll = catchAsync(async (req, res) => {
        try {
            /*const options = {
                limit: parseInt(req.query.limit) || 10,
                page: parseInt(req.query.page) || 1
            };*/
            const result = await this.interviewService.getAll();

            return ApiResponse.success(
                res,
                result.data,
                'Interview entries retrieved successfully',
                200,
                //result.pagination
            );
        } catch (error) {
            return ApiResponse.error(res, error)
        }
    });

    getById = catchAsync(async (req, res) => {
        const interview = await this.interviewService.getInterviewById(parseInt(req.params.interviewId));
        return ApiResponse.success(
            res,
            interview,
            'Interview entry retrieved successfully'
        );
    });

    getInterviewRounds = catchAsync(async (req, res) => {
        const rounds = await this.interviewService.getInterviewRounds(parseInt(req.params.interviewId));

        return ApiResponse.success(
            res,
            rounds,
            'Interview Rounds retrieved successfully'
        );
    });

    createInterview = catchAsync(async (req, res) => {
        const interview = await this.interviewService.createInterview(req.body, req.auditContext);

        return ApiResponse.success(
            res,
            interview,
            'interview created successfully',
            201
        );
    });

    updateInterview = catchAsync(async (req, res) => {
        const interview = await this.interviewService.updateInterview(
            parseInt(req.params.interviewId),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            interview,
            'Interview entry updated successfully'
        );
    });

    updateInterviewRounds = catchAsync(async (req, res) => {
        const isUpdated = await this.interviewService.updateInterviewRounds(
            parseInt(req.params.interviewId),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            isUpdated,
            'Interview Round Added Successfully'
        );
    });

    finalizeInterview = catchAsync(async (req, res) => {
        const result = await this.interviewService.finalizeInterview(
            parseInt(req.params.interviewId),
            req.body,
            req.auditContext
        );
        return ApiResponse.success(
            res,
            result,
            'Interview finalized successfully'
        );
    });

    deleteInterview = catchAsync(async (req, res) => {
        await this.interviewService.deleteInterview(parseInt(req.params.interviewId), req.auditContext);

        return ApiResponse.success(
            res,
            null,
            'Interview entry deleted successfully'
        );
    });
}

module.exports = InterviewController;