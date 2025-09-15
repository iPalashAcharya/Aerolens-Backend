const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class DepartmentController {
    constructor(departmentService) {
        this.departmentService = departmentService;
    }

    createDepartment = catchAsync(async (req, res) => {
        const department = await this.departmentService.createDepartment(req.body);

        return ApiResponse.success(
            res,
            department,
            'Department created successfully',
            201
        );
    });

    getDepartment = catchAsync(async (req, res) => {
        const department = await this.departmentService.getDepartmentById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            department,
            'Department retrieved successfully'
        );
    });

    updateDepartment = catchAsync(async (req, res) => {
        const updatedDepartment = await this.departmentService.updateDepartment(
            parseInt(req.params.id),
            req.body
        );

        return ApiResponse.success(
            res,
            updatedDepartment,
            'Department updated successfully'
        );
    });

    deleteDepartment = catchAsync(async (req, res) => {
        await this.departmentService.deleteDepartment(parseInt(req.params.id));

        return ApiResponse.success(
            res,
            null,
            'Department deleted successfully'
        );
    });

    getDepartmentsByClient = catchAsync(async (req, res) => {
        const departments = await this.departmentService.getDepartmentsByClientId(
            parseInt(req.params.clientId)
        );

        return ApiResponse.success(
            res,
            departments,
            'Departments retrieved successfully',
            200,
            { count: departments.length }
        );
    });
}

module.exports = DepartmentController;