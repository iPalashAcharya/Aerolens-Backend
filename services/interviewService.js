const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class InterviewService {
    constructor(interviewRepository, db) {
        this.db = db;
        this.interviewRepository = interviewRepository;
    }

    async getAll() {
        //const { limit = 10, page = 1 } = options || {};
        const client = await this.db.getConnection();
        try {
            const result = await this.interviewRepository.getAll(null, null, client);
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
                data: result.data
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
            const result = await this.interviewRepository.getById(interviewId, client);
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
                console.error('Error Fetching Interview Data By Id', error.stack);
                throw new AppError(
                    'Failed to fetch Interview data by Id',
                    500,
                    'INTERVIEW_FETCH_ERROR',
                    { operation: 'getDataById', tag }
                );
            }
            throw error;
        } finally {
            client.release();
        }

    }

    async createInterview(interviewData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const result = await this.interviewRepository.create(interviewData, client);
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
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error creating Interview entry:", error.stack);
            throw new AppError(
                "Failed to create interview entry",
                500,
                "INTERVIEW_CREATION_ERROR",
                { operation: "createINterview", interviewData }
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

            const existingInterview = await this.interviewRepository.getById(interviewId, client);
            if (!existingInterview || !existingInterview.data) {
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
                previousValues: existingInterview.data,
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
                "Failed to update Interview entry",
                500,
                "INTERVIEW_UPDATE_ERROR",
                { operation: "updateInterview", interviewId }
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
            const deleted = await this.interviewRepository.delete(interviewId, client);

            if (deleted !== true) {
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
        }
    }
}

module.exports = InterviewService;