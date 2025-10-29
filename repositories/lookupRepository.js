const AppError = require('../utils/appError');

class LookupRepository {
    constructor(db) {
        this.db = db;
    }
    async getAll(limit = 10, page = 1, client) {
        const connection = client;
        try {
            const offset = (page - 1) * limit;
            const countQuery = `SELECT COUNT(lookupKey) as total FROM lookup`;
            const [countResult] = await connection.query(countQuery);
            const totalRecords = countResult[0].total;
            const dataQuery = `
                SELECT tag, lookupKey, value FROM lookup 
                LIMIT ? OFFSET ?
            `;
            const numLimit = Math.max(1, parseInt(limit, 10) ?? 10);
            const numOffset = Math.max(0, parseInt(offset, 10) ?? 0);

            const params = [numLimit, numOffset];
            const [lookupData] = await connection.query(dataQuery, params);
            return {
                data: lookupData,
                totalRecords: totalRecords
            };
        } catch (error) {
            this._handleDatabaseError(error, 'getAll');
        }
    }

    async getByKey(lookupKey, client) {
        const connection = client;
        try {
            const dataQuery = `SELECT tag, lookupKey, value FROM lookup WHERE lookupKey=?`;
            const [lookupData] = await connection.query(dataQuery, [lookupKey]);
            return {
                data: lookupData
            }
        } catch (error) {
            this._handleDatabaseError(error, 'getByKey');
        }
    }

    async getByTag(tag, connection) {
        try {
            const dataQuery = `SELECT lookupKey,tag,value FROM lookup WHERE tag=?`;
            const [lookupData] = await connection.query(dataQuery, [tag]);
            return {
                data: lookupData
            }
        } catch (error) {
            this._handleDatabaseError(error, 'getByTag');
        }
    }

    async create(lookupData, client) {
        const connection = client;
        console.log('Creating lookup with data:', lookupData);
        try {
            const [result] = await connection.execute(
                `INSERT INTO lookup(tag, value) 
                 VALUES(?, ?)`,
                [lookupData.tag, lookupData.value]
            );
            return {
                lookupKey: result.insertId,
                tag: lookupData.tag,
                value: lookupData.value,
            };
        } catch (error) {
            console.error('DB error in LookupRepository.create:', error);
            this._handleDatabaseError(error, 'create');
        }
    }

    async delete(lookupKey, client) {
        try {
            const [result] = await client.execute(`DELETE FROM lookup WHERE lookupKey = ?`, [lookupKey]);
            if (result.affectedRows === 0) {
                await client.rollback();
                return false;
            }
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'delete');
        }
    }

    async exists(value, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `SELECT lookupKey FROM lookup WHERE value = ?`,
                [value]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            this._handleDatabaseError(error, 'exists');
        }
    }

    _handleDatabaseError(error, operation) {
        const errorMappings = {
            'ER_BAD_FIELD_ERROR': {
                status: 500,
                errorCode: "DATABASE_SCHEMA_ERROR",
                message: "Database schema error - invalid field reference",
                details: { operation, hint: "Database schema may have changed" }
            },
            'ER_NO_SUCH_TABLE': {
                status: 500,
                errorCode: "DATABASE_SCHEMA_ERROR",
                message: "Required database table not found",
                details: { operation, hint: "Database migration may be required" }
            },
            'ER_ACCESS_DENIED_ERROR': {
                status: 500,
                errorCode: "DATABASE_ACCESS_ERROR",
                message: "Database access denied",
                details: { operation, hint: "Check database permissions" }
            },
            'ETIMEDOUT': {
                status: 503,
                errorCode: "DATABASE_CONNECTION_ERROR",
                message: "Database connection timeout",
                details: { operation, suggestion: "Please try again in a moment" }
            },
            'ECONNRESET': {
                status: 503,
                errorCode: "DATABASE_CONNECTION_ERROR",
                message: "Database connection timeout",
                details: { operation, suggestion: "Please try again in a moment" }
            },
            'ER_DUP_ENTRY': {
                status: 409,
                errorCode: "DUPLICATE_ENTRY",
                message: "A lookup entry with this information already exists",
                details: {
                    duplicateField: error.message.includes('lookupKey') ? 'name' : 'unknown'
                }
            },
            'ER_DATA_TOO_LONG': {
                status: 400,
                errorCode: "DATA_TOO_LONG",
                message: "One or more fields exceed the maximum allowed length",
                details: { field: error.message }
            }
        };
        const mapping = errorMappings[error.code];
        if (mapping) {
            throw new AppError(mapping.message, mapping.status, mapping.errorCode, mapping.details);
        }
        // Default database error
        throw new AppError(
            "Database operation failed",
            500,
            "DATABASE_ERROR",
            {
                operation,
                code: error.code,
                sqlState: error.sqlState
            }
        );
    }
}

module.exports = LookupRepository;