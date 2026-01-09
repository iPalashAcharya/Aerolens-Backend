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

    getInterviewsByCandidateId = catchAsync(async (req, res) => {
        const interviews = await this.interviewService.getInterviewsByCandidateId(
            parseInt(req.params.candidateId)
        );
        return ApiResponse.success(
            res,
            interviews,
            'Candidate interviews retrieved successfully'
        );
    });

    getTotalSummary = catchAsync(async (req, res) => {
        const interviewerData = await this.interviewService.getTotalSummary();
        return ApiResponse.success(
            res,
            interviewerData,
            'Total Interviewer Data Retrieved Successfully'
        );
    });

    getMonthlySummary = catchAsync(async (req, res) => {
        const { startDate, endDate } = req.validatedQuery;
        const summaryData = await this.interviewService.getMonthlySummary(startDate, endDate);
        return ApiResponse.success(
            res,
            summaryData,
            'Total Monthly Summary Data Retrieved Successfully'
        );
    });

    getDailySummary = catchAsync(async (req, res) => {
        const { date } = req.validatedQuery;
        const summaryData = await this.interviewService.getDailySummary(date);
        return ApiResponse.success(
            res,
            summaryData,
            'Total Daily Summary Data Retrieved Sucessfully'
        );
    });

    getInterviewTracker = catchAsync(async (req, res) => {
        const result = await this.interviewService.getInterviewTracker(
            req.validatedQuery
        );

        return ApiResponse.success(
            res,
            result,
            'Interview tracker data retrieved successfully'
        );
    });

    /*getInterviewRounds = catchAsync(async (req, res) => {
        const rounds = await this.interviewService.getInterviewRounds(parseInt(req.params.interviewId));

        return ApiResponse.success(
            res,
            rounds,
            'Interview Rounds retrieved successfully'
        );
    });*/

    getCreateData = catchAsync(async (req, res) => {
        const formData = await this.interviewService.getFormData();
        res.status(200).json({
            success: true,
            message: "Interview Form Data retrieved successfully",
            data: {
                interview: formData.interview,
                interviewers: formData.interviewers,
                recruiters: formData.recruiters,
                candidates: formData.candidates
            }
        });
    });

    getFinalizeData = catchAsync(async (req, res) => {
        const formData = await this.interviewService.getFinalizationFormData(parseInt(req.params.interviewId));
        return ApiResponse.success(
            res,
            formData,
            'Finalize Interview Form Data retrieved successfully'
        );
    });

    createInterview = catchAsync(async (req, res) => {
        const interview = await this.interviewService.createInterview(
            parseInt(req.params.candidateId),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            interview,
            'interview created successfully',
            201
        );
    });

    scheduleNextRound = catchAsync(async (req, res) => {
        const result = await this.interviewService.scheduleNextRound(
            parseInt(req.params.candidateId),
            req.body,
            req.auditContext
        );
        return ApiResponse.success(
            res,
            result.data,
            result.message,
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