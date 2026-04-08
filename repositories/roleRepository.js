const AppError = require('../utils/appError');

class RoleRepository {
    constructor(db) {
        this.db = db;
    }

    async _getConnection(client) {
        return client || this.db.getConnection();
    }

    _releaseConnection(connection, client) {
        if (!client && connection) {
            connection.release();
        }
    }

    _toBoolean(value) {
        return Boolean(Number(value));
    }

    async listRoles(page = 1, pageSize = 10, client = null) {
        const connection = await this._getConnection(client);
        try {
            const safePage = Math.max(1, Number(page) || 1);
            const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 10));
            const offset = (safePage - 1) * safePageSize;

            const [rows] = await connection.execute(
                `SELECT id, name, briefPurpose, permissionVersion, createdAt, updatedAt
                 FROM role
                 ORDER BY id DESC
                 LIMIT ? OFFSET ?`,
                [safePageSize, offset]
            );

            const [countRows] = await connection.execute(
                `SELECT COUNT(*) AS totalCount FROM role`
            );

            const totalCount = Number(countRows[0]?.totalCount || 0);
            return {
                data: rows,
                pagination: {
                    page: safePage,
                    pageSize: safePageSize,
                    totalCount,
                    totalPages: Math.ceil(totalCount / safePageSize)
                }
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to fetch roles', 500, 'ROLE_FETCH_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async findRoleById(roleId, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [rows] = await connection.execute(
                `SELECT id, name, briefPurpose, permissionVersion, createdAt, updatedAt
                 FROM role
                 WHERE id = ?`,
                [roleId]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Failed to fetch role', 500, 'ROLE_FETCH_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async findRoleByName(name, excludeRoleId = null, client = null) {
        const connection = await this._getConnection(client);
        try {
            let query = `SELECT id, name FROM role WHERE LOWER(name) = LOWER(?)`;
            const params = [name];

            if (excludeRoleId) {
                query += ` AND id != ?`;
                params.push(excludeRoleId);
            }

            const [rows] = await connection.execute(query, params);
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Failed to fetch role by name', 500, 'ROLE_FETCH_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async createRole(roleData, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [result] = await connection.execute(
                `INSERT INTO role (name, briefPurpose)
                 VALUES (?, ?)`,
                [roleData.name, roleData.briefPurpose ?? null]
            );

            return this.findRoleById(result.insertId, connection);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new AppError('Role name already exists', 409, 'ROLE_EXISTS');
            }
            throw new AppError('Failed to create role', 500, 'ROLE_CREATE_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async updateRole(roleId, roleData, client = null) {
        const connection = await this._getConnection(client);
        try {
            const allowedFields = ['name', 'briefPurpose'];
            const filteredEntries = Object.entries(roleData).filter(
                ([key, value]) => allowedFields.includes(key) && value !== undefined
            );

            if (filteredEntries.length === 0) {
                throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');
            }

            const setClause = filteredEntries.map(([key]) => `${key} = ?`).join(', ');
            const values = filteredEntries.map(([, value]) => value);

            const [result] = await connection.execute(
                `UPDATE role
                 SET ${setClause}, updatedAt = NOW()
                 WHERE id = ?`,
                [...values, roleId]
            );

            if (result.affectedRows === 0) {
                return null;
            }

            return this.findRoleById(roleId, connection);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.code === 'ER_DUP_ENTRY') {
                throw new AppError('Role name already exists', 409, 'ROLE_EXISTS');
            }

            throw new AppError('Failed to update role', 500, 'ROLE_UPDATE_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async deleteRole(roleId, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [result] = await connection.execute(
                `DELETE FROM role WHERE id = ?`,
                [roleId]
            );
            return result.affectedRows;
        } catch (error) {
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                throw new AppError(
                    'Cannot delete role because it is assigned to existing users',
                    409,
                    'ROLE_IN_USE'
                );
            }
            throw new AppError('Failed to delete role', 500, 'ROLE_DELETE_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async findModuleById(moduleId, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [rows] = await connection.execute(
                `SELECT id, name, displayName, sortOrder
                 FROM module
                 WHERE id = ?`,
                [moduleId]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Failed to fetch module', 500, 'MODULE_FETCH_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async findModuleByName(moduleName, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [rows] = await connection.execute(
                `SELECT id, name, displayName, sortOrder
                 FROM module
                 WHERE name = ?`,
                [moduleName]
            );
            return rows[0] || null;
        } catch (error) {
            throw new AppError('Failed to fetch module', 500, 'MODULE_FETCH_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async upsertModulePermission(roleId, moduleId, permissionData, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [result] = await connection.execute(
                `INSERT INTO role_module_permission (
                    roleId, moduleId, canView, canAdd, canEdit, canDelete, canFinalizeResult
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    canView = VALUES(canView),
                    canAdd = VALUES(canAdd),
                    canEdit = VALUES(canEdit),
                    canDelete = VALUES(canDelete),
                    canFinalizeResult = VALUES(canFinalizeResult),
                    updatedAt = NOW()`,
                [
                    roleId,
                    moduleId,
                    this._toBoolean(permissionData.canView),
                    this._toBoolean(permissionData.canAdd),
                    this._toBoolean(permissionData.canEdit),
                    this._toBoolean(permissionData.canDelete),
                    this._toBoolean(permissionData.canFinalizeResult)
                ]
            );

            return result.affectedRows > 0;
        } catch (error) {
            throw new AppError('Failed to save module permission', 500, 'ROLE_PERMISSION_UPDATE_ERROR', {
                originalError: error.message
            });
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async incrementPermissionVersion(roleId, client = null) {
        const connection = await this._getConnection(client);
        try {
            await connection.execute(
                `UPDATE role
                 SET permissionVersion = permissionVersion + 1,
                     updatedAt = NOW()
                 WHERE id = ?`,
                [roleId]
            );
        } catch (error) {
            throw new AppError(
                'Failed to increment permission version',
                500,
                'ROLE_PERMISSION_VERSION_ERROR',
                { originalError: error.message }
            );
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async getRoleModulesPermissions(roleId, client = null) {
        const connection = await this._getConnection(client);
        try {
            const role = await this.findRoleById(roleId, connection);
            if (!role) {
                return null;
            }

            const [rows] = await connection.execute(
                `SELECT
                    m.id AS moduleId,
                    m.name AS moduleName,
                    m.displayName,
                    m.sortOrder,
                    COALESCE(rmp.canView, 0) AS canView,
                    COALESCE(rmp.canAdd, 0) AS canAdd,
                    COALESCE(rmp.canEdit, 0) AS canEdit,
                    COALESCE(rmp.canDelete, 0) AS canDelete,
                    COALESCE(rmp.canFinalizeResult, 0) AS canFinalizeResult
                 FROM module m
                 LEFT JOIN role_module_permission rmp
                    ON rmp.moduleId = m.id AND rmp.roleId = ?
                 ORDER BY m.sortOrder ASC, m.id ASC`,
                [roleId]
            );

            const permissions = rows.map((row) => ({
                moduleId: row.moduleId,
                moduleName: row.moduleName,
                displayName: row.displayName,
                sortOrder: row.sortOrder,
                canView: this._toBoolean(row.canView),
                canAdd: this._toBoolean(row.canAdd),
                canEdit: this._toBoolean(row.canEdit),
                canDelete: this._toBoolean(row.canDelete),
                canFinalizeResult: this._toBoolean(row.canFinalizeResult)
            }));

            return {
                role,
                permissions
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                'Failed to fetch role module permissions',
                500,
                'ROLE_PERMISSION_FETCH_ERROR',
                { originalError: error.message }
            );
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async getPermissionByRoleAndModule(roleId, moduleName, client = null) {
        const connection = await this._getConnection(client);
        try {
            const [rows] = await connection.execute(
                `SELECT
                    m.id AS moduleId,
                    m.name AS moduleName,
                    COALESCE(rmp.canView, 0) AS canView,
                    COALESCE(rmp.canAdd, 0) AS canAdd,
                    COALESCE(rmp.canEdit, 0) AS canEdit,
                    COALESCE(rmp.canDelete, 0) AS canDelete,
                    COALESCE(rmp.canFinalizeResult, 0) AS canFinalizeResult
                 FROM module m
                 LEFT JOIN role_module_permission rmp
                    ON rmp.moduleId = m.id AND rmp.roleId = ?
                 WHERE m.name = ?
                 LIMIT 1`,
                [roleId, moduleName]
            );

            if (!rows[0]) {
                return null;
            }

            return {
                moduleId: rows[0].moduleId,
                moduleName: rows[0].moduleName,
                canView: this._toBoolean(rows[0].canView),
                canAdd: this._toBoolean(rows[0].canAdd),
                canEdit: this._toBoolean(rows[0].canEdit),
                canDelete: this._toBoolean(rows[0].canDelete),
                canFinalizeResult: this._toBoolean(rows[0].canFinalizeResult)
            };
        } catch (error) {
            throw new AppError(
                'Failed to fetch role permission',
                500,
                'ROLE_PERMISSION_FETCH_ERROR',
                { originalError: error.message }
            );
        } finally {
            this._releaseConnection(connection, client);
        }
    }

    async buildJwtPermissionsMap(roleId, client = null) {
        if (!roleId) {
            return {};
        }

        const result = await this.getRoleModulesPermissions(roleId, client);
        if (!result) {
            return {};
        }

        const permissionsMap = {};
        result.permissions.forEach((permission) => {
            permissionsMap[permission.moduleName] = {
                view: permission.canView,
                add: permission.canAdd,
                edit: permission.canEdit,
                delete: permission.canDelete,
                canFinalizeResult: permission.canFinalizeResult
            };
        });

        return permissionsMap;
    }
}

module.exports = RoleRepository;
