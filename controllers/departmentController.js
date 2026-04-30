const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class DepartmentController {
    constructor(departmentService) {
        this.departmentService = departmentService;
    }

    createDepartment = catchAsync(async (req, res) => {
        const department = await this.departmentService.createDepartment(req.body, req.auditContext);

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
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            updatedDepartment,
            'Department updated successfully'
        );
    });

    deleteDepartment = catchAsync(async (req, res) => {
        await this.departmentService.deleteDepartment(parseInt(req.params.id), req.auditContext);

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

    getDeletedDepartments = catchAsync(async (req, res) => {
        const clientId = parseInt(req.params.clientId);
        const departments = await this.departmentService.getDeletedDepartments(clientId);
        return ApiResponse.success(res, departments, 'Deleted departments retrieved successfully');
    });

    getDepartmentAuditLogsById = catchAsync(async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const result = await this.departmentService.getDepartmentAuditLogsById(parseInt(req.params.departmentId, 10), page, limit);
        return res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination,
        });
    });

    restoreDepartment = catchAsync(async (req, res) => {
        const result = await this.departmentService.restoreDepartment(parseInt(req.params.id), req.auditContext);
        return ApiResponse.success(res, result, 'Department restored successfully');
    });
}

module.exports = DepartmentController;