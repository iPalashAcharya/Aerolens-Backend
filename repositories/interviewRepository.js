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

    async getMonthlySummary(client, startUTC, endUTC) {
        const connection = client;
        try {
            const summaryQuery = `
            SELECT
                COUNT(interviewId) AS total,
                SUM(CASE WHEN result = 'selected' THEN 1 ELSE 0 END) AS selected,
                SUM(CASE WHEN result = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN result = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN result = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
            FROM interview
            WHERE deletedAt IS NULL
            AND fromTimeUTC >= ?
            AND fromTimeUTC <= ?;
        `;

            const [summaryData] = await connection.query(summaryQuery, [startUTC, endUTC]);

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
                AND i.fromTimeUTC >= ?
                AND i.fromTimeUTC <= ?
                AND i.deletedAt IS NULL
            GROUP BY m.memberId, m.memberName
            HAVING total > 0
            ORDER BY interviewerName;
        `;

            const [interviewerData] = await connection.query(interviewerQuery, [startUTC, endUTC]);

            const dateQuery = `
            SELECT DISTINCT fromTimeUTC AS interviewTimeStamp
            FROM interview
            WHERE fromTimeUTC >= ?
            AND fromTimeUTC <= ?
            AND deletedAt IS NULL
            ORDER BY interviewTimeStamp;
        `;

            const [datesData] = await connection.query(dateQuery, [startUTC, endUTC]);

            return {
                summary: summaryData[0],
                interviewers: interviewerData,
                interviewTimeStamp: datesData
            };
        } catch (error) {
            this._handleDatabaseError(error, "getMonthlySummary");
        }
    }

    async getDailySummary(client, startUTC, endUTC) {
        const connection = client;

        try {
            const query = `
            SELECT
                m.memberId AS interviewerId,
                m.memberName AS interviewerName,

                i.interviewId,
                i.candidateId,
                c.candidateName,
                DATE(i.fromTimeUTC) AS interviewDate,
                DATE_FORMAT(i.fromTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS fromTime,
                DATE_FORMAT(i.toTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS toTime,
                i.eventTimezone,
                RANK() OVER (
                PARTITION BY i.candidateId
                ORDER BY i.fromTimeUTC, i.interviewId
                ) AS roundNumber,
                COUNT(*) OVER (PARTITION BY candidateId) AS totalInterviews,
                i.durationMinutes,
                i.recruiterNotes,
                i.result,
                i.meetingUrl

            FROM interview i
            JOIN member m ON m.memberId = i.interviewerId
            LEFT JOIN candidate c ON c.candidateId = i.candidateId

            WHERE i.fromTimeUTC >= ?
            AND i.fromTimeUTC <= ?
              AND i.deletedAt IS NULL

            ORDER BY m.memberName, i.fromTimeUTC;
        `;

            const [rows] = await connection.query(query, [startUTC, endUTC]);

            return { interviews: rows };

        } catch (error) {
            this._handleDatabaseError(error, "getDailySummary");
        }
    }

    async getInterviewsByDateRange(client, startUTC, endUTC, filters = {}) {
        const connection = client;

        try {
            const conditions = [
                'i.isActive = 1',
                'i.deletedAt IS NULL',
                'i.fromTimeUTC >= ?',
                'i.fromTimeUTC < ?'
            ];

            const params = [startUTC, endUTC];

            // Optional filters
            if (filters.interviewerId) {
                conditions.push('i.interviewerId = ?');
                params.push(filters.interviewerId);
            }

            if (filters.result) {
                conditions.push('i.result = ?');
                params.push(filters.result);
            }

            if (filters.candidateId) {
                conditions.push('i.candidateId = ?');
                params.push(filters.candidateId);
            }

            const whereClause = conditions.join(' AND ');

            const query = `
            SELECT
                -- Interview
                DATE(i.fromTimeUTC) AS interviewDate,
                DATE_FORMAT(i.fromTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS interviewFromTime,
                i.interviewerFeedback,

                -- Candidate
                c.candidateId,
                c.candidateName,
                c.contactNumber AS candidatePhone,
                c.email AS candidateEmail,
                c.jobRole,
                c.experienceYears,
                c.noticePeriod,

                -- Expected joining location as JSON
                JSON_OBJECT(
                    'locationId', loc.locationId,
                    'city', loc.cityName,
                    'state', loc.stateName,
                    'country', loc.country
                ) AS expectedJoiningLocation,

                -- Interviewer
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName,

                -- Recruiter
                recruiter.memberName AS recruiterName

            FROM interview i

            JOIN candidate c
                ON i.candidateId = c.candidateId

            LEFT JOIN location loc
                ON c.expectedLocation = loc.locationId

            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId

            LEFT JOIN member recruiter
                ON c.recruiterId = recruiter.memberId

            WHERE ${whereClause}

            ORDER BY i.fromTimeUTC DESC;
        `;

            const [rows] = await connection.query(query, params);
            return rows;

        } catch (error) {
            this._handleDatabaseError(error, 'getInterviewsByDateRange');
        }
    }

    async getInterviewerWorkloadReport(client, startUTC, endUTC, interviewerId = null) {
        const connection = client;

        try {
            // Build interviewer filter
            let interviewerFilter = '';
            const params = [startUTC, endUTC];

            if (interviewerId) {
                interviewerFilter = 'AND m.memberId = ?';
                params.push(interviewerId);
            }

            // Get interviewer statistics - USE UTC TIMESTAMPS
            const statsQuery = `
        SELECT
            m.memberId AS interviewerId,
            m.memberName AS interviewerName,
            COUNT(i.interviewId) AS totalInterviews,
            COUNT(i.interviewId) AS interviewsConducted,
            CAST(COUNT(i.interviewId) AS UNSIGNED) AS totalInterviews,
            CAST(SUM(CASE WHEN i.result = 'pending' THEN 1 ELSE 0 END) AS UNSIGNED) AS pending,
            CAST(SUM(CASE WHEN i.result = 'selected' THEN 1 ELSE 0 END) AS UNSIGNED) AS selected,
            CAST(SUM(CASE WHEN i.result = 'rejected' THEN 1 ELSE 0 END) AS UNSIGNED) AS rejected,
            CAST(SUM(CASE WHEN i.result = 'cancelled' THEN 1 ELSE 0 END) AS UNSIGNED) AS cancelled,
            CAST(0 AS UNSIGNED) AS cancelledByCandidates
        FROM member m
        LEFT JOIN interview i
            ON i.interviewerId = m.memberId
            AND i.fromTimeUTC >= ?
            AND i.fromTimeUTC <= ?
            AND i.deletedAt IS NULL
            AND i.isActive = TRUE
        WHERE m.isActive = TRUE
            ${interviewerFilter}
        GROUP BY m.memberId, m.memberName
        HAVING totalInterviews > 0
        ORDER BY m.memberName;
        `;

            const [interviewerStats] = await connection.query(statsQuery, params);

            // Get detailed interviews - USE UTC TIMESTAMPS
            const detailsQuery = `
        SELECT
            i.interviewerId,
            c.candidateId,
            c.candidateName,
            c.jobRole AS role,
            CONCAT('R', CAST(RANK() OVER (
                PARTITION BY i.candidateId
                ORDER BY i.fromTimeUTC ASC, i.interviewId ASC
            ) AS CHAR)) AS round,
            DATE_FORMAT(i.fromTimeUTC, '%d-%b') AS date,
            i.result,
            i.interviewerFeedback AS feedback,
            recruiter.memberId AS recruiterId,
            recruiter.memberName AS recruiterName
        FROM interview i
        LEFT JOIN candidate c ON i.candidateId = c.candidateId
        LEFT JOIN member recruiter ON c.recruiterId = recruiter.memberId
        WHERE i.fromTimeUTC >= ?
            AND i.fromTimeUTC <= ?
            AND i.deletedAt IS NULL
            AND i.isActive = TRUE
            ${interviewerId ? 'AND i.interviewerId = ?' : ''}
        ORDER BY i.interviewerId, i.fromTimeUTC DESC;
        `;

            const [interviewDetails] = await connection.query(detailsQuery, params);

            // Group interviews by interviewer
            const interviewsByInterviewer = {};
            interviewDetails.forEach(interview => {
                if (!interviewsByInterviewer[interview.interviewerId]) {
                    interviewsByInterviewer[interview.interviewerId] = [];
                }
                interviewsByInterviewer[interview.interviewerId].push({
                    candidateId: interview.candidateId,
                    candidateName: interview.candidateName,
                    role: interview.role,
                    round: interview.round,
                    date: interview.date,
                    result: interview.result,
                    feedback: interview.feedback,
                    recruiterId: interview.recruiterId,
                    recruiterName: interview.recruiterName
                });
            });

            // Combine stats with interview details
            const interviewers = interviewerStats.map(stat => ({
                interviewerId: stat.interviewerId,
                interviewerName: stat.interviewerName,
                statistics: {
                    totalInterviews: stat.totalInterviews,
                    interviewsConducted: stat.interviewsConducted,
                    pending: stat.pending,
                    selected: stat.selected,
                    rejected: stat.rejected,
                    cancelled: stat.cancelled,
                    cancelledByCandidates: stat.cancelledByCandidates
                },
                interviews: interviewsByInterviewer[stat.interviewerId] || []
            }));

            return {
                interviewers
            };

        } catch (error) {
            this._handleDatabaseError(error, 'getInterviewerWorkloadReport');
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
                RANK() OVER (
                PARTITION BY i.candidateId
                ORDER BY i.fromTimeUTC ASC, i.interviewId ASC
                ) AS roundNumber,
                COUNT(*) OVER (PARTITION BY candidateId) AS totalInterviews,
                DATE(i.fromTimeUTC) AS interviewDate,
                DATE_FORMAT(i.fromTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS fromTime,
                DATE_FORMAT(i.toTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS toTime,
                i.eventTimezone,
                i.durationMinutes,
                c.candidateId,
                c.candidateName,
                c.isActive AS candidateIsActive,
                c.isActive = FALSE AS candidateIsDeleted,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName,
                scheduler.memberId AS scheduledById,
                COALESCE(scheduler.memberName, 'Unknown') AS scheduledByName,
                i.result,
                i.recruiterNotes,
                i.interviewerFeedback,
                i.meetingUrl,
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
            const query = `
        SELECT *
        FROM (
            SELECT
                i.interviewId,

                RANK() OVER (
                    PARTITION BY i.candidateId
                    ORDER BY i.fromTimeUTC ASC, i.interviewId ASC
                ) AS roundNumber,

                COUNT(*) OVER (
                    PARTITION BY i.candidateId
                ) AS totalInterviews,

                DATE(i.fromTimeUTC) AS interviewDate,
                DATE_FORMAT(i.fromTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS fromTime,
                DATE_FORMAT(i.toTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS toTime,
                i.eventTimezone,
                i.durationMinutes,
                c.candidateId,
                c.candidateName,
                c.isActive AS candidateIsActive,
                c.isActive = FALSE AS candidateIsDeleted,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName,
                scheduler.memberId AS scheduledById,
                COALESCE(scheduler.memberName, 'Unknown') AS scheduledByName,
                i.result,
                i.recruiterNotes,
                i.interviewerFeedback,
                i.meetingUrl

            FROM interview i
            LEFT JOIN candidate c
                ON i.candidateId = c.candidateId
            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId
            LEFT JOIN member scheduler
                ON i.scheduledById = scheduler.memberId
            WHERE i.isActive = TRUE
        ) ranked
        WHERE ranked.interviewId = ?;
        `;

            const [rows] = await connection.query(query, [interviewId]);

            return rows.length > 0 ? rows[0] : null;

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
                RANK() OVER (
                PARTITION BY i.candidateId
                ORDER BY i.fromTimeUTC ASC, i.interviewId ASC
                ) AS roundNumber,
                COUNT(*) OVER (PARTITION BY candidateId) AS totalInterviews,
                DATE(i.fromTimeUTC) AS interviewDate,
                DATE_FORMAT(i.fromTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS fromTime,
                DATE_FORMAT(i.toTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS toTime,
                i.eventTimezone,
                i.durationMinutes,
                i.result,
                i.meetingUrl,
                interviewer.memberId AS interviewerId,
                interviewer.memberName AS interviewerName
            FROM interview i
            LEFT JOIN member interviewer
                ON i.interviewerId = interviewer.memberId
            WHERE i.candidateId = ? AND i.isActive=TRUE
            ORDER BY roundNumber;
            `;
            const [interviews] = await connection.query(query, [candidateId]);
            return interviews;
        } catch (error) {
            this._handleDatabaseError(error, 'getInterviewsByCandidateId');
        }
    }

    /*async getLatestRoundNumber(candidateId, client) {
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
    }*/

    /*async getInterviewRounds(interviewId, client) {
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
    }*/

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

    async getFinalizationFormData(client, interviewId = null) {
        const connection = client;
        try {
            const query = `SELECT interviewId, result, recruiterNotes, interviewerFeedback, meetingUrl
            FROM interview
            WHERE interviewId = ? AND isActive=TRUE;`;
            const [rows] = await connection.query(query, [interviewId]);
            return rows[0] || null;
        } catch (error) {
            this._handleDatabaseError();
        }
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

    /*async renumberCandidateRounds(candidateId, client) {
        const connection = client;

        // Fetch active interviews in deterministic order
        const [rows] = await connection.query(
            `
        SELECT interviewId
        FROM interview
        WHERE candidateId = ? AND isActive = TRUE
        ORDER BY interviewDate ASC, fromTime ASC, interviewId ASC
        `,
            [candidateId]
        );

        const total = rows.length;
        if (total === 0) return 0;

        /*
         * PHASE 1: Break uniqueness
         * Move roundNumber into a safe negative range
         
        let temp = -1;
        for (const row of rows) {
            await connection.execute(
                `
            UPDATE interview
            SET roundNumber = ?
            WHERE interviewId = ?
            `,
                [temp--, row.interviewId]
            );
        }

        /*
         * PHASE 2: Assign correct round numbers
         
        let round = 1;
        for (const row of rows) {
            await connection.execute(
                `
            UPDATE interview
            SET roundNumber = ?, totalInterviews = ?
            WHERE interviewId = ?
            `,
                [round++, total, row.interviewId]
            );
        }

        return total;
    }*/

    async create(candidateId, interviewData, client) {
        const connection = client;
        try {
            //const { latestRound, totalInterviews } = await this.getLatestRoundNumber(candidateId, client);

            //const newRoundNumber = latestRound + 1;
            //const newTotalInterviews = totalInterviews + 1;

            const [result] = await connection.execute(
                `INSERT INTO interview (
                    candidateId,
                    interviewDate,
                    fromTimeUTC,
                    eventTimezone,
                    durationMinutes,
                    interviewerId,
                    scheduledById,
                    result,
                    interviewerFeedback,
                    recruiterNotes
                )
                VALUES (?,?,?,?,?,?,?,?,?,?)
                `,
                [
                    candidateId,
                    interviewData.interviewDate,
                    interviewData.startUTC,
                    //interviewData.endUTC,
                    interviewData.eventTimezone,
                    interviewData.durationMinutes,
                    interviewData.interviewerId,
                    interviewData.scheduledById,
                    interviewData.result || 'pending',
                    interviewData.interviewerFeedback || null,
                    interviewData.recruiterNotes || null
                ]
            );
            const interviewId = result.insertId;

            const query = `
        SELECT *
        FROM (
            SELECT
                i.interviewId,

                RANK() OVER (
                    PARTITION BY i.candidateId
                    ORDER BY i.fromTimeUTC ASC, i.interviewId ASC
                ) AS roundNumber,

                COUNT(*) OVER (
                    PARTITION BY i.candidateId
                ) AS totalInterviews,

                DATE(i.fromTimeUTC) AS interviewDate,
                DATE_FORMAT(i.fromTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS fromTime,
                DATE_FORMAT(i.toTimeUTC, '%Y-%m-%dT%H:%i:%sZ') AS toTime,
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
            WHERE i.isActive = TRUE
        ) ranked
        WHERE ranked.interviewId = ?;
        `;

            const [rows] = await connection.query(query, [interviewId]);

            return rows[0];
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
                'interviewDate',
                'fromTimeUTC',
                'toTimeUTC',
                'eventTimezone',
                'durationMinutes',
                'interviewerId',
                'scheduledById'
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

            const allowedFields = ['result', 'recruiterNotes', 'interviewerFeedback', 'meetingUrl'];

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
                `SELECT candidateId FROM interview WHERE interviewId = ? AND isActive=TRUE`,
                [interviewId]
            );

            const [result] = await client.execute(
                `UPDATE interview SET isActive=FALSE,deletedAt=NOW() WHERE interviewId=?`,
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
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('uq_active_interviewer_slot')) {
                throw new AppError(
                    'Interviewer is already scheduled at this time',
                    409,
                    'INTERVIEWER_TIME_CONFLICT',
                    {
                        interviewerId: 'conflict',
                        interviewDate: 'conflict',
                        fromTime: 'conflict'
                    }
                );
            }

            if (error.message.includes('uq_active_interview_slot')) {
                throw new AppError(
                    'Candidate already has an interview scheduled at this time',
                    409,
                    'CANDIDATE_TIME_CONFLICT',
                    {
                        candidateId: 'conflict',
                        interviewDate: 'conflict',
                        fromTime: 'conflict'
                    }
                );
            }

            if (error.message.includes('uq_active_candidate_slot')) {
                throw new AppError(
                    'Candidate already has an interview scheduled at this time',
                    409,
                    'CANDIDATE_TIME_CONFLICT',
                    {
                        candidateId: 'conflict',
                        interviewDate: 'conflict',
                        fromTime: 'conflict'
                    }
                );
            }

            throw new AppError(
                'Interview scheduling conflict',
                409,
                'INTERVIEW_CONFLICT',
                null
            );
        }
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