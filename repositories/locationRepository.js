const AppError = require('../utils/appError');

class LookupRepository {
    constructor(db) {
        this.db = db;
    }

    async getAll(client) {
        try {
            const [locationData] = await client.query(`
                SELECT locationId, cityName AS city, country, stateName AS state
                FROM location
                WHERE (is_deleted = false OR is_deleted IS NULL)
            `);
            return { data: locationData };
        } catch (error) {
            this._handleDatabaseError(error, 'getAll');
        }
    }

    async getById(locationId, client) {
        try {
            const [locationData] = await client.query(
                `SELECT locationId, cityName AS city, stateName AS state, country
                 FROM location WHERE locationId = ?`,
                [locationId]
            );
            return { data: locationData };
        } catch (error) {
            this._handleDatabaseError(error, 'getByKey');
        }
    }

    async create(locationData, client) {
        try {
            const [result] = await client.execute(
                `INSERT INTO location (country, cityName, stateName, isActive) VALUES (?, ?, ?, TRUE)`,
                [locationData.country, locationData.city, locationData.state]
            );
            return {
                locationId: result.insertId,
                city: locationData.city,
                country: locationData.country,
                state: locationData.state ?? null
            };
        } catch (error) {
            console.error('DB error in locationRepository.create:', error);
            this._handleDatabaseError(error, 'create');
        }
    }

    async update(locationId, locationData, client) {
        try {
            if (!locationId) throw new AppError('Location Id is Required', 400, 'MISSING_LOCATION_ID');
            if (Object.keys(locationData).length === 0) throw new AppError('Location Data is required', 400, 'MISSING_LOCATION_DATA');

            const fieldMap = { city: 'cityName', state: 'stateName', country: 'country' };
            const filteredData = {};
            Object.keys(locationData).forEach(key => {
                const mappedKey = fieldMap[key];
                if (mappedKey) filteredData[mappedKey] = locationData[key];
            });

            if (Object.keys(filteredData).length === 0) throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);
            const setClause = fields.map(f => `${f} = ?`).join(', ');

            const [result] = await client.execute(
                `UPDATE location SET ${setClause} WHERE locationId = ? AND (is_deleted = false OR is_deleted IS NULL)`,
                [...values, locationId]
            );

            if (result.affectedRows === 0) {
                throw new AppError(`Location with Id ${locationId} not found`, 404, 'LOCATION_NOT_FOUND');
            }
            return { locationId, ...locationData };
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error, 'update');
        }
    }

    async delete(locationId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE location SET is_deleted = true, deleted_at = UTC_TIMESTAMP()
                 WHERE locationId = ? AND (is_deleted = false OR is_deleted IS NULL)`,
                [locationId]
            );
            if (result.affectedRows === 0) return false;
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'delete');
        }
    }

    async getDeleted(client) {
        try {
            const [rows] = await client.query(`
                SELECT locationId, cityName AS city, stateName AS state, country, deleted_at
                FROM location
                WHERE is_deleted = true
                ORDER BY deleted_at DESC
            `);
            return rows;
        } catch (error) {
            this._handleDatabaseError(error, 'getDeleted');
        }
    }

    async restore(locationId, client) {
        try {
            const [result] = await client.execute(
                `UPDATE location SET is_deleted = false, deleted_at = NULL
                 WHERE locationId = ? AND is_deleted = true`,
                [locationId]
            );
            if (result.affectedRows === 0) return false;
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'restore');
        }
    }

    async exists(city, client) {
        try {
            const [result] = await client.execute(
                `SELECT locationId FROM location WHERE cityName = ? AND (is_deleted = false OR is_deleted IS NULL)`,
                [city]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            this._handleDatabaseError(error, 'exists');
        }
    }

    _handleDatabaseError(error, operation) {
        const errorMappings = {
            'ER_BAD_FIELD_ERROR': { status: 500, errorCode: 'DATABASE_SCHEMA_ERROR', message: 'Database schema error - invalid field reference', details: { operation } },
            'ER_NO_SUCH_TABLE': { status: 500, errorCode: 'DATABASE_SCHEMA_ERROR', message: 'Required database table not found', details: { operation } },
            'ER_ACCESS_DENIED_ERROR': { status: 500, errorCode: 'DATABASE_ACCESS_ERROR', message: 'Database access denied', details: { operation } },
            'ETIMEDOUT': { status: 503, errorCode: 'DATABASE_CONNECTION_ERROR', message: 'Database connection timeout', details: { operation } },
            'ECONNRESET': { status: 503, errorCode: 'DATABASE_CONNECTION_ERROR', message: 'Database connection timeout', details: { operation } },
            'ER_DUP_ENTRY': { status: 409, errorCode: 'DUPLICATE_ENTRY', message: 'A location with this city already exists', details: {} },
            'ER_DATA_TOO_LONG': { status: 400, errorCode: 'DATA_TOO_LONG', message: 'One or more fields exceed the maximum allowed length', details: { field: error.message } }
        };
        const mapping = errorMappings[error.code];
        if (mapping) throw new AppError(mapping.message, mapping.status, mapping.errorCode, mapping.details);
        throw new AppError('Database operation failed', 500, 'DATABASE_ERROR', { operation, code: error.code, sqlState: error.sqlState });
    }
}

module.exports = LookupRepository;
