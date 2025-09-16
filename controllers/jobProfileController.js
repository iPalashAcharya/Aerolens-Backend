const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class JobProfileController {
    constructor(jobProfileService) {
        this.jobProfileService = jobProfileService;
    }

    createJobProfile = catchAsync(async (req, res) => {
        const jobProfile = await this.jobProfileService.createJobProfile(req.body);

        return ApiResponse.success(
            res,
            jobProfile,
            'Job Profile created successfully',
            201
        );
    });

    getJobProfile = catchAsync(async (req, res) => {
        const jobProfile = await this.jobProfileService.getJobProfileById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            jobProfile,
            'Job Profile retrieved successfully'
        );
    });

    getAllJobProfile = catchAsync(async (req, res) => {
        const jobProfiles = await this.jobProfileService.getAllJobProfiles();
        return ApiResponse.success(
            res,
            jobProfiles,
            'Job Profiles retrieved successfully'
        );
    });

    updateJobProfile = catchAsync(async (req, res) => {
        const updatedjobProfile = await this.jobProfileService.updateJobProfile(
            parseInt(req.params.id),
            req.body
        );

        return ApiResponse.success(
            res,
            updatedjobProfile,
            'Job profile updated successfully'
        );
    });

    deleteJobProfile = catchAsync(async (req, res) => {
        await this.jobProfileService.deleteJobProfile(parseInt(req.params.id));

        return ApiResponse.success(
            res,
            null,
            'Job Profile deleted successfully'
        );
    });
}

module.exports = JobProfileController;