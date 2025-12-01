const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class LocationController {
    constructor(locationService) {
        this.locationService = locationService;
    }

    getAll = catchAsync(async (req, res) => {
        try {
            /*const options = {
                limit: parseInt(req.query.limit) || 10,
                page: parseInt(req.query.page) || 1
            };*/
            const result = await this.locationService.getLocation();

            return ApiResponse.success(
                res,
                result,
                'All Locations retrieved successfully',
                200,
                //result.pagination
            );
        } catch (error) {
            return ApiResponse.error(res, error)
        }
    });

    getById = catchAsync(async (req, res) => {
        const location = await this.locationService.getLocationById(parseInt(req.params.locationId));
        return ApiResponse.success(
            res,
            location,
            'Location entry retrieved successfully'
        );
    });

    createLocation = catchAsync(async (req, res) => {
        const location = await this.locationService.createLocation(req.body, req.auditContext);

        return ApiResponse.success(
            res,
            location,
            'location created successfully',
            201
        );
    });

    updateLocation = catchAsync(async (req, res) => {
        const location = await this.locationService.updateLocation(
            parseInt(req.params.locationId),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            location,
            'location entry updated successfully'
        );
    });

    deleteLocation = catchAsync(async (req, res) => {
        await this.locationService.deleteLocation(parseInt(req.params.locationId), req.auditContext);

        return ApiResponse.success(
            res,
            null,
            'Location deleted successfully'
        );
    });
}

module.exports = LocationController;