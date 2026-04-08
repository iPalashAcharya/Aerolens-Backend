const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class RoleService {
    constructor(roleRepository, db) {
        this.roleRepository = roleRepository;
        this.db = db;
    }

    async getRoles(page = 1, pageSize = 10) {
        const client = await this.db.getConnection();
        try {
            return await this.roleRepository.listRoles(page, pageSize, client);
        } finally {
            client.release();
        }
    }

    async getRoleById(roleId) {
        const client = await this.db.getConnection();
        try {
            const rolePermissionBundle = await this.roleRepository.getRoleModulesPermissions(roleId, client);

            if (!rolePermissionBundle) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            return rolePermissionBundle;
        } finally {
            client.release();
        }
    }

    async createRole(roleData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const duplicateRole = await this.roleRepository.findRoleByName(roleData.name, null, client);
            if (duplicateRole) {
                throw new AppError('Role name already exists', 409, 'ROLE_EXISTS');
            }

            const role = await this.roleRepository.createRole(roleData, client);

            await auditLogService.logAction({
                userId: auditContext?.userId || null,
                action: 'CREATE',
                newValues: {
                    entityType: 'ROLE',
                    roleId: role.id,
                    roleName: role.name,
                    briefPurpose: role.briefPurpose
                },
                ipAddress: auditContext?.ipAddress || null,
                userAgent: auditContext?.userAgent || null,
                timestamp: auditContext?.timestamp || new Date()
            }, client);

            await client.commit();
            return role;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to create role', 500, 'ROLE_CREATE_ERROR', {
                originalError: error.message
            });
        } finally {
            client.release();
        }
    }

    async updateRole(roleId, roleData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const existingRole = await this.roleRepository.findRoleById(roleId, client);
            if (!existingRole) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            if (roleData.name) {
                const duplicateRole = await this.roleRepository.findRoleByName(roleData.name, roleId, client);
                if (duplicateRole) {
                    throw new AppError('Role name already exists', 409, 'ROLE_EXISTS');
                }
            }

            const updatedRole = await this.roleRepository.updateRole(roleId, roleData, client);
            if (!updatedRole) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            await auditLogService.logAction({
                userId: auditContext?.userId || null,
                action: 'UPDATE',
                oldValues: existingRole,
                newValues: {
                    entityType: 'ROLE',
                    roleId: updatedRole.id,
                    roleName: updatedRole.name,
                    briefPurpose: updatedRole.briefPurpose
                },
                ipAddress: auditContext?.ipAddress || null,
                userAgent: auditContext?.userAgent || null,
                timestamp: auditContext?.timestamp || new Date()
            }, client);

            await client.commit();
            return updatedRole;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to update role', 500, 'ROLE_UPDATE_ERROR', {
                originalError: error.message
            });
        } finally {
            client.release();
        }
    }

    async deleteRole(roleId, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const existingRole = await this.roleRepository.findRoleById(roleId, client);
            if (!existingRole) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            const deletedRows = await this.roleRepository.deleteRole(roleId, client);
            if (!deletedRows) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            await auditLogService.logAction({
                userId: auditContext?.userId || null,
                action: 'DELETE',
                oldValues: {
                    entityType: 'ROLE',
                    roleId: existingRole.id,
                    roleName: existingRole.name
                },
                ipAddress: auditContext?.ipAddress || null,
                userAgent: auditContext?.userAgent || null,
                timestamp: auditContext?.timestamp || new Date()
            }, client);

            await client.commit();
            return true;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to delete role', 500, 'ROLE_DELETE_ERROR', {
                originalError: error.message
            });
        } finally {
            client.release();
        }
    }

    async updateRoleModulePermission(roleId, moduleId, permissionData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const role = await this.roleRepository.findRoleById(roleId, client);
            if (!role) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            const moduleEntity = await this.roleRepository.findModuleById(moduleId, client);
            if (!moduleEntity) {
                throw new AppError('Module not found', 404, 'MODULE_NOT_FOUND');
            }

            await this.roleRepository.upsertModulePermission(roleId, moduleId, permissionData, client);
            await this.roleRepository.incrementPermissionVersion(roleId, client);

            const updatedPermissions = await this.roleRepository.getPermissionByRoleAndModule(
                roleId,
                moduleEntity.name,
                client
            );

            await auditLogService.logAction({
                userId: auditContext?.userId || null,
                action: 'UPDATE',
                newValues: {
                    entityType: 'ROLE_PERMISSION',
                    roleId: role.id,
                    roleName: role.name,
                    moduleId: moduleEntity.id,
                    moduleName: moduleEntity.name,
                    permissions: updatedPermissions
                },
                ipAddress: auditContext?.ipAddress || null,
                userAgent: auditContext?.userAgent || null,
                timestamp: auditContext?.timestamp || new Date()
            }, client);

            await client.commit();

            return {
                roleId: role.id,
                roleName: role.name,
                moduleId: moduleEntity.id,
                moduleName: moduleEntity.name,
                permissions: updatedPermissions
            };
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                'Failed to update role permission',
                500,
                'ROLE_PERMISSION_UPDATE_ERROR',
                { originalError: error.message }
            );
        } finally {
            client.release();
        }
    }

    async getRoleModulePermissions(roleId) {
        const client = await this.db.getConnection();
        try {
            const bundle = await this.roleRepository.getRoleModulesPermissions(roleId, client);
            if (!bundle) {
                throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
            }

            return {
                roleId: bundle.role.id,
                roleName: bundle.role.name,
                permissionVersion: bundle.role.permissionVersion,
                permissions: bundle.permissions.map((permission) => ({
                    moduleId: permission.moduleId,
                    moduleName: permission.moduleName,
                    displayName: permission.displayName,
                    canView: permission.canView,
                    canAdd: permission.canAdd,
                    canEdit: permission.canEdit,
                    canDelete: permission.canDelete,
                    customActions: {
                        canFinalizeResult: permission.canFinalizeResult
                    }
                }))
            };
        } finally {
            client.release();
        }
    }
}

module.exports = RoleService;
