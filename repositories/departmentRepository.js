const AppError = require('../utils/appError');

class DepartmentRepository {
    constructor(db) {
        this.db = db;
    }

    async create(departmentData, client) {
        try {
            const [result] = await client.execute(
                `INSERT INTO department (departmentName, departmentDescription, clientId)
                 VALUES (?, ?, ?)`,
                [departmentData.departmentName, departmentData.departmentDescription, departmentData.clientId]
            );
            return { departmentId: result.insertId, ...departmentData };
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async findById(departmentId, client) {
        try {
            const [rows] = await client.execute(
                `SELECT departmentId, departmentName, departmentDescription, clientId, createdAt, updatedAt
                 FROM department
                 WHERE departmentId = ?`,
                [departmentId]
            );
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async update(departmentId, updateData, client) {
        try {
            const fields = Object.keys(updateData);
            const values = Object.values(updateData);
            const setClause = fields.map(f => `${f} = ?`).join(', ');

            const [result] = await client.execute(
                `UPDATE department SET ${setClause} WHERE departmentId = ? AND (is_deleted = 0 OR is_deleted IS NULL)`,
                [...values, departmentId]
            );

            if (result.affectedRows === 0) {
                throw new AppError(`Department with ID ${departmentId} not found`, 404, 'DEPARTMENT_NOT_FOUND');
            }
            return { departmentId, ...updateData };
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async delete(departmentId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE department SET is_deleted = 1, deleted_at = UTC_TIMESTAMP()
                 WHERE departmentId = ? AND (is_deleted = 0 OR is_deleted IS NULL)`,
                [departmentId]
            );
            if (result.affectedRows === 0) {
                throw new AppError(`Department with ID ${departmentId} not found`, 404, 'DEPARTMENT_NOT_FOUND');
            }
            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async findByClientId(clientId, client) {
        try {
            const [rows] = await client.execute(
                `SELECT departmentId, departmentName, departmentDescription, clientId, createdAt, updatedAt
                 FROM department
                 WHERE clientId = ? AND (is_deleted = 0 OR is_deleted IS NULL)
                 ORDER BY departmentName`,
                [clientId]
            );
            return rows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async getDeleted(clientId, client) {
        try {
            const [rows] = await client.execute(
                `SELECT departmentId, departmentName, departmentDescription, clientId, deleted_at
                 FROM department
                 WHERE clientId = ? AND is_deleted = 1
                 ORDER BY deleted_at DESC`,
                [clientId]
            );
            return rows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async restore(departmentId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE department SET is_deleted = 0, deleted_at = NULL
                 WHERE departmentId = ? AND is_deleted = 1`,
                [departmentId]
            );
            if (result.affectedRows === 0) return false;
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async existsByName(departmentName, clientId, excludeId = null, client) {
        try {
            let query = `SELECT COUNT(*) as count FROM department
                         WHERE departmentName = ? AND clientId = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
            const params = [departmentName, clientId];
            if (excludeId) { query += ` AND departmentId != ?`; params.push(excludeId); }
            const [rows] = await client.execute(query, params);
            return rows[0].count > 0;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async getDepartmentAuditLogsById(departmentId, page = 1, limit = 20, client) {
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (safePage - 1) * safeLimit;
        try {
            const [rows] = await client.query(
                `SELECT a.id, a.action, a.verb, a.summary, a.resource_type, a.resource_id,
                        a.old_values, a.new_values,
                        DATE_FORMAT(CONVERT_TZ(a.timestamp, @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%s.000Z') AS timestamp,
                        DATE_FORMAT(CONVERT_TZ(COALESCE(a.occurred_at_utc, a.timestamp), @@session.time_zone, '+00:00'), '%Y-%m-%dT%H:%i:%s.000Z') AS occurred_at,
                        m.memberName AS actor_name
                 FROM auditLogs a
                 LEFT JOIN member m ON m.memberId = a.user_id
                 WHERE LOWER(COALESCE(a.resource_type, '')) = 'department'
                   AND a.resource_id = ?
                 ORDER BY COALESCE(a.occurred_at_utc, a.timestamp) DESC, a.id DESC
                 LIMIT ? OFFSET ?`,
                [String(departmentId), safeLimit, offset]
            );
            const [countRows] = await client.query(
                `SELECT COUNT(*) AS total FROM auditLogs
                 WHERE LOWER(COALESCE(resource_type, '')) = 'department'
                   AND resource_id = ?`,
                [String(departmentId)]
            );
            return { rows, total: Number(countRows[0]?.total || 0), page: safePage, limit: safeLimit };
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);
        switch (error.code) {
            case 'ER_DUP_ENTRY':
                throw new AppError('A department with this name already exists for this client', 409, 'DUPLICATE_ENTRY', { field: 'departmentName' });
            case 'ER_DATA_TOO_LONG':
                throw new AppError('One or more fields exceed the maximum allowed length', 400, 'DATA_TOO_LONG', { originalError: error.message });
            case 'ER_BAD_NULL_ERROR':
                throw new AppError('Required field cannot be null', 400, 'NULL_CONSTRAINT_VIOLATION', { originalError: error.message });
            case 'ER_NO_REFERENCED_ROW_2':
                throw new AppError('Invalid client ID provided', 400, 'FOREIGN_KEY_CONSTRAINT', { field: 'clientId' });
            default:
                throw new AppError('Database operation failed', 500, 'DATABASE_ERROR', { code: error.code, sqlState: error.sqlState });
        }
    }
}

module.exports = DepartmentRepository;
