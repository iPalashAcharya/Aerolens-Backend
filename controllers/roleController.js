const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class RoleController {
    constructor(roleService) {
        this.roleService = roleService;
    }

    getRoles = catchAsync(async (req, res) => {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 10));

        const roles = await this.roleService.getRoles(page, pageSize);
        return ApiResponse.success(
            res,
            roles.data,
            'Roles retrieved successfully',
            200,
            roles.pagination
        );
    });

    getRoleById = catchAsync(async (req, res) => {
        const roleId = parseInt(req.params.id, 10);
        const role = await this.roleService.getRoleById(roleId);
        return ApiResponse.success(res, role, 'Role retrieved successfully');
    });

    createRole = catchAsync(async (req, res) => {
        const role = await this.roleService.createRole(req.body, req.auditContext);
        return ApiResponse.success(res, role, 'Role created successfully', 201);
    });

    updateRole = catchAsync(async (req, res) => {
        const roleId = parseInt(req.params.id, 10);
        const role = await this.roleService.updateRole(roleId, req.body, req.auditContext);
        return ApiResponse.success(res, role, 'Role updated successfully');
    });

    deleteRole = catchAsync(async (req, res) => {
        const roleId = parseInt(req.params.id, 10);
        await this.roleService.deleteRole(roleId, req.auditContext);
        return ApiResponse.success(res, null, 'Role deleted successfully');
    });

    patchModulePermission = catchAsync(async (req, res) => {
        const roleId = parseInt(req.params.roleId, 10);
        const moduleId = parseInt(req.params.moduleId, 10);

        const result = await this.roleService.updateRoleModulePermission(
            roleId,
            moduleId,
            req.body,
            req.auditContext
        );

        return ApiResponse.success(res, result, 'Role module permission updated successfully');
    });

    getRoleModulePermissions = catchAsync(async (req, res) => {
        const roleId = parseInt(req.params.roleId, 10);
        const result = await this.roleService.getRoleModulePermissions(roleId);
        return ApiResponse.success(res, result, 'Role module permissions retrieved successfully');
    });
}

module.exports = RoleController;
