const db = require('../db');
const AppError = require('../utils/appError');

class AuditLogRepository {
    constructor() {
        this.db = db;
    }

    async create(auditLogData, client = null) {
        const connection = client || (await this.db.getConnection());
        const ownConnection = !client;
        try {
            const query = `
                INSERT INTO auditLogs(
                    user_id, action, resource_type, resource_id, verb, summary,
                    old_values, new_values, ip_address, user_agent,
                    http_method, http_path, reason, timestamp, occurred_at_utc
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `;
            await connection.execute(query, [
                auditLogData.userId,
                auditLogData.action,
                auditLogData.resourceType ?? null,
                auditLogData.resourceId ?? null,
                auditLogData.verb ?? null,
                auditLogData.summary ?? null,
                auditLogData.oldValues,
                auditLogData.newValues,
                auditLogData.ipAddress ?? null,
                auditLogData.userAgent ?? null,
                auditLogData.httpMethod ?? null,
                auditLogData.httpPath ?? null,
                auditLogData.reason ?? null,
                auditLogData.timestamp,
                auditLogData.occurredAtUtc ?? null
            ]);

            return true;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (ownConnection) await connection.release();
        }
    }

    /**
     * Paginated list with optional filters (Phase 2).
     */
    async findMany(filters = {}, client = null) {
        const connection = client || (await this.db.getConnection());
        const ownConnection = !client;
        try {
            const {
                dateFrom,
                dateTo,
                userId,
                resourceType,
                resourceId,
                action,
                verb,
                search,
                page = 1,
                pageSize = 25
            } = filters;

            const limit = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
            const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

            const where = [];
            const params = [];

            if (dateFrom) {
                where.push('a.timestamp >= ?');
                params.push(dateFrom);
            }
            if (dateTo) {
                where.push('a.timestamp <= ?');
                params.push(dateTo);
            }
            if (userId != null && userId !== '') {
                where.push('a.user_id = ?');
                params.push(Number(userId));
            }
            if (resourceType) {
                where.push('a.resource_type = ?');
                params.push(String(resourceType).toLowerCase());
            }
            if (resourceId != null && resourceId !== '') {
                where.push('a.resource_id = ?');
                params.push(String(resourceId));
            }
            if (action) {
                where.push('a.action = ?');
                params.push(action);
            }
            if (verb) {
                where.push('a.verb LIKE ?');
                params.push(`%${verb}%`);
            }
            if (search) {
                where.push(
                    '(a.summary LIKE ? OR CAST(a.old_values AS CHAR) LIKE ? OR CAST(a.new_values AS CHAR) LIKE ?)'
                );
                const s = `%${search}%`;
                params.push(s, s, s);
            }

            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

            const countSql = `SELECT COUNT(*) AS total FROM auditLogs a ${whereSql}`;
            const [countRows] = await connection.query(countSql, params);
            const total = Number(countRows[0]?.total || 0);

            const listSql = `
                SELECT
                    a.id,
                    a.user_id,
                    a.action,
                    a.resource_type,
                    a.resource_id,
                    a.verb,
                    a.summary,
                    a.old_values,
                    a.new_values,
                    a.ip_address,
                    a.user_agent,
                    a.http_method,
                    a.http_path,
                    a.reason,
                    a.timestamp,
                    a.occurred_at_utc,
                    m.memberName AS actor_name,
                    m.email AS actor_email
                FROM auditLogs a
                LEFT JOIN member m ON m.memberId = a.user_id
                ${whereSql}
                ORDER BY COALESCE(a.occurred_at_utc, a.timestamp) DESC, a.id DESC
                LIMIT ? OFFSET ?
            `;
            const [rows] = await connection.query(listSql, [...params, limit, offset]);

            return { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: limit };
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (ownConnection) await connection.release();
        }
    }

    async findById(id, client = null) {
        const connection = client || (await this.db.getConnection());
        const ownConnection = !client;
        try {
            const sql = `
                SELECT
                    a.id,
                    a.user_id,
                    a.action,
                    a.resource_type,
                    a.resource_id,
                    a.verb,
                    a.summary,
                    a.old_values,
                    a.new_values,
                    a.ip_address,
                    a.user_agent,
                    a.http_method,
                    a.http_path,
                    a.reason,
                    a.timestamp,
                    a.occurred_at_utc,
                    m.memberName AS actor_name,
                    m.email AS actor_email
                FROM auditLogs a
                LEFT JOIN member m ON m.memberId = a.user_id
                WHERE a.id = ?
                LIMIT 1
            `;
            const [rows] = await connection.query(sql, [id]);
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (ownConnection) await connection.release();
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);

        switch (error.code) {
            case 'ER_DUP_ENTRY':
                throw new AppError(
                    'Duplicate entry for a unique field.',
                    409,
                    'DUPLICATE_ENTRY'
                );
            case 'ER_DATA_TOO_LONG':
                throw new AppError(
                    'Input data too long for one or more fields.',
                    400,
                    'DATA_TOO_LONG'
                );
            case 'ER_BAD_NULL_ERROR':
                throw new AppError(
                    'Missing required field.',
                    400,
                    'NULL_CONSTRAINT_VIOLATION'
                );
            case 'ER_NO_REFERENCED_ROW_2':
                throw new AppError(
                    'Invalid reference to a related record.',
                    400,
                    'FOREIGN_KEY_CONSTRAINT'
                );
            case 'ER_ROW_IS_REFERENCED_2':
                throw new AppError(
                    'Record cannot be deleted due to foreign key dependency.',
                    400,
                    'FK_CONSTRAINT_DELETE'
                );
            case 'ECONNREFUSED':
                throw new AppError(
                    'Database connection refused.',
                    503,
                    'DATABASE_CONNECTION_ERROR'
                );
            case 'ER_ACCESS_DENIED_ERROR':
                throw new AppError(
                    'Database access denied.',
                    503,
                    'DATABASE_ACCESS_DENIED'
                );
            default:
                throw new AppError(
                    'An error occurred while accessing the database.',
                    500,
                    'DATABASE_ERROR'
                );
        }
    }
}

module.exports = new AuditLogRepository();
