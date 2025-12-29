const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class VendorController {
    constructor(vendorService) {
        this.vendorService = vendorService;
    }

    getAll = catchAsync(async (req, res) => {
        const result = await this.vendorService.getAllVendors();
        return ApiResponse.success(res, result, 'Vendor entries retrieved successfully');
    });


    createVendor = catchAsync(async (req, res) => {
        const vendor = await this.vendorService.createVendor(req.body, req.auditContext);

        return ApiResponse.success(
            res,
            vendor,
            'Vendor created successfully',
            201
        );
    });

    getVendor = catchAsync(async (req, res) => {
        const vendor = await this.vendorService.getVendorById(
            parseInt(req.params.vendorId)
        );

        return ApiResponse.success(
            res,
            vendor,
            'Vendor retrieved successfully'
        );
    });

    updateVendor = catchAsync(async (req, res) => {
        const updatedVendor = await this.vendorService.updateVendor(
            parseInt(req.params.vendorId),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            updatedVendor,
            'Vendor updated successfully'
        );
    });

    deleteVendor = catchAsync(async (req, res) => {
        await this.vendorService.deleteVendor(parseInt(req.params.vendorId), req.auditContext);

        return ApiResponse.success(
            res,
            null,
            'Vendor deleted successfully'
        );
    });
}

module.exports = VendorController;