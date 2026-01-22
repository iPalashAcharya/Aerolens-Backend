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
            INSERT INTO jobProfileRequirement (
                clientId, departmentId, jobProfileDescription, jobRole, 
                techSpecification, positions, receivedOn, estimatedCloseDate, locationId, workArrangement, statusId
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?,?)
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
                jobProfileData.workArrangement,
                jobProfileData.statusId
            ]);

            return {
                jobProfileRequirementId: result.insertId,
                ...jobProfileData,
                receivedOn: new Date()
            };
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async findById(jobProfileRequirementId, client) {
        const connection = client;

        try {
            if (!jobProfileRequirementId) {
                throw new AppError('Job Profile Requirement ID is required', 400, 'MISSING_JOB_PROFILE_REQUIREMENT_ID');
            }

            const query = `
            SELECT jp.jobProfileRequirementId, c.clientId ,c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, DATE(jp.receivedOn) AS receivedOn, jp.estimatedCloseDate, jp.workArrangement,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status,
                   jp.jdFileName, jp.jdOriginalName, jp.jdUploadDate
            FROM jobProfileRequirement jp
            LEFT JOIN client c ON jp.clientId=c.clientId
            LEFT JOIN department d ON jp.departmentId = d.departmentId
            LEFT JOIN lookup stat on jp.statusId = stat.lookupKey AND stat.tag = 'profileStatus'
            WHERE jp.jobProfileRequirementId = ?
            ORDER BY jp.receivedOn DESC
            `;

            const [rows] = await connection.execute(query, [jobProfileRequirementId]);
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

    async update(jobProfileRequirementId, updateData, client) {
        const connection = client;

        try {
            if (!jobProfileRequirementId) {
                throw new AppError('Job Profile Requirement ID is required', 400, 'MISSING_JOB_PROFILE_REQUIREMENT_ID');
            }

            if (!updateData || Object.keys(updateData).length === 0) {
                return { jobProfileRequirementId };
            }

            // Filter only allowed fields for security
            const allowedFields = [
                'jobProfileDescription', 'jobRole',
                'techSpecification', 'positions', 'estimatedCloseDate', 'locationId', 'workArrangement', 'statusId'
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
                    `Job profile with ID ${jobProfileRequirementId} not found`,
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
                    `Job profile with ID ${jobProfileRequirementId} not found`,
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
            SELECT jp.jobProfileRequirementId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,jp.workArrangement,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfileRequirement jp
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
            SELECT jp.jobProfileRequirementId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,jp.workArrangement,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfileRequirement jp
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
            SELECT jp.jobProfileRequirementId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, jp.receivedOn, jp.estimatedCloseDate,jp.workArrangement,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status
            FROM jobProfileRequirement jp
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

            const query = `SELECT COUNT(*) as count FROM jobProfileRequirement WHERE clientId = ?`;
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
            FROM jobProfileRequirement
            WHERE jobRole = ? AND clientId = ?
            `;
            const params = [jobRole, clientId];

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
            SELECT jp.jobProfileRequirementId, c.clientName, d.departmentName, jp.jobProfileDescription, jp.jobRole,
                   jp.techSpecification, jp.positions, DATE(jp.receivedOn) AS receivedOn, jp.estimatedCloseDate,jp.workArrangement,
                   COALESCE((SELECT JSON_OBJECT('country',l.country,'city',l.cityName) FROM location l WHERE l.locationId = jp.locationId)) AS location, stat.value AS status,
                   jp.jdFileName, jp.jdOriginalName, jp.jdUploadDate
            FROM jobProfileRequirement jp
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

    async updateJDInfo(jobProfileId, jdFilename, jdOriginalName, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `
            UPDATE jobProfile 
            SET jdFileName = ?, 
                jdOriginalName = ?, 
                jdUploadDate = NOW()
            WHERE jobProfileId = ?
        `;

            const [result] = await connection.execute(query, [jdFilename, jdOriginalName, jobProfileId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
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

    async getJDInfo(jobProfileId, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `
            SELECT jdFileName, jdOriginalName, jdUploadDate
            FROM jobProfile 
            WHERE jobProfileId = ?
        `;

            const [rows] = await connection.execute(query, [jobProfileId]);
            return rows[0] || null;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error);
        }
    }

    async deleteJDInfo(jobProfileId, client) {
        const connection = client;

        try {
            if (!jobProfileId) {
                throw new AppError('JOb Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `
            UPDATE jobProfile 
            SET jdFileName = NULL, 
                jdOriginalName = NULL, 
                jdUploadDate = NULL
            WHERE jobProfileId = ?
        `;

            const [result] = await connection.execute(query, [jobProfileId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
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