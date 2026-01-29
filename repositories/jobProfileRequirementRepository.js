const AppError = require('../utils/appError');

class JobProfileRequirementRepository {
    constructor(db) {
        this.db = db;
    }

    async create(jobProfileRequirementData, client) {
        const connection = client;

        try {
            const query = `
            INSERT INTO jobProfileRequirement (
                jobProfileId, clientId, departmentId, 
                positions, receivedOn, estimatedCloseDate, locationId, workArrangement, statusId
            ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?)
            `;

            const [result] = await connection.execute(query, [
                jobProfileRequirementData.jobProfileId,
                jobProfileRequirementData.clientId,
                jobProfileRequirementData.departmentId,
                jobProfileRequirementData.positions,
                jobProfileRequirementData.estimatedCloseDate || null,
                jobProfileRequirementData.locationId,
                jobProfileRequirementData.workArrangement,
                jobProfileRequirementData.statusId
            ]);

            return {
                jobProfileRequirementId: result.insertId,
                ...jobProfileRequirementData,
                receivedOn: new Date()
            };
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async findById(jobProfileRequirementId, client) {
        const connection = client;

        try {
            if (!jobProfileRequirementId) {
                throw new AppError('Job Profile Requirement ID is required', 400, 'MISSING_JOB_PROFILE_REQUIREMENT_ID');
            }

            const query = `
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientId,
                c.clientName, 
                d.departmentId,
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate, 
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jpr.jobProfileRequirementId = ?
            `;

            const [rows] = await connection.execute(query, [jobProfileRequirementId]);

            if (rows.length > 0) {
                const jobProfileRequirement = rows[0];
                if (typeof jobProfileRequirement.location === 'string') {
                    jobProfileRequirement.location = JSON.parse(jobProfileRequirement.location);
                }
                return jobProfileRequirement;
            } else {
                return null;
            }
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async update(jobProfileRequirementId, updateData, client) {
        const connection = client;

        try {
            if (!jobProfileRequirementId) {
                throw new AppError('Job Profile Requirement ID is required', 400, 'MISSING_JOB_PROFILE_REQUIREMENT_ID');
            }

            if (!updateData || Object.keys(updateData).length === 0) {
                return { jobProfileRequirementId };
            }

            // Filter only allowed fields for security (removed jobRole)
            const allowedFields = [
                'jobProfileId', 'positions', 'estimatedCloseDate',
                'locationId', 'workArrangement', 'statusId'
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
            const query = `UPDATE jobProfileRequirement SET ${setClause} WHERE jobProfileRequirementId = ?`;

            const [result] = await connection.execute(query, [...values, jobProfileRequirementId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Job profile requirement with ID ${jobProfileRequirementId} not found`,
                    404,
                    'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
                );
            }

            return {
                jobProfileRequirementId,
                ...updateData
            };
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async delete(jobProfileRequirementId, client) {
        const connection = client;

        try {
            if (!jobProfileRequirementId) {
                throw new AppError('Job Profile Requirement ID is required', 400, 'MISSING_JOB_PROFILE_REQUIREMENT_ID');
            }

            const query = `DELETE FROM jobProfileRequirement WHERE jobProfileRequirementId = ?`;
            const [result] = await connection.execute(query, [jobProfileRequirementId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Job profile requirement with ID ${jobProfileRequirementId} not found`,
                    404,
                    'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
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
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientName, 
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate,
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jpr.clientId = ?
            ORDER BY jpr.receivedOn DESC
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
            rows.forEach(row => {
                if (typeof row.location === 'string') {
                    row.location = JSON.parse(row.location);
                }
            });
            return rows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async findByJobProfileId(jobProfileId, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientName, 
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate,
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jpr.jobProfileId = ?
            ORDER BY jpr.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [jobProfileId]);
            rows.forEach(row => {
                if (typeof row.location === 'string') {
                    row.location = JSON.parse(row.location);
                }
            });
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
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientName, 
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate,
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jpr.statusId = ?
            ORDER BY jpr.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [statusId]);
            rows.forEach(row => {
                if (typeof row.location === 'string') {
                    row.location = JSON.parse(row.location);
                }
            });
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
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientName, 
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate,
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jpr.departmentId = ?
            ORDER BY jpr.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [departmentId]);
            rows.forEach(row => {
                if (typeof row.location === 'string') {
                    row.location = JSON.parse(row.location);
                }
            });
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

            const query = `SELECT COUNT(*) as count FROM jobProfileRequirement WHERE clientId = ?`;
            const [rows] = await connection.execute(query, [clientId]);
            return rows[0].count;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async existsByJobProfile(jobProfileId, clientId, departmentId, excludeId = null, client) {
        const connection = client;

        try {
            if (!jobProfileId || !clientId || !departmentId) {
                throw new AppError('Job Profile ID, Client ID, and Department ID are required', 400, 'MISSING_REQUIRED_PARAMETERS');
            }

            let query = `
            SELECT COUNT(*) as count 
            FROM jobProfileRequirement
            WHERE jobProfileId = ? AND clientId = ? AND departmentId = ?
            `;
            const params = [jobProfileId, clientId, departmentId];

            if (excludeId) {
                query += ` AND jobProfileRequirementId != ?`;
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
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientId,
                c.clientName, 
                d.departmentId,
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate,
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            ORDER BY jpr.receivedOn DESC
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

    async search(searchCriteria, client) {
        const connection = client;

        try {
            let query = `
            SELECT 
                jpr.jobProfileRequirementId,
                jpr.jobProfileId,
                jp.jobRole,
                c.clientName, 
                d.departmentName, 
                jpr.positions, 
                DATE(jpr.receivedOn) AS receivedOn, 
                jpr.estimatedCloseDate,
                jpr.workArrangement,
                COALESCE(
                    (SELECT JSON_OBJECT('country', l.country, 'city', l.cityName) 
                     FROM location l 
                     WHERE l.locationId = jpr.locationId)
                ) AS location, 
                stat.value AS status
            FROM jobProfileRequirement jpr
            LEFT JOIN jobProfile jp ON jpr.jobProfileId = jp.jobProfileId
            LEFT JOIN client c ON jpr.clientId = c.clientId
            LEFT JOIN department d ON jpr.departmentId = d.departmentId
            LEFT JOIN lookup stat ON jpr.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE 1=1
            `;

            const params = [];

            if (searchCriteria.jobProfileId) {
                query += ` AND jpr.jobProfileId = ?`;
                params.push(searchCriteria.jobProfileId);
            }

            if (searchCriteria.clientId) {
                query += ` AND jpr.clientId = ?`;
                params.push(searchCriteria.clientId);
            }

            if (searchCriteria.departmentId) {
                query += ` AND jpr.departmentId = ?`;
                params.push(searchCriteria.departmentId);
            }

            if (searchCriteria.locationId) {
                query += ` AND jpr.locationId = ?`;
                params.push(searchCriteria.locationId);
            }

            if (searchCriteria.statusId) {
                query += ` AND jpr.statusId = ?`;
                params.push(searchCriteria.statusId);
            }

            if (searchCriteria.workArrangement) {
                query += ` AND jpr.workArrangement = ?`;
                params.push(searchCriteria.workArrangement);
            }

            if (searchCriteria.minPositions) {
                query += ` AND jpr.positions >= ?`;
                params.push(searchCriteria.minPositions);
            }

            if (searchCriteria.maxPositions) {
                query += ` AND jpr.positions <= ?`;
                params.push(searchCriteria.maxPositions);
            }

            if (searchCriteria.fromDate) {
                query += ` AND jpr.receivedOn >= ?`;
                params.push(searchCriteria.fromDate);
            }

            if (searchCriteria.toDate) {
                query += ` AND jpr.receivedOn <= ?`;
                params.push(searchCriteria.toDate);
            }

            query += ` ORDER BY jpr.receivedOn DESC`;

            if (searchCriteria.limit) {
                query += ` LIMIT ?`;
                params.push(searchCriteria.limit);

                if (searchCriteria.offset) {
                    query += ` OFFSET ?`;
                    params.push(searchCriteria.offset);
                }
            }

            const [rows] = await connection.execute(query, params);
            rows.forEach(row => {
                if (typeof row.location === 'string') {
                    row.location = JSON.parse(row.location);
                }
            });
            return rows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);

        switch (error.code) {
            case 'ER_DUP_ENTRY':
                throw new AppError(
                    'A job profile requirement with this job profile already exists for this client and department',
                    409,
                    'DUPLICATE_ENTRY',
                    { field: 'jobProfileId' }
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

module.exports = JobProfileRequirementRepository;