const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');

class JobProfileRequirementController {
    constructor(jobProfileRequirementService) {
        this.jobProfileRequirementService = jobProfileRequirementService;
    }

    createJobProfileRequirement = catchAsync(async (req, res, next) => {
        const jobProfileRequirementData = req.body;

        const jobProfileRequirement = await this.jobProfileRequirementService.createJobProfileRequirement(
            jobProfileRequirementData,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            jobProfileRequirement,
            "Job Profile Requirement created successfully",
            201
        );
    });

    getJobProfileRequirement = catchAsync(async (req, res) => {
        const jobProfileRequirement = await this.jobProfileRequirementService.getJobProfileRequirementById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            jobProfileRequirement,
            'Job Profile Requirement retrieved successfully'
        );
    });

    getAllJobProfileRequirements = catchAsync(async (req, res) => {
        const jobProfileRequirements = await this.jobProfileRequirementService.getAllJobProfileRequirements();

        return ApiResponse.success(
            res,
            jobProfileRequirements,
            'Job Profile Requirements retrieved successfully'
        );
    });

    getJobProfileRequirementsByClient = catchAsync(async (req, res) => {
        const clientId = parseInt(req.params.clientId);
        const { limit, offset } = req.query;

        const options = {};
        if (limit) options.limit = parseInt(limit);
        if (offset) options.offset = parseInt(offset);

        const jobProfileRequirements = await this.jobProfileRequirementService.getJobProfileRequirementsByClientId(
            clientId,
            options
        );

        return ApiResponse.success(
            res,
            jobProfileRequirements,
            'Job Profile Requirements retrieved successfully'
        );
    });

    getJobProfileRequirementsByJobProfile = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.jobProfileId);

        const jobProfileRequirements = await this.jobProfileRequirementService.getJobProfileRequirementsByJobProfileId(
            jobProfileId
        );

        return ApiResponse.success(
            res,
            jobProfileRequirements,
            'Job Profile Requirements retrieved successfully'
        );
    });

    getJobProfileRequirementsByStatus = catchAsync(async (req, res) => {
        const statusId = parseInt(req.params.statusId);

        const jobProfileRequirements = await this.jobProfileRequirementService.getJobProfileRequirementsByStatus(
            statusId
        );

        return ApiResponse.success(
            res,
            jobProfileRequirements,
            'Job Profile Requirements retrieved successfully'
        );
    });

    getJobProfileRequirementsByDepartment = catchAsync(async (req, res) => {
        const departmentId = parseInt(req.params.departmentId);

        const jobProfileRequirements = await this.jobProfileRequirementService.getJobProfileRequirementsByDepartment(
            departmentId
        );

        return ApiResponse.success(
            res,
            jobProfileRequirements,
            'Job Profile Requirements retrieved successfully'
        );
    });

    searchJobProfileRequirements = catchAsync(async (req, res) => {
        const searchCriteria = req.validatedSearch;

        const jobProfileRequirements = await this.jobProfileRequirementService.searchJobProfileRequirements(
            searchCriteria
        );

        return ApiResponse.success(
            res,
            jobProfileRequirements,
            'Job Profile Requirements search completed successfully',
            200,
            {
                totalResults: jobProfileRequirements.length,
                searchCriteria
            }
        );
    });

    getJobProfileRequirementsByClientWithPagination = catchAsync(async (req, res) => {
        const clientId = parseInt(req.params.clientId);
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        const result = await this.jobProfileRequirementService.getJobProfileRequirementsByClientWithPagination(
            clientId,
            page,
            pageSize
        );

        return ApiResponse.success(
            res,
            result.jobProfileRequirements,
            'Job Profile Requirements retrieved successfully',
            200,
            { pagination: result.pagination }
        );
    });

    getAllJobProfileRequirementsWithPagination = catchAsync(async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        const result = await this.jobProfileRequirementService.getAllJobProfileRequirementsWithPagination(
            page,
            pageSize
        );

        return ApiResponse.success(
            res,
            result.jobProfileRequirements,
            'Job Profile Requirements retrieved successfully',
            200,
            { pagination: result.pagination }
        );
    });

    getJobProfileRequirementCount = catchAsync(async (req, res) => {
        const clientId = parseInt(req.params.clientId);

        const count = await this.jobProfileRequirementService.getJobProfileRequirementCount(clientId);

        return ApiResponse.success(
            res,
            { count },
            'Job Profile Requirement count retrieved successfully'
        );
    });

    updateJobProfileRequirement = catchAsync(async (req, res) => {
        const jobProfileRequirementId = parseInt(req.params.id);

        const updatedJobProfileRequirement = await this.jobProfileRequirementService.updateJobProfileRequirement(
            jobProfileRequirementId,
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            updatedJobProfileRequirement,
            'Job Profile Requirement updated successfully'
        );
    });

    bulkUpdateJobProfileRequirements = catchAsync(async (req, res) => {
        const { jobProfileRequirementIds, updateData } = req.body;

        if (!jobProfileRequirementIds || !Array.isArray(jobProfileRequirementIds) || jobProfileRequirementIds.length === 0) {
            throw new AppError(
                'jobProfileRequirementIds array is required',
                400,
                'INVALID_REQUEST'
            );
        }

        if (!updateData || Object.keys(updateData).length === 0) {
            throw new AppError(
                'updateData is required',
                400,
                'INVALID_REQUEST'
            );
        }

        const result = await this.jobProfileRequirementService.bulkUpdateJobProfileRequirements(
            jobProfileRequirementIds,
            updateData,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            result,
            'Bulk update completed',
            200
        );
    });

    deleteJobProfileRequirement = catchAsync(async (req, res) => {
        await this.jobProfileRequirementService.deleteJobProfileRequirement(
            parseInt(req.params.id),
            req.auditContext
        );

        return ApiResponse.success(
            res,
            null,
            'Job Profile Requirement deleted successfully'
        );
    });
}

module.exports = JobProfileRequirementController;