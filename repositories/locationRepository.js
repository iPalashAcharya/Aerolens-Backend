const AppError = require('../utils/appError');

class LookupRepository {
    constructor(db) {
        this.db = db;
    }
    async getAll(client) {
        const connection = client;
        try {
            const dataQuery = `
                SELECT locationId,cityName AS city,country,stateName AS state FROM location 
            `;
            const [locationData] = await connection.query(dataQuery);
            return {
                data: locationData
            };
        } catch (error) {
            this._handleDatabaseError(error, 'getAll');
        }
    }

    async getById(locationId, client) {
        const connection = client;
        try {
            const dataQuery = `SELECT locationId, cityName AS city, stateName AS state, country FROM location WHERE locationId=?`;
            const [locationData] = await connection.query(dataQuery, [locationId]);
            return {
                data: locationData
            }
        } catch (error) {
            this._handleDatabaseError(error, 'getByKey');
        }
    }

    async create(locationData, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `INSERT INTO location (country, cityName,stateName,isActive) VALUES(?,?,?,TRUE)`,
                [locationData.country, locationData.city, locationData.state]
            );
            return {
                locationId: result.insertId,
                city: locationData.city,
                country: locationData.country,
                state: locationData.state || null
            };
        } catch (error) {
            console.error('DB error in locationRepository.create:', error);
            this._handleDatabaseError(error, 'create');
        }
    }

    async update(locationId, locationData, client) {
        const connection = client;
        try {
            if (!locationId) {
                throw new AppError('Location Id is Required', 400, 'MISSING_LOCATION_ID');
            }

            if (Object.keys(locationData).length === 0) {
                throw new AppError('Location Data is required', 400, 'MISSING_LOCATION_DATA');
            }

            const fieldMap = {
                city: "cityName",
                state: "stateName",
                country: "country"
            };

            const filteredData = {};
            Object.keys(locationData).forEach(key => {
                const mappedKey = fieldMap[key];
                if (mappedKey) {
                    filteredData[mappedKey] = locationData[key];
                }
            });

            if (Object.keys(filteredData).length === 0) {
                throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');
            }

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE location SET ${setClause} WHERE locationId = ?`;

            const [result] = await connection.execute(query, [...values, locationId]);
            if (result.affectedRows === 0) {
                throw new AppError(
                    `Location with Id ${locationId} not found`,
                    404,
                    'LOCATION_NOT_FOUND',
                );
            }

            return { locationId, ...locationData };

        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error, 'update');
        }
    }

    async delete(locationId, client) {
        try {
            const [result] = await client.execute(`DELETE FROM location WHERE locationId = ?`, [locationId]);
            if (result.affectedRows === 0) {
                await client.rollback();
                return false;
            }
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'delete');
        }
    }

    async exists(city, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `SELECT locationId FROM location WHERE cityName = ?`,
                [city]
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