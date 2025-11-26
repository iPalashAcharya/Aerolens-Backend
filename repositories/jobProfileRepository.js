const AppError = require('../utils/appError');

class JobProfileRepository {
    constructor(db) {
        this.db = db;
    }

    async create(jobProfileData, client) {
        const connection = client;
        console.log(jobProfileData);

        try {
            const query = `
            INSERT INTO jobProfile (
                clientId, departmentId, jobProfileDescription, jobRole, 
                techSpecification, positions, receivedOn, estimatedCloseDate, locationId, statusId
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
            `;

            const [result] = await connection.execute(query, [
                jobProfileData.clientId,
                jobProfileData.departmentId,
                jobProfileData.jobProfileDescription,
                jobProfileData.jobRole,
                jobProfileData.techSpecification,
                jobProfileData.positions,
                jobProfileData.estimatedCloseDate || null,
                jobProfileData.locationId,
                jobProfileData.statusId || 7
            ]);

            return {
                jobProfileId: result.insertId,
                ...jobProfileData,
                receivedOn: new Date()
            };
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async findById(jobProfileId, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `
            SELECT jp.jobProfileId, c.clientId ,c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfile jp
            LEFT JOIN client c ON jp.clientId=c.clientId
            LEFT JOIN department d ON jp.departmentId = d.departmentId
            LEFT JOIN lookup stat on jp.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jp.jobProfileId = ?
            ORDER BY jp.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [jobProfileId]);
            if (rows.length > 0) {
                const jobProfile = rows[0];
                if (typeof jobProfile.location === 'string') {
                    jobProfile.location = JSON.parse(jobProfile.location);
                }
                return jobProfile;
            } else {
                return null;
            }
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async update(jobProfileId, updateData, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            if (!updateData || Object.keys(updateData).length === 0) {
                throw new AppError('Update data is required', 400, 'MISSING_UPDATE_DATA');
            }

            // Filter only allowed fields for security
            const allowedFields = [
                'clientId', 'departmentId', 'jobProfileDescription', 'jobRole',
                'techSpecification', 'positions', 'estimatedCloseDate', 'locationId', 'statusId'
            ];

            const filteredData = {};
            Object.keys(updateData).forEach(key => {
                if (allowedFields.includes(key)) {
                    filteredData[key] = updateData[key];
                }
            });

            if (Object.keys(filteredData).length === 0) {
                throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');
            }

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE jobProfile SET ${setClause} WHERE jobProfileId = ?`;

            const [result] = await connection.execute(query, [...values, jobProfileId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Job profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            return {
                jobProfileId,
                ...updateData
            };
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async delete(jobProfileId, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `DELETE FROM jobProfile WHERE jobProfileId = ?`;
            const [result] = await connection.execute(query, [jobProfileId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Job profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async findByClientId(clientId, limit = null, offset = null, client) {
        const connection = client;

        try {
            if (!clientId) {
                throw new AppError('Client ID is required', 400, 'MISSING_CLIENT_ID');
            }

            let query = `
            SELECT jp.jobProfileId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfile jp
            LEFT JOIN client c ON jp.clientId=c.clientId
            LEFT JOIN department d ON jp.departmentId = d.departmentId
            LEFT JOIN lookup stat on jp.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jp.clientId = ?
            ORDER BY jp.receivedOn DESC
            `;

            const params = [clientId];

            if (limit) {
                query += ` LIMIT ?`;
                params.push(limit);

                if (offset) {
                    query += ` OFFSET ?`;
                    params.push(offset);
                }
            }

            const [rows] = await connection.execute(query, params);
            return rows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async findByStatus(statusId, client) {
        const connection = client;

        try {
            if (!statusId) {
                throw new AppError('Status ID is required', 400, 'MISSING_STATUS_ID');
            }

            const query = `
            SELECT jp.jobProfileId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfile jp
            LEFT JOIN client c ON jp.clientId=c.clientId
            LEFT JOIN department d ON jp.departmentId = d.departmentId
            LEFT JOIN lookup stat on jp.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jp.statusId = ?
            ORDER BY jp.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [statusId]);
            return rows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async findByDepartment(departmentId, client) {
        const connection = client;

        try {
            if (!departmentId) {
                throw new AppError('Department ID is required', 400, 'MISSING_DEPARTMENT_ID');
            }

            const query = `
            SELECT jp.jobProfileId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfile jp
            LEFT JOIN client c ON jp.clientId=c.clientId
            LEFT JOIN department d ON jp.departmentId = d.departmentId
            LEFT JOIN lookup stat on jp.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jp.departmentId = ?
            ORDER BY jp.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [departmentId]);
            return rows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async countByClient(clientId, client) {
        const connection = client;

        try {
            if (!clientId) {
                throw new AppError('Client ID is required', 400, 'MISSING_CLIENT_ID');
            }

            const query = `SELECT COUNT(*) as count FROM jobProfile WHERE clientId = ?`;
            const [rows] = await connection.execute(query, [clientId]);
            return rows[0].count;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async existsByRole(jobRole, clientId, excludeId = null, client) {
        const connection = client;

        try {
            if (!jobRole || !clientId) {
                throw new AppError('Job Role and Client ID are required', 400, 'MISSING_REQUIRED_PARAMETERS');
            }

            let query = `
            SELECT COUNT(*) as count 
            FROM jobProfile 
            WHERE jobRole = ? AND clientId = ?
            `;
            const params = [jobRole, clientId];

            if (excludeId) {
                query += ` AND jobProfileId != ?`;
                params.push(excludeId);
            }

            const [rows] = await connection.execute(query, params);
            return rows[0].count > 0;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async findAll(limit = null, offset = null, client) {
        const connection = client;

        try {
            let query = `
            SELECT jp.jobProfileId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfile jp
            LEFT JOIN client c ON jp.clientId=c.clientId
            LEFT JOIN department d ON jp.departmentId = d.departmentId
            LEFT JOIN lookup stat on jp.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            ORDER BY jp.receivedOn DESC
            `;

            const params = [];

            if (limit) {
                query += ` LIMIT ?`;
                params.push(limit);

                if (offset) {
                    query += ` OFFSET ?`;
                    params.push(offset);
                }
            }

            const [rows] = await connection.execute(query, params);
            rows.forEach(row => {
                if (typeof row.location === 'string') {
                    row.location = JSON.parse(row.location);
                }
            });
            return rows.length > 0 ? rows : null;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);

        switch (error.code) {
            case 'ER_DUP_ENTRY':
                throw new AppError(
                    'A job profile with this role already exists for this client',
                    409,
                    'DUPLICATE_ENTRY',
                    { field: 'jobRole' }
                );

            case 'ER_DATA_TOO_LONG':
                throw new AppError(
                    'One or more fields exceed the maximum allowed length',
                    400,
                    'DATA_TOO_LONG',
                    { originalError: error.message }
                );

            case 'ER_BAD_NULL_ERROR':
                throw new AppError(
                    'Required field cannot be null',
                    400,
                    'NULL_CONSTRAINT_VIOLATION',
                    { originalError: error.message }
                );

            case 'ER_NO_REFERENCED_ROW_2':
                throw new AppError(
                    'Invalid foreign key provided - referenced record does not exist',
                    400,
                    'FOREIGN_KEY_CONSTRAINT',
                    { originalError: error.message }
                );

            case 'ER_ROW_IS_REFERENCED_2':
                throw new AppError(
                    'Cannot delete record - it is referenced by other records',
                    400,
                    'FOREIGN_KEY_CONSTRAINT_DELETE',
                    { originalError: error.message }
                );

            case 'ECONNREFUSED':
                throw new AppError(
                    'Database connection refused',
                    503,
                    'DATABASE_CONNECTION_ERROR'
                );

            case 'ER_ACCESS_DENIED_ERROR':
                throw new AppError(
                    'Database access denied',
                    503,
                    'DATABASE_ACCESS_DENIED'
                );

            default:
                throw new AppError(
                    'Database operation failed',
                    500,
                    'DATABASE_ERROR',
                    {
                        code: error.code,
                        sqlState: error.sqlState,
                        message: error.message
                    }
                );
        }
    }
}

module.exports = JobProfileRepository;