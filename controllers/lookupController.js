const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class LookupController {
    constructor(lookupService) {
        this.lookupService = lookupService;
    }

    getAll = catchAsync(async (req, res) => {
        try {
            const options = {
                limit: parseInt(req.query.limit) || 10,
                page: parseInt(req.query.page) || 1
            };
            const result = await this.lookupService.getAll(options);

            return ApiResponse.success(
                res,
                result.data,
                'Lookup entries retrieved successfully',
                200,
                result.pagination
            );
        } catch (error) {
            return ApiResponse.error(res, error)
        }
    });

    getByKey = catchAsync(async (req, res) => {
        const lookup = await this.lookupService.getByKey(parseInt(req.params.lookupKey));
        return ApiResponse.success(
            res,
            lookup,
            'Lookup entry retrieved successfully'
        );
    })

    createLookup = catchAsync(async (req, res) => {
        const lookup = await this.lookupService.createLookup(req.body);

        return ApiResponse.success(
            res,
            lookup,
            'lookup created successfully',
            201
        );
    });

    deleteLookup = catchAsync(async (req, res) => {
        await this.lookupService.deleteLookup(parseInt(req.params.lookupKey));

        return ApiResponse.success(
            res,
            null,
            'Lookup entry deleted successfully'
        );
    });
}

module.exports = LookupController;