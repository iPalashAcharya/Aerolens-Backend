const AppError = require('../utils/appError');

class ClientRepository {
    constructor(db) {
        this.db = db;
    }
    async getAll(limit, page, client) {
        const connection = client;
        try {
            //const offset = (page - 1) * limit;
            //const countQuery = `SELECT COUNT(clientId) as total FROM client`;
            //const [countResult] = await connection.query(countQuery);
            //const totalRecords = countResult[0].total;
            /*const dataQuery = `
                SELECT clientId, clientName, address, location FROM client 
                LIMIT ? OFFSET ?
            `;*/
            const dataQuery = `
                SELECT clientId, clientName, address, location FROM client 
            `;
            /*const numLimit = Math.max(1, parseInt(limit, 10) || 10);
            const numOffset = Math.max(0, parseInt(offset, 10) || 0);

            const params = [numLimit, numOffset];*/
            const [clients] = await connection.query(dataQuery);
            clients.forEach(row => {
                if (typeof row.departments === 'string') {
                    row.departments = JSON.parse(row.departments);
                }
            });
            return clients
        } catch (error) {
            this._handleDatabaseError(error, 'getAll');
        }
    }

    async getById(clientId, connection) {
        try {
            const [clientDetails] = await connection.execute(`
                SELECT 
                    c.clientId,
                    c.clientName,
                    c.address,
                    c.location,
                    COALESCE(d.departments, JSON_ARRAY()) AS departments,
                    COALESCE(con.contacts, JSON_ARRAY()) AS clientContact
                FROM 
                    client c
                LEFT JOIN (
                    SELECT clientId, JSON_ARRAYAGG(
                        JSON_OBJECT('departmentId', departmentId, 'departmentName', departmentName, 'departmentDescription', departmentDescription)
                    ) AS departments
                    FROM department
                    GROUP BY clientId
                ) d ON c.clientId = d.clientId
                LEFT JOIN (
                    SELECT clientId, JSON_ARRAYAGG(
                        JSON_OBJECT('clientContactId', clientContactId, 'contactPersonName', contactPersonName, 'designation', designation, 'phone', phone, 'email', emailAddress)
                    ) AS contacts
                    FROM clientContact
                    GROUP BY clientId
                ) con ON c.clientId = con.clientId
                WHERE 
                    c.clientId = ?;
            `, [clientId]);
            if (clientDetails.length > 0) {
                const client = clientDetails[0];
                if (typeof client.departments === 'string') {
                    client.departments = JSON.parse(client.departments);
                }
                if (typeof client.clientContact === 'string') {
                    client.clientContact = JSON.parse(client.clientContact);
                }
                return client;
            } else {
                return null;
            }
        } catch (error) {
            this._handleDatabaseError(error, 'getById');
        }
    }

    async getAllWithDepartments(connection) {
        try {
            const clientQuery = `SELECT 
              c.clientId, 
              c.clientName, 
              COALESCE(d.departments, JSON_ARRAY()) AS departments
            FROM 
              client c
            LEFT JOIN (
              SELECT 
                clientId, 
                JSON_ARRAYAGG(
                  JSON_OBJECT('departmentId', departmentId, 'departmentName', departmentName)
                ) AS departments
              FROM department
              GROUP BY clientId
            ) d ON c.clientId = d.clientId;`;
            const locationQuery = `SELECT cityName AS city, stateName as state, country FROM location`
            const [clientData] = await connection.query(clientQuery);
            const [locationData] = await connection.query(locationQuery);

            clientData.forEach(client => {
                if (typeof client.departments === 'string') {
                    client.departments = JSON.parse(client.departments);
                }
            });

            if (clientData.length === 0) return null;

            return {
                clientData,
                locationData
            };

        } catch (error) {
            this._handleDatabaseError(error, 'getAllWithDepartments');
        }
    }

    async create(clientData, location, client) {
        try {
            const point = `POINT(${location.lat} ${location.lon})`;
            const [result] = await client.execute(
                `INSERT INTO client(clientName, address, location, createdAt, updatedAt) 
                 VALUES(?, ?, ST_GeomFromText(?, 4326), NOW(), NOW())`,
                [clientData.name, clientData.address, point]
            );
            return {
                clientId: result.insertId,
                clientName: clientData.name,
                address: clientData.address,
                location
            };
        } catch (error) {
            this._handleDatabaseError(error, 'create');
        }
    }
    async update(clientId, updateData, location = null, client) {
        try {
            let updateQuery, updateParams;
            if (location) {
                const point = `POINT(${location.lat} ${location.lon})`;
                updateQuery = `UPDATE client SET clientName = ?, address = ?, location = ST_GeomFromText(?, 4326), updatedAt = NOW() WHERE clientId = ?`;
                updateParams = [updateData.name, updateData.address, point, clientId];
            } else {
                updateQuery = `UPDATE client SET clientName = ?, address = ?, updatedAt = NOW() WHERE clientId = ?`;
                updateParams = [updateData.name, updateData.address, clientId];
            }
            const [result] = await client.execute(updateQuery, updateParams);
            if (result.affectedRows === 0) {
                return null;
            }
            return {
                clientId,
                ...updateData,
                ...(location && { location })
            };
        } catch (error) {
            this._handleDatabaseError(error, 'update');
        }
    }
    async delete(clientId, client) {
        try {
            const [result] = await client.execute(`DELETE FROM client WHERE clientId = ?`, [clientId]);
            if (result.affectedRows === 0) {
                return false;
            }
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error, 'delete');
        }
    }

    async exists(clientId, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `SELECT clientId, clientName, address FROM client WHERE clientId = ?`,
                [clientId]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            this._handleDatabaseError(error, 'exists');
        }
    }

    async existsByName(clientName, excludeId = null, client) {
        const connection = client;

        try {
            let query = `
            SELECT COUNT(*) as count 
            FROM client 
            WHERE clientName = ?
            `;
            const params = [clientName];

            if (excludeId) {
                query += ` AND clientId != ?`;
                params.push(excludeId);
            }

            const [rows] = await connection.execute(query, params);
            return rows[0].count > 0;
        } catch (error) {
            this._handleDatabaseError(error);
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
                message: "A client with this information already exists",
                details: {
                    duplicateField: error.message.includes('clientName') ? 'name' : 'unknown'
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

module.exports = ClientRepository;