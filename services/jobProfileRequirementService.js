const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class JobProfileRequirementService {
    constructor(jobProfileRequirementRepository, db) {
        this.jobProfileRequirementRepository = jobProfileRequirementRepository;
        this.db = db;
    }

    async createJobProfileRequirement(jobProfileRequirementData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const jobProfileRequirement = await this.jobProfileRequirementRepository.create(
                jobProfileRequirementData,
                client
            );

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                entityType: 'jobProfileRequirement',
                entityId: jobProfileRequirement.jobProfileRequirementId,
                newValues: jobProfileRequirement,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return jobProfileRequirement;
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error creating Job Profile Requirement', error.stack);
                throw new AppError(
                    'Failed to create Job Profile Requirement',
                    500,
                    'JOB_PROFILE_REQUIREMENT_CREATION_ERROR',
                    { operation: 'createJobProfileRequirement', jobProfileRequirementData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementById(jobProfileRequirementId) {
        const client = await this.db.getConnection();
        try {
            const jobProfileRequirement = await this.jobProfileRequirementRepository.findById(
                jobProfileRequirementId,
                client
            );

            if (!jobProfileRequirement) {
                throw new AppError(
                    `Job profile requirement with ID ${jobProfileRequirementId} not found`,
                    404,
                    'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
                );
            }

            return jobProfileRequirement;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirement By ID', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirement by ID',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getJobProfileRequirementById', jobProfileRequirementId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async updateJobProfileRequirement(jobProfileRequirementId, updateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingJobProfileRequirement = await this.jobProfileRequirementRepository.findById(
                jobProfileRequirementId,
                client
            );

            if (!existingJobProfileRequirement) {
                throw new AppError(
                    `Job profile requirement with ID ${jobProfileRequirementId} not found`,
                    404,
                    'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
                );
            }

            // Check if updating to a duplicate job profile requirement
            if (updateData.jobProfileId) {
                const exists = await this.jobProfileRequirementRepository.existsByJobProfile(
                    updateData.jobProfileId,
                    existingJobProfileRequirement.clientId,
                    existingJobProfileRequirement.departmentId,
                    jobProfileRequirementId,
                    client
                );

                if (exists) {
                    throw new AppError(
                        'A job profile requirement with this job profile already exists for this client and department',
                        409,
                        'DUPLICATE_JOB_REQUIREMENT'
                    );
                }
            }

            // Prevent updates to closed or cancelled requirements
            if (existingJobProfileRequirement.status) {
                const statusLower = existingJobProfileRequirement.status.toLowerCase();
                if (statusLower === "closed" || statusLower === "cancelled") {
                    throw new AppError(
                        `Cannot update a job profile requirement that is ${existingJobProfileRequirement.status}`,
                        400,
                        'JOB_PROFILE_REQUIREMENT_UPDATE_NOT_ALLOWED'
                    );
                }
            }

            const updatedJobProfileRequirement = await this.jobProfileRequirementRepository.update(
                jobProfileRequirementId,
                updateData,
                client
            );

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                entityType: 'jobProfileRequirement',
                entityId: jobProfileRequirementId,
                oldValues: existingJobProfileRequirement,
                newValues: updatedJobProfileRequirement,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return await this.jobProfileRequirementRepository.findById(jobProfileRequirementId, client);
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Updating Job Profile Requirement', error.stack);
                throw new AppError(
                    'Failed to update job profile requirement',
                    500,
                    'JOB_PROFILE_REQUIREMENT_UPDATE_ERROR',
                    { operation: 'updateJobProfileRequirement', updateData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteJobProfileRequirement(jobProfileRequirementId, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const jobProfileRequirement = await this.jobProfileRequirementRepository.findById(
                jobProfileRequirementId,
                client
            );

            if (!jobProfileRequirement) {
                throw new AppError(
                    `Job profile requirement with ID ${jobProfileRequirementId} not found`,
                    404,
                    'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
                );
            }

            await this.jobProfileRequirementRepository.delete(jobProfileRequirementId, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                entityType: 'jobProfileRequirement',
                entityId: jobProfileRequirementId,
                oldValues: jobProfileRequirement,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return { deletedJobProfileRequirement: jobProfileRequirement };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Deleting Job Profile Requirement', error.stack);
                throw new AppError(
                    'Failed to delete job profile requirement',
                    500,
                    'JOB_PROFILE_REQUIREMENT_DELETE_ERROR',
                    { operation: 'deleteJobProfileRequirement', jobProfileRequirementId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementsByClientId(clientId, options = {}) {
        const client = await this.db.getConnection();
        const { limit, offset } = options;

        try {
            return await this.jobProfileRequirementRepository.findByClientId(
                clientId,
                limit,
                offset,
                client
            );
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirements By Client Id', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirements by client ID',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getJobProfileRequirementsByClientId', clientId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementsByJobProfileId(jobProfileId) {
        const client = await this.db.getConnection();

        try {
            return await this.jobProfileRequirementRepository.findByJobProfileId(
                jobProfileId,
                client
            );
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirements By Job Profile Id', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirements by job profile ID',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getJobProfileRequirementsByJobProfileId', jobProfileId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementsByStatus(statusId) {
        const client = await this.db.getConnection();

        try {
            return await this.jobProfileRequirementRepository.findByStatus(statusId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirements By Status Id', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirements by status ID',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getJobProfileRequirementsByStatus', statusId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementsByDepartment(departmentId) {
        const client = await this.db.getConnection();

        try {
            return await this.jobProfileRequirementRepository.findByDepartment(departmentId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirements By Department', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirements by department',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getJobProfileRequirementsByDepartment', departmentId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getAllJobProfileRequirements(options = {}) {
        const { limit, offset } = options;
        const client = await this.db.getConnection();

        try {
            return await this.jobProfileRequirementRepository.findAll(limit, offset, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Job Profile Requirements', error.stack);
                throw new AppError(
                    'Failed to fetch all job profile requirements',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getAllJobProfileRequirements' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async searchJobProfileRequirements(searchCriteria) {
        const client = await this.db.getConnection();

        try {
            return await this.jobProfileRequirementRepository.search(searchCriteria, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Searching Job Profile Requirements', error.stack);
                throw new AppError(
                    'Failed to search job profile requirements',
                    500,
                    'JOB_PROFILE_REQUIREMENT_SEARCH_ERROR',
                    { operation: 'searchJobProfileRequirements', searchCriteria }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementCount(clientId) {
        const client = await this.db.getConnection();

        try {
            return await this.jobProfileRequirementRepository.countByClient(clientId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirement Count', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirement count',
                    500,
                    'JOB_PROFILE_REQUIREMENT_COUNT_ERROR',
                    { operation: 'getJobProfileRequirementCount', clientId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileRequirementsByClientWithPagination(clientId, page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const client = await this.db.getConnection();

        try {
            const jobProfileRequirements = await this.jobProfileRequirementRepository.findByClientId(
                clientId,
                pageSize,
                offset,
                client
            );
            const totalCount = await this.jobProfileRequirementRepository.countByClient(clientId, client);

            return {
                jobProfileRequirements,
                pagination: {
                    currentPage: page,
                    pageSize,
                    totalCount,
                    totalPages: Math.ceil(totalCount / pageSize),
                    hasNextPage: page < Math.ceil(totalCount / pageSize),
                    hasPreviousPage: page > 1
                }
            };
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile Requirements By Client With Pagination', error.stack);
                throw new AppError(
                    'Failed to fetch job profile requirements by client with pagination',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getJobProfileRequirementsByClientWithPagination', clientId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getAllJobProfileRequirementsWithPagination(page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const client = await this.db.getConnection();

        try {
            const jobProfileRequirements = await this.jobProfileRequirementRepository.findAll(
                pageSize,
                offset,
                client
            );

            return {
                jobProfileRequirements,
                pagination: {
                    currentPage: page,
                    pageSize,
                    hasNextPage: jobProfileRequirements && jobProfileRequirements.length === pageSize,
                    hasPreviousPage: page > 1
                }
            };
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Job Profile Requirements With Pagination', error.stack);
                throw new AppError(
                    'Failed to fetch all job profile requirements with pagination',
                    500,
                    'JOB_PROFILE_REQUIREMENT_FETCH_ERROR',
                    { operation: 'getAllJobProfileRequirementsWithPagination' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async bulkUpdateJobProfileRequirements(jobProfileRequirementIds, updateData, auditContext) {
        const client = await this.db.getConnection();
        const results = [];
        const errors = [];

        try {
            await client.beginTransaction();

            for (const jobProfileRequirementId of jobProfileRequirementIds) {
                try {
                    const existingJobProfileRequirement = await this.jobProfileRequirementRepository.findById(
                        jobProfileRequirementId,
                        client
                    );

                    if (!existingJobProfileRequirement) {
                        errors.push({
                            jobProfileRequirementId,
                            error: 'Job profile requirement not found'
                        });
                        results.push({
                            jobProfileRequirementId,
                            status: 'failed',
                            error: 'Not found'
                        });
                        continue;
                    }

                    await this.jobProfileRequirementRepository.update(
                        jobProfileRequirementId,
                        updateData,
                        client
                    );

                    await auditLogService.logAction({
                        userId: auditContext.userId,
                        action: 'BULK_UPDATE',
                        entityType: 'jobProfileRequirement',
                        entityId: jobProfileRequirementId,
                        oldValues: existingJobProfileRequirement,
                        newValues: updateData,
                        ipAddress: auditContext.ipAddress,
                        userAgent: auditContext.userAgent,
                        timestamp: auditContext.timestamp
                    }, client);

                    results.push({ jobProfileRequirementId, status: 'success' });
                } catch (error) {
                    errors.push({ jobProfileRequirementId, error: error.message });
                    results.push({
                        jobProfileRequirementId,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            if (errors.length === 0) {
                await client.commit();
            } else {
                await client.rollback();
                throw new AppError(
                    'Bulk update failed for some records',
                    400,
                    'BULK_UPDATE_ERROR',
                    { results, errors }
                );
            }

            return {
                results,
                totalProcessed: jobProfileRequirementIds.length,
                successful: results.filter(r => r.status === 'success').length,
                failed: errors.length
            };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Bulk Updating Job Profile Requirements', error.stack);
                throw new AppError(
                    'Failed to bulk update job profile requirements',
                    500,
                    'JOB_PROFILE_REQUIREMENT_BULK_UPDATE_ERROR',
                    { operation: 'bulkUpdateJobProfileRequirements', updateData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = JobProfileRequirementService;