const AppError = require('../utils/appError');

class InterviewRepository {
    constructor(db) {
        this.db = db;
    }

    _getDateRange(dateString) {
        const startDate = dateString;

        const dateParts = dateString.split('-');
        const nextDay = new Date(Date.UTC(
            parseInt(dateParts[0]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[2]) + 1
        ));

        const year = nextDay.getUTCFullYear();
        const month = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
        const day = String(nextDay.getUTCDate()).padStart(2, '0');
        const endDate = `${year}-${month}-${day}`;

        return { startDate, endDate };
    }

    async getSummary(client) {
        const connection = client;

        try {
            const interviewerQuery = `
            SELECT
            i.interviewerId,
            m.memberName AS interviewerName,
            COUNT(i.interviewId) AS total,

            SUM(CASE WHEN i.result = 'selected' THEN 1 ELSE 0 END) AS selected,
            SUM(CASE WHEN i.result = 'rejected' THEN 1 ELSE 0 END) AS rejected,
            SUM(CASE WHEN i.result = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN i.result = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,

            AVG(i.durationMinutes) AS avgDuration,
            SUM(i.durationMinutes) AS totalMinutes
            FROM interview i
            JOIN member m ON m.memberId = i.interviewerId
            WHERE i.deletedAt IS NULL
            GROUP BY i.interviewerId, m.memberName
            ORDER BY interviewerName;
        `;

            const [interviewerData] = await connection.query(interviewerQuery);

            return {
                interviewers: interviewerData
            };

        } catch (error) {
            this._handleDatabaseError(error, "getSummary");
        }
    }

    async getMonthlySummary(client, startDate, endDate) {
        const connection = client;

        try {
            // Use inclusive date range for monthly summary
            const summaryQuery = `
            SELECT
                COUNT(interviewId) AS total,
                SUM(CASE WHEN result = 'selected' THEN 1 ELSE 0 END) AS selected,
                SUM(CASE WHEN result = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN result = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN result = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
            FROM interview
            WHERE interviewDate >= ? AND interviewDate <= ? AND deletedAt IS NULL;
            `;

            const [summaryData] = await connection.query(summaryQuery, [
                startDate,
                endDate
            ]);

            const interviewerQuery = `
            SELECT
                m.memberId AS interviewerId,
                m.memberName AS interviewerName,

                COUNT(i.interviewId) AS total,
                SUM(CASE WHEN i.result = 'selected' THEN 1 ELSE 0 END) AS selected,
                SUM(CASE WHEN i.result = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN i.result = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN i.result = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,

                AVG(i.durationMinutes) AS avgDuration,
                SUM(i.durationMinutes) AS totalMinutes

            FROM member m
            LEFT JOIN interview i
                ON i.interviewerId = m.memberId
                AND i.interviewDate >= ? AND i.interviewDate <= ? AND i.deletedAt IS NULL

            GROUP BY m.memberId, m.memberName
            HAVING total > 0
            ORDER BY interviewerName;
            `;

            const [interviewerData] = await connection.query(interviewerQuery, [
                startDate,
                endDate
            ]);

            const dateQuery = `
            SELECT DISTINCT interviewDate
            FROM interview
            WHERE interviewDate >= ? AND interviewDate <= ? AND deletedAt IS NULL
            ORDER BY interviewDate;
            `;

            const [datesData] = await connection.query(dateQuery, [
                startDate,
                endDate
            ]);

            return {
                summary: summaryData[0],
                interviewers: interviewerData,
                interviewDates: datesData
            };

        } catch (error) {
            this._handleDatabaseError(error, "getMonthlySummary");
        }
    }

    async getDailySummary(client, date) {
        const connection = client;

        try {
            const query = `
            SELECT
                m.memberId AS interviewerId,
                m.memberName AS interviewerName,

                i.interviewId,
                i.candidateId,
                c.candidateName,
                i.interviewDate,
                TIME_FORMAT(i.fromTime, '%H:%i') AS fromTime,
                TIME_FORMAT(i.toTime, '%H:%i') AS toTime,
                i.roundNumber,
                i.totalInterviews,
                i.durationMinutes,
                i.recruiterNotes,
                i.result

            FROM interview i
            JOIN member m ON m.memberId = i.interviewerId
            LEFT JOIN candidate c ON c.candidateId = i.candidateId

            WHERE i.interviewDate = ?
              AND i.deletedAt IS NULL

            ORDER BY m.memberName, i.fromTime;
        `;

            const [rows] = await connection.query(query, [date]);

            return { interviews: rows };

        } catch (error) {
            this._handleDatabaseError(error, "getDailySummary");
        }
    }

    async getAll(limit, page, client) {
        const connection = client;
        try {
            /*const offset = (page - 1) * limit;
            const countQuery = `SELECT COUNT(lookupKey) as total FROM lookup`;
            const [countResult] = await connection.query(countQuery);
            const totalRecords = countResult[0].total;
            const dataQuery = `
                SELECT tag, lookupKey, value FROM lookup 
                LIMIT ? OFFSET ?
            `;*/
            const dataQuery = `
                SELECT
                i.interviewId,
                i.roundNumber,
                i.totalInterviews,
                i.interviewDate,
                TIME_FORMAT(i.fromTime, '%H:%i') AS fromTime,
                TIME_FORMAT(i.toTime,'%H:%i') AS toTime,
                i.durationMinutes,
                c.candidateId,
                c.candidateName,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName,
                scheduler.memberId AS scheduledById,
                COALESCE(scheduler.memberName, 'Unknown') AS scheduledByName,
                i.result,
                i.recruiterNotes,
                i.interviewerFeedback,
                i.isActive
            FROM interview i
            LEFT JOIN candidate c
                ON i.candidateId = c.candidateId
            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId
            LEFT JOIN member scheduler
                ON i.scheduledById = scheduler.memberId
            WHERE i.isActive=TRUE AND i.deletedAt IS NULL;
            `;
            /*const numLimit = Math.max(1, parseInt(limit, 10) ?? 10);
            const numOffset = Math.max(0, parseInt(offset, 10) ?? 0);*/

            //const params = [numLimit, numOffset];
            const [interviewData] = await connection.query(dataQuery);
            return {
                data: interviewData,
                //totalRecords: totalRecords
            };
        } catch (error) {
            this._handleDatabaseError(error, 'getAll');
        }
    }

    async getById(interviewId, client) {
        const connection = client;
        try {
            const dataQuery = `
                SELECT
                i.interviewId,
                i.roundNumber,
                i.totalInterviews,
                i.interviewDate,
                TIME_FORMAT(i.fromTime, '%H:%i') AS fromTime,
                TIME_FORMAT(i.toTime,'%H:%i') AS toTime,
                i.durationMinutes,
                c.candidateId,
                c.candidateName,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName,
                scheduler.memberId AS scheduledById,
                COALESCE(scheduler.memberName, 'Unknown') AS scheduledByName,
                i.result,
                i.recruiterNotes,
                i.interviewerFeedback
            FROM interview i
            LEFT JOIN candidate c
                ON i.candidateId = c.candidateId
            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId
            LEFT JOIN member scheduler
                ON i.scheduledById = scheduler.memberId
            WHERE i.interviewId = ? AND i.isActive=TRUE;
            `;
            const [interviewData] = await connection.query(dataQuery, [interviewId]);
            return {
                data: interviewData.length > 0 ? interviewData[0] : null
            }
        } catch (error) {
            this._handleDatabaseError(error, 'getById');
        }
    }

    async getInterviewsByCandidateId(candidateId, client) {
        const connection = client;
        try {
            const query = `
                SELECT
                i.interviewId,
                i.roundNumber,
                i.totalInterviews,
                i.interviewDate,
                TIME_FORMAT(i.fromTime, '%H:%i') AS fromTime,
                TIME_FORMAT(i.toTime,'%H:%i') AS toTime,
                i.durationMinutes,
                i.result,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName
            FROM interview i
            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId
            WHERE i.candidateId = ? AND i.isActive=TRUE
            ORDER BY i.roundNumber;
            `;
            const [interviews] = await connection.query(query, [candidateId]);
            return interviews;
        } catch (error) {
            this._handleDatabaseError(error, 'getInterviewsByCandidateId');
        }
    }

    async getLatestRoundNumber(candidateId, client) {
        const connection = client;
        try {
            const query = `
                SELECT MAX(roundNumber) as latestRound, COUNT(*) as totalInterviews
                FROM interview
                WHERE candidateId = ? AND isActive=TRUE;
            `;
            const [result] = await connection.query(query, [candidateId]);
            return {
                latestRound: result[0]?.latestRound || 0,
                totalInterviews: result[0]?.totalInterviews || 0
            };
        } catch (error) {
            this._handleDatabaseError(error, 'getLatestRoundNumber');
        }
    }

    async getInterviewRounds(interviewId, client) {
        const connection = client;

        try {
            const query = `
            SELECT 
                r.roundNumber,
                rt.value AS roundName,
                rt.lookupKey AS roundTypeId,
                m.memberId AS interviewerId,
                m.memberName AS interviewerName,
                r.feedback
            FROM interview_rounds r
            LEFT JOIN lookup rt 
                ON r.roundTypeId = rt.lookupKey 
                AND rt.tag = 'InterviewRound'
            LEFT JOIN member m 
                ON r.interviewerId = m.memberId
            WHERE r.interviewId = ?;
        `;

            const [rounds] = await connection.query(query, [interviewId]);
            return { rounds };

        } catch (error) {
            this._handleDatabaseError(error, 'getInterviewRounds');
        }
    }

    async getFormData(client, interviewId = null) {
        const connection = client;

        /*const interviewPromise = interviewId
            ? connection.query(
                `SELECT
                i.interviewId,
                i.interviewDate,
                i.fromTime,
                i.durationMinutes,
                c.candidateId,
                c.candidateName,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName,
                scheduler.memberId AS scheduledById,
                scheduler.memberName AS scheduledByName,
                i.result,
                i.recruiterNotes,
                i.interviewerFeedback
            FROM interview i
            LEFT JOIN candidate c
                ON i.candidateId = c.candidateId
            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId
            LEFT JOIN member scheduler
                ON i.scheduledById = scheduler.memberId
            WHERE i.interviewId = ? AND i.isActive=TRUE;`,
                [interviewId]
            )
            // FIX: return mysql2-like structure [rows, fields]
            : Promise.resolve([[], []]);*/

        const interviewersPromise = connection.query(`
        SELECT memberId AS interviewerId, memberName AS interviewerName
        FROM member
        WHERE isInterviewer=TRUE AND isActive = TRUE;
    `);

        const recruitersPromise = connection.query(`
        SELECT memberId AS recruiterId, memberName AS recruiterName
        FROM member
        WHERE isRecruiter=TRUE AND isActive = TRUE
    `);

        const [interviewers, recruiters] =
            await Promise.all([
                //interviewPromise,
                interviewersPromise,
                recruitersPromise,
            ]);

        return {
            //interview: null,
            interviewers: interviewers[0],
            recruiters: recruiters[0]
        };
    }
    /*async replaceInterviewRounds(interviewId, rounds, client) {
        const connection = client;

        try {
            await connection.execute(
                `DELETE FROM interview_rounds WHERE interviewId = ?`,
                [interviewId]
            );

            if (rounds && rounds.length > 0) {
                const values = rounds.map(round => [
                    interviewId,
                    round.roundNumber,
                    round.roundTypeId,
                    round.interviewerId,
                    round.feedback || null
                ]);

                const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(',');
                const flatValues = values.flat();

                await connection.execute(
                    `INSERT INTO interview_rounds (interviewId, roundNumber, roundTypeId, interviewerId, feedback) 
                     VALUES ${placeholders}`,
                    flatValues
                );
            }

            return { success: true, roundsCount: rounds?.length || 0 };
        } catch (error) {
            throw new AppError(
                'Database error while replacing interview rounds',
                500,
                'DB_ERROR',
                error.message
            );
        }
    }*/

    async renumberCandidateRounds(candidateId, client) {
        const connection = client;

        // Get all active interviews for this candidate, ordered by date and time
        const [rows] = await connection.query(
            `SELECT interviewId
             FROM interview
             WHERE candidateId = ? AND isActive = TRUE
             ORDER BY interviewDate ASC, fromTime ASC, interviewId ASC`,
            [candidateId]
        );

        const totalInterviews = rows.length;

        // Update each interview with correct round number and total
        let roundNumber = 1;
        for (const row of rows) {
            await connection.execute(
                `UPDATE interview
                 SET roundNumber = ?, totalInterviews = ?
                 WHERE interviewId = ?`,
                [roundNumber, totalInterviews, row.interviewId]
            );
            roundNumber++;
        }

        return totalInterviews;
    }

    async create(candidateId, interviewData, client) {
        const connection = client;
        try {
            const { latestRound, totalInterviews } = await this.getLatestRoundNumber(candidateId, client);

            const newRoundNumber = latestRound + 1;
            const newTotalInterviews = totalInterviews + 1;

            const [result] = await connection.execute(
                `INSERT INTO interview(
                candidateId,
                roundNumber,
                totalInterviews,
                interviewDate,
                fromTime,
                durationMinutes,
                interviewerId,
                scheduledById,
                result,
                interviewerFeedback,
                recruiterNotes
                )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    candidateId,
                    newRoundNumber,
                    newTotalInterviews,
                    interviewData.interviewDate,
                    interviewData.fromTime,
                    interviewData.durationMinutes,
                    interviewData.interviewerId,
                    interviewData.scheduledById,
                    interviewData.result || 'pending',
                    interviewData.interviewerFeedback || null,
                    interviewData.recruiterNotes || null
                ]
            );

            await connection.execute(
                `UPDATE interview 
                SET totalInterviews = ? 
                WHERE candidateId = ? AND interviewId != ?`,
                [newTotalInterviews, candidateId, result.insertId]
            );

            return {
                interviewId: result.insertId,
                candidateId,
                roundNumber: newRoundNumber,
                totalInterviews: newTotalInterviews,
                ...interviewData
            };
        } catch (error) {
            console.error('DB error in interviewRepository.create', error);
            this._handleDatabaseError(error, 'create');
        }
    }

    async update(interviewId, interviewData, client) {
        const connection = client;
        try {
            if (!interviewId) {
                throw new AppError('Interview ID is required', 400, 'MISSING_INTERVIEW_ID');
            }

            if (!interviewData || Object.keys(interviewData).length === 0) {
                throw new AppError('Interview data is required', 400, 'MISSING_INTERVIEW_DATA');
            }

            const allowedFields = [
                'interviewDate', 'fromTime', 'durationMinutes', 'interviewerId', 'scheduledById'
            ];

            const filteredData = {};
            Object.keys(interviewData).forEach(key => {
                if (allowedFields.includes(key)) {
                    filteredData[key] = interviewData[key];
                }
            });

            if (Object.keys(filteredData).length === 0) {
                throw new AppError('No valid fields to update', 400, 'NO_VALID_FIELDS');
            }

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE interview SET ${setClause} WHERE interviewId = ?`;

            const [result] = await connection.execute(query, [...values, interviewId]);
            if (result.affectedRows === 0) {
                throw new AppError(
                    `Interview entry with Id ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND',
                );
            }

            const [interviewRow] = await connection.query(
                `SELECT candidateId FROM interview WHERE interviewId = ?`,
                [interviewId]
            );

            return {
                interviewId,
                candidateId: interviewRow[0]?.candidateId,
                ...interviewData
            }
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error, 'update');
        }
    }

    async finalize(interviewId, finalData, client) {
        const connection = client;
        try {
            if (!interviewId) {
                throw new AppError('Interview ID is required', 400, 'MISSING_INTERVIEW_ID');
            }

            if (!finalData || Object.keys(finalData).length === 0) {
                throw new AppError('Final data is required', 400, 'MISSING_FINAL_DATA');
            }

            const allowedFields = ['result', 'recruiterNotes', 'interviewerFeedback'];

            const filteredData = {};
            Object.keys(finalData).forEach(key => {
                if (allowedFields.includes(key)) {
                    filteredData[key] = finalData[key];
                }
            });

            if (Object.keys(filteredData).length === 0) {
                throw new AppError('No valid fields to finalize', 400, 'NO_VALID_FIELDS');
            }

            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);

            const setClause = fields.map(field => `${field} = ?`).join(', ');
            const query = `UPDATE interview SET ${setClause} WHERE interviewId = ?`;

            const [result] = await connection.execute(query, [...values, interviewId]);
            if (result.affectedRows === 0) {
                throw new AppError(
                    `Interview entry with Id ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND'
                );
            }
            return {
                interviewId,
                ...filteredData
            }
        } catch (error) {
            if (error instanceof AppError) { throw error; }
            this._handleDatabaseError(error, 'finalize');
        }
    }

    async delete(interviewId, client) {
        try {
            const [interviewRow] = await client.query(
                `SELECT candidateId FROM interview WHERE interviewId = ?`,
                [interviewId]
            );

            const [result] = await client.execute(
                `UPDATE interview SET isActive=FALSE WHERE interviewId=?`,
                [interviewId]
            );

            return {
                success: result.affectedRows > 0,
                candidateId: interviewRow[0]?.candidateId
            };
        } catch (error) {
            this._handleDatabaseError(error, 'delete');
        }
    }

    async exists(interviewId, client) {
        const connection = client;
        try {
            const [result] = await connection.execute(
                `SELECT interviewId, candidateId FROM interview WHERE interviewId = ?`,
                [interviewId]
            );
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            this._handleDatabaseError(error, 'exists');
        }
    }

    async softDeleteByCandidateId(candidateId, client) {
        const connection = client;
        try {
            const query = `UPDATE interview 
                       SET deletedAt = NOW(),isActive = FALSE 
                       WHERE candidateId = ? AND deletedAt IS NULL`;
            const [result] = await connection.execute(query, [candidateId]);
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async softDeleteByInterviewerId(interviewerId, client) {
        const connection = client;
        try {
            const query = `UPDATE interview 
                       SET deletedAt = NOW() , isActive = FALSE
                       WHERE interviewerId = ? AND deletedAt IS NULL`;
            const [result] = await connection.execute(query, [interviewerId]);
            return result.affectedRows;
        } catch (error) {
            this._handleDatabaseError(error);
        }
    }

    async permanentlyDeleteBatch(interviewIds, client) {
        const connection = client;
        try {
            if (!interviewIds || interviewIds.length === 0) {
                return 0;
            }

            const placeholders = interviewIds.map(() => '?').join(',');
            const query = `DELETE FROM interview WHERE interviewId IN (${placeholders})`;

            const [result] = await connection.execute(query, interviewIds);

            return result.affectedRows;
        } catch (error) {
            if (error instanceof AppError) { throw error; }
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

module.exports = InterviewRepository;