const AppError = require('../utils/appError');

class AuditLogRepository {
    async create(auditLogData, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const query = `INSERT INTO auditLogs(user_id,action,old_values,new_values,ip_address,user_agent,reason,timestamp) VALUES(?,?,?,?,?,?,?,?)`;
            await connection.execute(query, [auditLogData.userId, auditLogData.action, auditLogData.oldValues, auditLogData.newValues, auditLogData.ipAddress, auditLogData.userAgent, auditLogData.reason, auditLogData.timestamp]);

            return true;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) await connection.release();
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