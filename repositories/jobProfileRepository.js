const AppError = require('../utils/appError');

class JobProfileRepository {
    constructor(db) {
        this.db = db;
    }

    _groupJobProfiles(rows) {
        const map = new Map();

        for (const row of rows) {
            if (!map.has(row.jobProfileId)) {
                map.set(row.jobProfileId, {
                    jobProfileId: row.jobProfileId,
                    jobRole: row.jobRole,
                    jobOverview: row.jobOverview,
                    keyResponsibilities: row.keyResponsibilities,
                    requiredSkillsText: row.requiredSkillsText,
                    niceToHave: row.niceToHave,
                    experienceText: row.experienceText,
                    experienceMinYears: row.experienceMinYears,
                    experienceMaxYears: row.experienceMaxYears,
                    jdFileName: row.jdFileName,
                    jdOriginalName: row.jdOriginalName,
                    jdUploadDate: row.jdUploadDate,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    techSpecifications: []
                });
            }

            if (row.techSpecId) {
                map.get(row.jobProfileId).techSpecifications.push({
                    lookupId: row.techSpecId,
                    value: row.techSpecName
                });
            }
        }

        return Array.from(map.values());
    }

    async create(jobProfileData, client) {
        const connection = client;
        try {
            const query = `
                INSERT INTO jobProfile (
                    jobRole, 
                    jobOverview, 
                    keyResponsibilities, 
                    requiredSkillsText,
                    niceToHave,
                    experienceText,
                    experienceMinYears,
                    experienceMaxYears
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [result] = await connection.execute(query, [
                jobProfileData.jobRole,
                jobProfileData.jobOverview || null,
                jobProfileData.keyResponsibilities || null,
                jobProfileData.requiredSkillsText || null,
                jobProfileData.niceToHave || null,
                jobProfileData.experienceText || null,
                jobProfileData.experienceMinYears || null,
                jobProfileData.experienceMaxYears || null
            ]);

            return {
                jobProfileId: result.insertId,
                ...jobProfileData,
                createdAt: new Date()
            };
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async addTechSpecifications(jobProfileId, lookupIds, client) {
        const connection = client;
        try {
            if (!lookupIds || lookupIds.length === 0) {
                return;
            }

            const values = lookupIds.map(lookupId => [jobProfileId, lookupId]);
            const query = `
                INSERT INTO jobProfileTechSpec (jobProfileId, lookupId)
                VALUES ?
            `;

            await connection.query(query, [values]);
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async removeTechSpecifications(jobProfileId, client) {
        const connection = client;
        try {
            const query = `DELETE FROM jobProfileTechSpec WHERE jobProfileId = ?`;
            await connection.execute(query, [jobProfileId]);
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async getTechSpecifications(jobProfileId, client) {
        const connection = client;
        try {
            const query = `
                SELECT 
                    jpts.lookupId,
                    l.value as techSpecName
                FROM jobProfileTechSpec jpts
                INNER JOIN lookup l ON jpts.lookupId = l.lookupKey
                WHERE jpts.jobProfileId = ?
            `;
            const [rows] = await connection.execute(query, [jobProfileId]);
            return rows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async findById(jobProfileId, client) {
        const connection = client;
        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            const query = `SELECT
            jp.jobProfileId,
                jp.jobRole,
                jp.jobOverview,
                jp.keyResponsibilities,
                jp.requiredSkillsText,
                jp.niceToHave,
                jp.experienceText,
                jp.experienceMinYears,
                jp.experienceMaxYears,
                jp.jdFileName,
                jp.jdOriginalName,
                jp.jdUploadDate,
                jp.createdAt,
                jp.updatedAt,

                l.lookupKey AS techSpecId,
                    l.value AS techSpecName

        FROM jobProfile jp
        LEFT JOIN jobProfileTechSpec jpts
        ON jpts.jobProfileId = jp.jobProfileId
        LEFT JOIN lookup l
        ON l.lookupKey = jpts.lookupId
        AND l.tag = 'techSpecification'
        WHERE jp.jobProfileId = ?
        `;

            const [rows] = await connection.execute(query, [jobProfileId]);

            if (rows.length === 0) {
                return null;
            }

            const grouped = this._groupJobProfiles(rows);
            return grouped[0];
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async findByRole(jobRole, excludeId = null, client) {
        const connection = client;
        try {
            if (!jobRole) {
                throw new AppError('Job Role is required', 400, 'MISSING_JOB_ROLE');
            }

            let query = `
                SELECT jobProfileId 
                FROM jobProfile 
                WHERE jobRole = ?
            `;
            const params = [jobRole];

            if (excludeId) {
                query += ` AND jobProfileId != ?`;
                params.push(excludeId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            if (error instanceof AppError) throw error;
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
                return { jobProfileId };
            }

            const allowedFields = [
                'jobRole',
                'jobOverview',
                'keyResponsibilities',
                'requiredSkillsText',
                'niceToHave',
                'experienceText',
                'experienceMinYears',
                'experienceMaxYears'
            ];

            const filteredData = {};
            Object.keys(updateData).forEach(key => {
                if (allowedFields.includes(key)) {
                    filteredData[key] = updateData[key];
                }
            });

            if (Object.keys(filteredData).length === 0 && !updateData.techSpecLookupIds) {
                throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');
            }

            // Update job profile fields if present
            if (Object.keys(filteredData).length > 0) {
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
            }

            // Update technical specifications if provided
            if (updateData.techSpecLookupIds !== undefined) {
                await this.removeTechSpecifications(jobProfileId, connection);
                if (updateData.techSpecLookupIds.length > 0) {
                    await this.addTechSpecifications(jobProfileId, updateData.techSpecLookupIds, connection);
                }
            }

            return {
                jobProfileId,
                ...filteredData
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async delete(jobProfileId, client) {
        const connection = client;
        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
            }

            // Technical specifications will be deleted automatically due to CASCADE
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
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async findAll(limit = null, offset = null, client) {
        const connection = client;

        let query = `
        SELECT
        jp.jobProfileId,
        jp.jobRole,
        jp.jobOverview,
        jp.keyResponsibilities,
        jp.requiredSkillsText,
        jp.niceToHave,
        jp.experienceText,
        jp.experienceMinYears,
        jp.experienceMaxYears,
        jp.jdFileName,
        jp.jdOriginalName,
        jp.jdUploadDate,
        jp.createdAt,
        jp.updatedAt,

        l.lookupKey AS techSpecId,
        l.value AS techSpecName

        FROM jobProfile jp
        LEFT JOIN jobProfileTechSpec jpts
        ON jpts.jobProfileId = jp.jobProfileId
        LEFT JOIN lookup l
        ON l.lookupKey = jpts.lookupId
        AND l.tag = 'techSpecification'
        ORDER BY jp.createdAt DESC
        `;

        const params = [];
        if (limit !== null) {
            query += ` LIMIT ?`;
            params.push(limit);
            if (offset !== null) {
                query += ` OFFSET ?`;
                params.push(offset);
            }
        }

        const [rows] = await connection.execute(query, params);

        return this._groupJobProfiles(rows);
    }

    async count(client) {
        const connection = client;
        try {
            const query = `SELECT COUNT(*) as count FROM jobProfile`;
            const [rows] = await connection.execute(query);
            return rows[0].count;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async existsByRole(jobRole, excludeId = null, client) {
        const connection = client;
        try {
            if (!jobRole) {
                throw new AppError('Job Role is required', 400, 'MISSING_JOB_ROLE');
            }

            let query = `
                SELECT COUNT(*) as count 
                FROM jobProfile
                WHERE jobRole = ?
            `;
            const params = [jobRole];

            if (excludeId) {
                query += ` AND jobProfileId != ?`;
                params.push(excludeId);
            }

            const [rows] = await connection.execute(query, params);
            return rows[0].count > 0;
        } catch (error) {
            if (error instanceof AppError) throw error;
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
            if (error instanceof AppError) throw error;
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
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    async deleteJDInfo(jobProfileId, client) {
        const connection = client;
        try {
            if (!jobProfileId) {
                throw new AppError('Job Profile ID is required', 400, 'MISSING_JOB_PROFILE_ID');
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
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        }
    }

    _handleDatabaseError(error) {
        console.error('Database error:', error);

        switch (error.code) {
            case 'ER_DUP_ENTRY':
                throw new AppError(
                    'A job profile with this role already exists',
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