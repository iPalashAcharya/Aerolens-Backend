const AppError = require('../utils/appError');

class CandidateRepository {
    constructor(db) {
        this.db = db;
    }
    async create(candidateData, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const query = `INSERT INTO candidate(candidateName,contactNumber,email,recruiterName,jobRole,preferredJobLocation,currentCTC,expectedCTC,noticePeriod,experienceYears,linkedinProfileUrl,statusId, resumeFilename, resumeOriginalName, resumeUploadDate)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`
            console.log(candidateData);

            const [result] = await connection.execute(query, [
                candidateData.candidateName,
                candidateData.contactNumber,
                candidateData.email,
                candidateData.recruiterName,
                candidateData.jobRole,
                candidateData.preferredJobLocation !== undefined ? candidateData.preferredJobLocation : null,
                candidateData.currentCTC,
                candidateData.expectedCTC,
                candidateData.noticePeriod,
                candidateData.experienceYears,
                candidateData.linkedinProfileUrl,
                candidateData.statusId !== undefined ? candidateData.statusId : 9,
                null,
                null,
                null
            ]);

            return {
                candidateId: result.insertId,
                ...candidateData,
                createdOn: new Date()
            };
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }
    async findById(candidateId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            const query = `
            SELECT c.candidateId,c.candidateName,c.contactNumber,c.email,c.recruiterName,c.jobRole,loc.value AS preferredJobLocation,c.currentCTC,c.expectedCTC,c.noticePeriod,c.experienceYears,c.linkedinProfileUrl,stat.value AS statusName, c.resumeFilename, c.resumeOriginalName, c.resumeUploadDate
            FROM candidate c
            LEFT JOIN lookup stat ON c.statusId= stat.lookupKey AND stat.tag = 'candidateStatus'
            LEFT JOIN lookup loc ON c.preferredJobLocation = loc.lookupKey AND loc.tag = 'location'
            WHERE c.candidateId = ? 
            `;

            const [rows] = await connection.execute(query, [candidateId]);
            return rows[0] || null;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }
    async findByEmail(email, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!email) {
                throw new AppError('Email is required', 400, 'MISSING_EMAIL');
            }

            const query = `
            SELECT c.candidateId, c.candidateName, c.contactNumber, c.email, c.recruiterName, 
                   c.jobRole, loc.value AS preferredJobLocation, c.currentCTC, c.expectedCTC, c.noticePeriod, 
                   c.experienceYears, c.linkedinProfileUrl, c.createdAt, c.updatedAt,
                   stat.value AS statusName, c.resumeFilename, c.resumeOriginalName, c.resumeUploadDate
            FROM candidate c
            LEFT JOIN lookup stat ON c.statusId = stat.lookupKey and stat.tag = 'candidateStatus'
            LEFT JOIN lookup loc ON c.preferredJobLocation = loc.lookupKey and loc.tag = 'location'
            WHERE c.email = ?`;

            const [rows] = await connection.execute(query, [email]);
            return rows[0] || null;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }
    async findByContactNumber(contactNumber, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!contactNumber) {
                throw new AppError('Contact number is required', 400, 'MISSING_CONTACT_NUMBER');
            }

            const query = `
            SELECT c.candidateId, c.candidateName, c.contactNumber, c.email, c.recruiterName,
                   c.jobRole, loc.value AS preferredJobLocation, c.currentCTC, c.expectedCTC, c.noticePeriod,
                   c.experienceYears, c.linkedinProfileUrl, c.createdAt, c.updatedAt,
                   stat.value AS statusName, c.resumeFilename, c.resumeOriginalName, c.resumeUploadDate
            FROM candidate c
            LEFT JOIN lookup stat ON c.statusId = stat.lookupKey and stat.tag = 'candidateStatus'
            LEFT JOIN lookup loc ON c.preferredJobLocation = loc.lookupKey and loc.tag = 'location'
            WHERE c.contactNumber = ?`;

            const [rows] = await connection.execute(query, [contactNumber]);
            return rows[0] || null;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }
    async findByStatus(statusId, limit = null, offset = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!statusId) {
                throw new AppError('Status ID is required', 400, 'MISSING_STATUS_ID');
            }

            let query = `
            SELECT c.candidateId, c.candidateName, c.contactNumber, c.email, c.recruiterName,
                   c.jobRole, loc.value AS preferredJobLocation, c.currentCTC, c.expectedCTC, c.noticePeriod,
                   c.experienceYears, c.linkedinProfileUrl, c.createdAt, c.updatedAt,
                   stat.value AS statusName, c.resumeFilename, c.resumeUploadDate, c.resumeOriginalName
            FROM candidate c
            LEFT JOIN lookup stat ON c.statusId = stat.lookupKey and stat.tag = 'candidateStatus'
            LEFT JOIN lookup loc ON c.preferredJobLocation = loc.lookupKey and loc.tag = 'location'
            WHERE c.statusId = ?
            ORDER BY c.createdAt DESC`;

            const params = [statusId];

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
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }
    async searchCandidates(searchOptions = {}, limit = null, offset = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `
            SELECT c.candidateId, c.candidateName, c.contactNumber, c.email, c.recruiterName,
                   c.jobRole, loc.value AS preferredJobLocation, c.currentCTC, c.expectedCTC, c.noticePeriod,
                   c.experienceYears, c.linkedinProfileUrl, c.createdAt, c.updatedAt,
                   stat.value AS statusName, c.resumeFilename, c.resumeOriginalName, c.resumeUploadDate
            FROM candidate c
            LEFT JOIN lookup stat ON c.statusId = stat.lookupKey and stat.tag = 'candidateStatus'
            LEFT JOIN lookup loc ON c.preferredJobLocation = loc.lookupKey and loc.tag = 'location'
            WHERE 1=1`;

            const params = [];

            if (searchOptions.candidateName) {
                query += ` AND c.candidateName LIKE ?`;
                params.push(`%${searchOptions.candidateName}%`);
            }

            if (searchOptions.email) {
                query += ` AND c.email LIKE ?`;
                params.push(`%${searchOptions.email}%`);
            }

            if (searchOptions.jobRole) {
                query += ` AND c.jobRole LIKE ?`;
                params.push(`%${searchOptions.jobRole}%`);
            }

            if (searchOptions.preferredJobLocation) {
                query += ` AND loc.value = ?`;
                params.push(searchOptions.preferredJobLocation);
            }

            if (searchOptions.recruiterName) {
                query += ` AND c.recruiterName LIKE ?`;
                params.push(`%${searchOptions.recruiterName}%`);
            }

            if (searchOptions.minExperience) {
                query += ` AND c.experienceYears >= ?`;
                params.push(searchOptions.minExperience);
            }

            if (searchOptions.maxExperience) {
                query += ` AND c.experienceYears <= ?`;
                params.push(searchOptions.maxExperience);
            }

            if (searchOptions.minCurrentCTC) {
                query += ` AND c.currentCTC >= ?`;
                params.push(searchOptions.minCurrentCTC);
            }

            if (searchOptions.maxCurrentCTC) {
                query += ` AND c.currentCTC <= ?`;
                params.push(searchOptions.maxCurrentCTC);
            }

            if (searchOptions.statusId) {
                query += ` AND c.statusId = ?`;
                params.push(searchOptions.statusId);
            }

            query += ` ORDER BY c.createdAt DESC`;

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
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async update(candidateId, updateData, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            if (!updateData || Object.keys(updateData).length === 0) {
                throw new AppError('Update data is required', 400, 'MISSING_UPDATE_DATA');
            }

            // Filter only allowed fields for security
            const allowedFields = [
                'candidateName', 'contactNumber', 'email', 'recruiterName',
                'jobRole', 'preferredJobLocation', 'currentCTC', 'expectedCTC', 'noticePeriod', 'experienceYears', 'linkedinProfileUrl', 'statusId', 'resume'
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
            console.log("Filtered data values and their types:");
            Object.entries(filteredData).forEach(([key, val]) => {
                console.log(key, typeof val, val);
            });

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE candidate SET ${setClause}, updatedAt = NOW() WHERE candidateId = ?`;

            const [result] = await connection.execute(query, [...values, candidateId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }
    async updateStatus(candidateId, statusId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            if (!statusId) {
                throw new AppError('Status ID is required', 400, 'MISSING_STATUS_ID');
            }

            const query = `UPDATE candidate SET statusId = ?, updatedAt = NOW() WHERE candidateId = ?`;
            const [result] = await connection.execute(query, [statusId, candidateId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async delete(candidateId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            const query = `DELETE FROM candidate WHERE candidateId = ?`;
            const [result] = await connection.execute(query, [candidateId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async findAll(limit = 10, offset = 0, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            const query = `
            SELECT c.candidateId, c.candidateName, c.contactNumber, c.email, c.recruiterName,
                   c.jobRole, loc.value AS preferredJobLocation, c.currentCTC, c.expectedCTC, c.noticePeriod,
                   c.experienceYears, c.linkedinProfileUrl, c.createdAt, c.updatedAt,
                   stat.value AS statusName, c.resumeFilename, c.resumeOriginalName, c.resumeUploadDate
            FROM candidate c
            LEFT JOIN lookup stat ON c.statusId = stat.lookupKey and stat.tag = 'candidateStatus'
            LEFT JOIN lookup loc ON c.preferredJobLocation = loc.lookupKey and loc.tag = 'location'
            LIMIT ? OFFSET ?
        `;

            const numLimit = Math.max(1, parseInt(limit, 10) || 10);
            const numOffset = Math.max(0, parseInt(offset, 10) || 0);

            const params = [numLimit, numOffset];

            // Use query instead of execute
            const [rows] = await connection.query(query, params);
            return rows;
        } catch (error) {
            console.error('Database error:', error);
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async getCount(statusId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT COUNT(*) as count FROM candidate`;
            const params = [];

            if (statusId) {
                query += ` WHERE statusId = ?`;
                params.push(statusId);
            }

            const [rows] = await connection.execute(query, params);
            return rows[0].count;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    /*async getCandidateStatistics(client = null) {
        const connection = client || await this.db.getConnection();

        try {
            const query = `
            SELECT 
                COUNT(*) as totalCandidates,
                COUNT(CASE WHEN statusId = 1 THEN 1 END) as activeCandidates,
                COUNT(CASE WHEN statusId = 2 THEN 1 END) as inactiveCandidates,
                AVG(currentCTC) as avgCurrentCTC,
                AVG(expectedCTC) as avgExpectedCTC,
                AVG(experienceYears) as avgExperience,
                COUNT(CASE WHEN preferredJobLocation = 'Ahmedabad' THEN 1 END) as ahmedabadCandidates,
                COUNT(CASE WHEN preferredJobLocation = 'Bangalore' THEN 1 END) as bangaloreCandidates
            FROM candidate`;

            const [rows] = await connection.execute(query);
            return rows[0];
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }*/

    async checkEmailExists(email, excludeCandidateId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT candidateId FROM candidate WHERE email = ?`;
            const params = [email];

            if (excludeCandidateId) {
                query += ` AND candidateId != ?`;
                params.push(excludeCandidateId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async checkContactExists(contactNumber, excludeCandidateId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT candidateId FROM candidate WHERE contactNumber = ?`;
            const params = [contactNumber];

            if (excludeCandidateId) {
                query += ` AND candidateId != ?`;
                params.push(excludeCandidateId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0;
        } catch (error) {
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async updateResumeInfo(candidateId, resumeFilename, originalName, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            const query = `
            UPDATE candidate 
            SET resumeFilename = ?, 
                resumeOriginalName = ?, 
                resumeUploadDate = NOW(),
                updatedAt = NOW()
            WHERE candidateId = ?
        `;

            const [result] = await connection.execute(query, [resumeFilename, originalName, candidateId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async getResumeInfo(candidateId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            const query = `
            SELECT resumeFilename, resumeOriginalName, resumeUploadDate
            FROM candidate 
            WHERE candidateId = ?
        `;

            const [rows] = await connection.execute(query, [candidateId]);
            return rows[0] || null;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
        }
    }

    async deleteResumeInfo(candidateId, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            if (!candidateId) {
                throw new AppError('Candidate ID is required', 400, 'MISSING_CANDIDATE_ID');
            }

            const query = `
            UPDATE candidate 
            SET resumeFilename = NULL, 
                resumeOriginalName = NULL, 
                resumeUploadDate = NULL,
                updatedAt = NOW()
            WHERE candidateId = ?
        `;

            const [result] = await connection.execute(query, [candidateId]);

            if (result.affectedRows === 0) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) throw error;
            this._handleDatabaseError(error);
        } finally {
            if (!client) connection.release();
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

module.exports = CandidateRepository;