const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');
const { DateTime } = require('luxon');

class InterviewService {
    constructor(interviewRepository, db) {
        this.db = db;
        this.interviewRepository = interviewRepository;
    }

    static buildUtcDateTime(interviewDate, timeHHMM, timezone) {
        const dt = DateTime.fromISO(`${interviewDate}T${timeHHMM}`, {
            zone: timezone
        });

        if (!dt.isValid) {
            throw new AppError(
                'Invalid date/time for the specified timezone',
                400,
                'INVALID_TIMEZONE_TIME'
            );
        }

        return dt.toUTC().toJSDate();
    }

    static capitalizeFirstLetter(string) {
        if (typeof string !== "string" || string.length === 0) {
            return "";
        }
        return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
    }


    static capitalizeField(obj, fieldName) {
        if (!obj || typeof obj[fieldName] !== "string") return;

        obj[fieldName] = InterviewService.capitalizeFirstLetter(obj[fieldName]);
    }

    async assertNoOverlaps({
        client,
        candidateId,
        interviewerId,
        startUTC,
        endUTC,
        excludeInterviewId = null
    }) {
        // ---------- Candidate overlap ----------
        const candidateOverlapQuery = `
        SELECT interviewId
        FROM interview
        WHERE candidateId = ?
          AND isActive = 1
          AND deletedAt IS NULL
          ${excludeInterviewId ? 'AND interviewId != ?' : ''}
          AND (
            fromTimeUTC < ?
            AND toTimeUTC   > ?
          )
        LIMIT 1;
    `;

        const candidateParams = excludeInterviewId
            ? [candidateId, excludeInterviewId, endUTC, startUTC]
            : [candidateId, endUTC, startUTC];

        const [candidateRows] = await client.query(
            candidateOverlapQuery,
            candidateParams
        );

        if (candidateRows.length > 0) {
            throw new AppError(
                'Candidate already has an overlapping interview',
                409,
                'CANDIDATE_TIME_CONFLICT',
                { candidateId: 'conflict' }
            );
        }

        // ---------- Interviewer overlap ----------
        const interviewerOverlapQuery = `
        SELECT interviewId
        FROM interview
        WHERE interviewerId = ?
          AND isActive = 1
          AND deletedAt IS NULL
          ${excludeInterviewId ? 'AND interviewId != ?' : ''}
          AND (
            fromTimeUTC < ?
            AND toTimeUTC   > ?
          )
        LIMIT 1;
    `;

        const interviewerParams = excludeInterviewId
            ? [interviewerId, excludeInterviewId, endUTC, startUTC]
            : [interviewerId, endUTC, startUTC];

        const [interviewerRows] = await client.query(
            interviewerOverlapQuery,
            interviewerParams
        );

        if (interviewerRows.length > 0) {
            throw new AppError(
                'Interviewer already has an overlapping interview',
                409,
                'INTERVIEWER_TIME_CONFLICT',
                { interviewerId: 'conflict' }
            );
        }
    }

    async assertCandidateActive(candidateId, client) {
        const query = `
        SELECT candidateId, isActive 
        FROM candidate 
        WHERE candidateId = ?
    `;

        const [rows] = await client.query(query, [candidateId]);

        if (rows.length === 0) {
            throw new AppError(
                `Candidate with ID ${candidateId} not found`,
                404,
                'CANDIDATE_NOT_FOUND',
                { candidateId }
            );
        }

        if (!rows[0].isActive) {
            throw new AppError(
                'Cannot create or modify interviews for inactive candidates',
                400,
                'CANDIDATE_INACTIVE',
                { candidateId }
            );
        }
    }

    async getInterviewerWorkloadReport(queryParams) {
        const client = await this.db.getConnection();

        try {
            // Calculate date range based on filter
            let startDate, endDate;

            if (queryParams.filter === 'today') {
                const today = new Date();
                startDate = today.toISOString().split('T')[0];
                endDate = startDate;

            } else if (queryParams.filter === 'past7days') {
                const today = new Date();
                const past7Days = new Date(today);
                past7Days.setDate(today.getDate() - 6);

                startDate = past7Days.toISOString().split('T')[0];
                endDate = today.toISOString().split('T')[0];

            } else if (queryParams.filter === 'past30days') {
                const today = new Date();
                const past30Days = new Date(today);
                past30Days.setDate(today.getDate() - 29);

                startDate = past30Days.toISOString().split('T')[0];
                endDate = today.toISOString().split('T')[0];

            } else if (queryParams.filter === 'custom') {
                startDate = queryParams.startDate;
                endDate = queryParams.endDate;
            }

            const report = await this.interviewRepository.getInterviewerWorkloadReport(
                client,
                startDate,
                endDate,
                queryParams.interviewerId
            );

            // Capitalize result fields
            report.interviewers.forEach(interviewer => {
                interviewer.interviews.forEach(interview => {
                    InterviewService.capitalizeField(interview, 'result');
                });
            });

            return {
                ...report
            };

        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error fetching interviewer workload report', error.stack);
                throw new AppError(
                    'Failed to fetch interviewer workload report',
                    500,
                    'INTERVIEWER_WORKLOAD_REPORT_ERROR',
                    { operation: 'getInterviewerWorkloadReport' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getAll() {
        //const { limit = 10, page = 1 } = options || {};
        const client = await this.db.getConnection();
        try {
            const result = await this.interviewRepository.getAll(null, null, client);
            const interviews = result.data;

            for (const interview of interviews) {
                InterviewService.capitalizeField(interview, "result");
            }
            /*const totalPages = Math.ceil(result.totalRecords / limit);
            const pagination = {
                currentPage: page,
                totalPages,
                totalRecords: result.totalRecords,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page < totalPages ? page + 1 : null,
                prevPage: page > 1 ? page - 1 : null
            };*/
            return {
                data: interviews
                //pagination
            };
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Interview Data', error.stack);
                throw new AppError(
                    'Failed to fetch interviews',
                    500,
                    'INTERVIEW_FETCH_ERROR',
                    { operation: 'getAll' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getInterviewById(interviewId) {
        const client = await this.db.getConnection();
        try {
            const data = await this.interviewRepository.getById(interviewId, client);
            if (!data) {
                throw new AppError(
                    `Interview Entry with ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND'
                );
            }
            //const data = result.data;

            if (Array.isArray(data)) {
                data.forEach(item => InterviewService.capitalizeField(item, "result"));
            } else {
                InterviewService.capitalizeField(data, "result");
            }

            return data;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Interview Data By Id', error.stack);
                throw new AppError(
                    'Failed to fetch Interview data by Id',
                    500,
                    'INTERVIEW_FETCH_ERROR',
                    { operation: 'getInterviewById', interviewId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getInterviewsByCandidateId(candidateId) {
        const client = await this.db.getConnection();
        try {
            const interviews = await this.interviewRepository.getInterviewsByCandidateId(candidateId, client);
            const data = interviews;

            if (Array.isArray(data)) {
                data.forEach(item => InterviewService.capitalizeField(item, "result"));
            } else {
                InterviewService.capitalizeField(data, "result");
            }

            return {
                candidateId,
                totalRounds: data.length,
                data
            };
            /*return {
                candidateId,
                totalRounds: interviews.length,
                interviews
            };*/
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Interviews By Candidate Id', error.stack);
                throw new AppError(
                    'Failed to fetch interviews by candidate Id',
                    500,
                    'INTERVIEW_FETCH_ERROR',
                    { operation: 'getInterviewsByCandidateId', candidateId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getFormData(interviewId = null) {
        const client = await this.db.getConnection();
        try {
            const result = await this.interviewRepository.getFormData(client, interviewId);

            return result;
            /*if (interviewId && !result.interview) {
                throw new AppError(
                    `Interview with ID ${interviewId} not found`,
                    404,
                    'INTERVIEW_DATA_NOT_FOUND'
                );
            }*/
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Interview Data By Id', error.stack);
                throw new AppError(
                    'Failed to fetch Interview data by Id',
                    500,
                    'INTERVIEW_DATA_FETCH_ERROR',
                    { operation: 'getFormData', interviewId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getFinalizationFormData(interviewId) {
        const client = await this.db.getConnection();
        try {
            const result = await this.interviewRepository.getFinalizationFormData(client, interviewId);
            if (!result) {
                throw new AppError(
                    `Interview Entry with ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND'
                );
            }
            return result;

        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Finalization Form Data By Id', error.stack);
                throw new AppError(
                    'Failed to fetch Finalization Form data by Id',
                    500,
                    'FINALIZATION_FORM_DATA_FETCH_ERROR',
                    { operation: 'getFinalizationFormData', interviewId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getTotalSummary() {
        const client = await this.db.getConnection();
        try {
            const result = await this.interviewRepository.getSummary(client);

            return result;

        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching total Interviewer data', error.stack);
                throw new AppError(
                    'Failed to Fetch Total Interviewer Data',
                    500,
                    'INTERVIEWER_DATA_FETCH_ERROR',
                    { operation: 'getTotalSummary' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getMonthlySummary(startDate, endDate) {
        const client = await this.db.getConnection();

        try {
            const result = await this.interviewRepository.getMonthlySummary(
                client,
                startDate,
                endDate
            );
            return result;
        } catch (error) {

            if (!(error instanceof AppError)) {
                console.error('Error Fetching total Monthly Report Data', error.stack);
                throw new AppError(
                    'Failed to Fetch Monthly Report Data',
                    500,
                    'MONTHLY_DATA_FETCH_ERROR',
                    { operation: 'getMonthlySummary' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getDailySummary(date) {
        const client = await this.db.getConnection();

        try {

            return await this.interviewRepository.getDailySummary(
                client,
                date
            );

        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Daily Summary', error.stack);
                throw new AppError(
                    'Failed to Fetch Daily Report Data',
                    500,
                    'DAILY_DATA_FETCH_ERROR'
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getInterviewTracker(queryParams) {
        const client = await this.db.getConnection();

        try {
            // Calculate date range based on filter
            let startDate, endDate;

            if (queryParams.filter === 'today') {
                const today = new Date();
                startDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
                endDate = startDate;

            } else if (queryParams.filter === 'past7days') {
                const today = new Date();
                const past7Days = new Date(today);
                past7Days.setDate(today.getDate() - 6); // Including today = 7 days

                startDate = past7Days.toISOString().split('T')[0];
                endDate = today.toISOString().split('T')[0];

            } else if (queryParams.filter === 'custom') {
                startDate = queryParams.startDate;
                endDate = queryParams.endDate;
            }

            // Get interviews within date range
            const interviews = await this.interviewRepository.getInterviewsByDateRange(
                client,
                startDate,
                endDate,
                {
                    interviewerId: queryParams.interviewerId,
                    result: queryParams.result,
                    candidateId: queryParams.candidateId
                }
            );

            // Capitalize result field
            interviews.forEach(interview =>
                InterviewService.capitalizeField(interview, "result")
            );

            return interviews;

        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error fetching interview tracker data', error.stack);
                throw new AppError(
                    'Failed to fetch interview tracker data',
                    500,
                    'INTERVIEW_TRACKER_FETCH_ERROR',
                    { operation: 'getInterviewTracker' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    /*async getInterviewRounds(interviewId) {
        const client = await this.db.getConnection();

        try {
            const result = await this.interviewRepository.getInterviewRounds(interviewId, client);

            if (!result || result.rounds.length === 0) {
                throw new AppError(
                    `No interview rounds found for interviewId ${interviewId}`,
                    404,
                    'INTERVIEW_ROUNDS_NOT_FOUND'
                );
            }

            return result;

        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Interview Rounds', error.stack);
                throw new AppError(
                    'Failed to fetch Interview Rounds',
                    500,
                    'INTERVIEW_ROUNDS_FETCH_ERROR',
                    { interviewId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }*/

    async createInterview(candidateId, interviewData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            await this.assertCandidateActive(candidateId, client);

            // 1. Build UTC times once
            const startUTC = InterviewService.buildUtcDateTime(
                interviewData.interviewDate,
                interviewData.fromTime,
                interviewData.eventTimezone
            );

            const endUTC = new Date(
                startUTC.getTime() + interviewData.durationMinutes * 60000
            );

            // 2. Check overlaps using UTC only
            await this.assertNoOverlaps({
                client,
                candidateId,
                interviewerId: interviewData.interviewerId,
                startUTC,
                endUTC
            });

            // 3. Persist (repository must store UTC fields)
            const result = await this.interviewRepository.create(
                candidateId,
                {
                    ...interviewData,
                    startUTC,
                    //endUTC
                },
                client
            );

            // 4. Audit log
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: result,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
            return result;

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;

            console.error("Error creating Interview entry:", error.stack);
            throw new AppError(
                "Failed to create interview entry",
                500,
                "INTERVIEW_CREATION_ERROR",
                { operation: "createInterview", interviewData }
            );
        } finally {
            client.release();
        }
    }

    /*async updateInterview(interviewId, interviewData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const existingInterview = await this.interviewRepository.getById(interviewId, client);
            if (!existingInterview) {
                throw new AppError(
                    `Interview with Id ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND'
                );
            }

            const updatedInterview = await this.interviewRepository.update(interviewId, interviewData, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                previousValues: existingInterview,
                newValues: updatedInterview,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return updatedInterview;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error updating Interview entry:", error.stack);
            throw new AppError(
                "Failed to update Intervirw entry",
                500,
                "INTERVIEW_UPDATE_ERROR",
                { operation: "updateInterview", interviewId }
            );
        } finally {
            client.release();
        }
    }*/
    async updateInterview(interviewId, interviewData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingInterview =
                await this.interviewRepository.getById(interviewId, client);

            if (!existingInterview) {
                throw new AppError(
                    `Interview with Id ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND'
                );
            }

            if (interviewData.candidateId &&
                interviewData.candidateId !== existingInterview.candidateId) {
                await this.assertCandidateActive(interviewData.candidateId, client);
            }

            // 1. Detect if this patch affects time
            const isTimeUpdate =
                'eventTimezone' in interviewData ||
                'fromTime' in interviewData ||
                'interviewDate' in interviewData ||
                'durationMinutes' in interviewData;
            let startUTC;
            let endUTC;
            let effectiveTimezone;
            let finalInterviewDate;
            let finalDurationMinutes;

            if (isTimeUpdate) {
                if (!interviewData.interviewDate ||
                    !interviewData.fromTime ||
                    !interviewData.eventTimezone) {
                    throw new AppError(
                        'interviewDate, fromTime, and timezone are all required when updating time',
                        400,
                        'INVALID_TIME_UPDATE'
                    );
                }

                finalInterviewDate =
                    interviewData.interviewDate ?? existingInterview.interviewDate;

                const finalFromTime =
                    interviewData.fromTime ?? existingInterview.fromTime;

                finalDurationMinutes =
                    interviewData.durationMinutes ?? existingInterview.durationMinutes;
                effectiveTimezone =
                    interviewData.eventTimezone;

                startUTC = InterviewService.buildUtcDateTime(
                    finalInterviewDate,
                    finalFromTime,
                    effectiveTimezone
                );

                endUTC = new Date(
                    startUTC.getTime() + finalDurationMinutes * 60000
                );

                await this.assertNoOverlaps({
                    client,
                    candidateId: existingInterview.candidateId,
                    interviewerId:
                        interviewData.interviewerId ?? existingInterview.interviewerId,
                    startUTC,
                    endUTC,
                    excludeInterviewId: interviewId
                });
            }

            const updatePayload = {};

            if (isTimeUpdate) {
                updatePayload.interviewDate = finalInterviewDate;
                updatePayload.fromTimeUTC = startUTC;
                updatePayload.eventTimezone = effectiveTimezone;
                updatePayload.durationMinutes = finalDurationMinutes;
            }

            if (interviewData.interviewerId !== undefined) {
                updatePayload.interviewerId = interviewData.interviewerId;
            }

            if (interviewData.scheduledById !== undefined) {
                updatePayload.scheduledById = interviewData.scheduledById;
            }

            const updatedInterview = await this.interviewRepository.update(
                interviewId,
                updatePayload,
                client
            );

            // 6. Audit
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                previousValues: existingInterview,
                newValues: updatedInterview,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
            return updatedInterview;

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;

            throw new AppError(
                'Failed to update Interview entry',
                500,
                'INTERVIEW_UPDATE_ERROR',
                { interviewId }
            );
        } finally {
            client.release();
        }
    }

    async scheduleNextRound(candidateId, interviewData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const startUTC = InterviewService.buildUtcDateTime(
                interviewData.interviewDate,
                interviewData.fromTime,
                interviewData.eventTimezone
            );

            const endUTC = new Date(
                startUTC.getTime() + interviewData.durationMinutes * 60000
            );

            await this.assertNoOverlaps({
                client,
                candidateId,
                interviewerId: interviewData.interviewerId,
                startUTC,
                endUTC
            });

            const previousInterviews = await this.interviewRepository.getInterviewsByCandidateId(candidateId, client);

            if (!previousInterviews || previousInterviews.length === 0) {
                throw new AppError(
                    `No previous interviews found for candidate ${candidateId}. Please create an initial interview first.`,
                    400,
                    'NO_PREVIOUS_INTERVIEWS'
                );
            }

            const result = await this.interviewRepository.create(
                candidateId,
                {
                    ...interviewData,
                    startUTC
                },
                client
            );

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: result,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return {
                success: true,
                candidateId,
                data: result,
                message: `Successfully scheduled round ${result.roundNumber} for candidate`
            };

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error scheduling next interview round:", error.stack);
            throw new AppError(
                "Failed to schedule next interview round",
                500,
                "INTERVIEW_ROUND_SCHEDULE_ERROR",
                { operation: "scheduleNextRound", candidateId }
            );
        } finally {
            client.release();
        }
    }

    async finalizeInterview(interviewId, finalData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const existingInterview = await this.interviewRepository.getById(interviewId, client);
            if (!existingInterview) {
                throw new AppError(
                    `Interview with Id ${interviewId} not found`,
                    404,
                    'INTERVIEW_ENTRY_NOT_FOUND'
                );
            }

            const finalizedInterview = await this.interviewRepository.finalize(interviewId, finalData, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                previousValues: existingInterview,
                newValues: finalizedInterview,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return finalizedInterview;

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error finalizing Interview:", error.stack);
            throw new AppError(
                "Failed to finalize Interview",
                500,
                "INTERVIEW_FINALIZE_ERROR",
                { operation: "finalizeInterview", interviewId }
            );
        } finally {
            client.release();
        }
    }

    async deleteInterview(interviewId, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const exists = await this.interviewRepository.exists(interviewId, client);
            if (!exists) {
                throw new AppError(
                    `Interview entry with ${interviewId} not found`,
                    404,
                    'INTERVIEW_NOT_FOUND'
                );
            }

            //const candidateId = exists.candidateId;

            const deleteResult = await this.interviewRepository.delete(interviewId, client);

            if (!deleteResult.success) {
                throw new AppError(
                    `Interview with Interview ID ${interviewId} not found`,
                    404,
                    "INTERVIEW_NOT_FOUND",
                    {
                        interviewId,
                        suggestion: "Please verify the Interview ID and try again"
                    }
                );
            }

            await this.interviewRepository.renumberCandidateRounds(deleteResult.candidateId, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return {
                success: true,
                message: "Interview entry deleted successfully",
                data: {
                    interviewId,
                    deletedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error deleting Interview entry:", error.stack);
            throw new AppError(
                "Failed to delete Interview entry",
                500,
                "INTERVIEW_DELETION_ERROR",
                { interviewId, operation: "deleteInterview" }
            );
        } finally {
            client.release();
        }
    }

    async permanentlyDeleteOldInterviews() {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const [interviews] = await client.execute(
                `SELECT i.interviewId 
             FROM interview i
             LEFT JOIN candidate c ON i.candidateId = c.candidateId
             LEFT JOIN member m ON i.interviewerId = m.memberId
             WHERE i.deletedAt IS NOT NULL 
             AND i.deletedAt <= DATE_SUB(NOW(), INTERVAL 15 DAY)
             AND (c.deletedAt IS NOT NULL OR c.candidateId IS NULL)
             AND (m.deletedAt IS NOT NULL OR m.memberId IS NULL)`,
                []
            );

            if (interviews.length === 0) {
                await client.commit();
                console.log('No interviews to permanently delete');
                return 0;
            }

            console.log(`Found ${interviews.length} interviews to permanently delete`);

            // Permanently delete interviews from database
            const deletedCount = await this.interviewRepository.permanentlyDeleteBatch(
                interviews.map(i => i.interviewId),
                client
            );

            await client.commit();

            console.log(`${deletedCount} interview records permanently deleted from database`);
            return deletedCount;

        } catch (error) {
            await client.rollback();
            console.error('Error in permanentlyDeleteOldInterviews:', error);
            throw new AppError(
                'Failed to permanently delete old interviews',
                500,
                'PERMANENT_DELETE_ERROR',
                { operation: 'permanentlyDeleteOldInterviews' }
            );
        } finally {
            client.release();
        }
    }
}

module.exports = InterviewService;