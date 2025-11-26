const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class JobProfileService {
    constructor(jobProfileRepository, db) {
        this.jobProfileRepository = jobProfileRepository;
        this.db = db;
    }

    async createJobProfile(jobProfileData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const exists = await this.jobProfileRepository.existsByRole(
                jobProfileData.jobRole,
                jobProfileData.clientId,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A job profile with this role already exists for this client',
                    409,
                    'DUPLICATE_JOB_ROLE'
                );
            }

            const jobProfile = await this.jobProfileRepository.create(jobProfileData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: jobProfile,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return jobProfile;
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error creating Job Profile', error.stack);
                throw new AppError(
                    'Failed to create job profile',
                    500,
                    'JOB_PROFILE_CREATION_ERROR',
                    { operation: 'createJobProfile', jobProfileData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileById(jobProfileId) {
        const client = await this.db.getConnection();
        try {
            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);

            if (!jobProfile) {
                throw new AppError(
                    `Job profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            return jobProfile;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile By ID', error.stack);
                throw new AppError(
                    'Failed to fetch job profile',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getJobProfileById', jobProfileId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async updateJobProfile(jobProfileId, updateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingJobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!existingJobProfile) {
                throw new AppError(
                    `Job profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }
            console.log('Existing Job Profile:', existingJobProfile);

            if (updateData.jobRole) {
                const exists = await this.jobProfileRepository.existsByRole(
                    updateData.jobRole,
                    existingJobProfile.clientId,
                    jobProfileId,
                    client
                );

                if (exists) {
                    throw new AppError(
                        'A job profile with this role already exists in the database for this client',
                        409,
                        'DUPLICATE_JOB_ROLE'
                    );
                }
            }

            if (existingJobProfile.status.toLowerCase() === "closed" || existingJobProfile.status.toLowerCase() === "cancelled") {
                throw new AppError(
                    `Cannot update a job profile that is ${existingJobProfile.status}`,
                    400,
                    'JOB_PROFILE_UPDATE_NOT_ALLOWED'
                );
            }

            const jobProfile = await this.jobProfileRepository.update(jobProfileId, updateData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                oldValues: existingJobProfile,
                newValues: jobProfile,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return await this.jobProfileRepository.findById(jobProfileId, client);
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Updating Job Profile', error.stack);
                throw new AppError(
                    'Failed to Update job profile',
                    500,
                    'JOB_PROFILE_UPDATE_ERROR',
                    { operation: 'updateJobProfile', updateData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteJobProfile(jobProfileId, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!jobProfile) {
                throw new AppError(
                    `Job profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            await this.jobProfileRepository.delete(jobProfileId, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return { deletedJobProfile: jobProfile };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Deleting Job Profile', error.stack);
                throw new AppError(
                    'Failed to Delete job profile',
                    500,
                    'JOB_PROFILE_DELETE_ERROR',
                    { operation: 'deleteJobProfile', jobProfileId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfilesByClientId(clientId, options = {}) {
        const client = await this.db.getConnection();
        const { limit, offset } = options;
        try {
            return await this.jobProfileRepository.findByClientId(clientId, limit, offset, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile By Client Id', error.stack);
                throw new AppError(
                    'Failed to fetch job profile By Client Id',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getJobProfilesByClientId', clientId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfilesByStatus(statusId) {
        const client = await this.db.getConnection();
        try {
            return await this.jobProfileRepository.findByStatus(statusId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile By Status Id', error.stack);
                throw new AppError(
                    'Failed to fetch job profile By Status Id',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getJobProfilesByStatusId', statusId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfilesByDepartment(departmentId) {
        const client = await this.db.getConnection();
        try {
            return await this.jobProfileRepository.findByDepartment(departmentId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Job Profile By Department', error.stack);
                throw new AppError(
                    'Failed to fetch job profile By Department',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getJobProfilesByDepartment', departmentId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getAllJobProfiles(options = {}) {
        const { limit, offset } = options;
        const client = await this.db.getConnection();
        try {
            return await this.jobProfileRepository.findAll(limit, offset, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Job Profiles', error.stack);
                throw new AppError(
                    'Failed to fetch all job profiles',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getAllJobProfiles' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileCount(clientId) {
        const client = await this.db.getConnection();
        try {
            return await this.jobProfileRepository.countByClient(clientId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Job Profiles', error.stack);
                throw new AppError(
                    'Failed to fetch all job profiles',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getAllJobProfiles' }
                );
            }
            throw error;
        } finally {
            client.release();
        }

    }

    async getJobProfilesByClientWithPagination(clientId, page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const client = await this.db.getConnection();
        try {
            const jobProfiles = await this.jobProfileRepository.findByClientId(clientId, pageSize, offset, client);
            const totalCount = await this.jobProfileRepository.countByClient(clientId, client);
            return {
                jobProfiles,
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
                console.error('Error Fetching All Job Profiles By Client', error.stack);
                throw new AppError(
                    'Failed to fetch all job profiles By Client',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getAllJobProfilesByClientWithPagination' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getAllJobProfilesWithPagination(page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const client = await this.db.getConnection();
        try {
            const jobProfiles = await this.jobProfileRepository.findAll(pageSize, offset);

            // Get total count for pagination - you might need to add this method to repository
            // For now, returning without total count
            return {
                jobProfiles,
                pagination: {
                    currentPage: page,
                    pageSize,
                    hasNextPage: jobProfiles.length === pageSize,
                    hasPreviousPage: page > 1
                }
            };
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Job Profiles with pagination', error.stack);
                throw new AppError(
                    'Failed to fetch all job profiles with pagination',
                    500,
                    'JOB_PROFILE_FETCH_ERROR',
                    { operation: 'getAllJobProfilesWithPagination' }
                );
            }
            throw error;
        } finally {
            client.release();
        }

    }

    async bulkUpdateJobProfiles(jobProfileIds, updateData, auditContext) {
        const client = await this.db.getConnection();
        const results = [];
        const errors = [];

        try {
            await client.beginTransaction();

            for (const jobProfileId of jobProfileIds) {
                try {
                    await this.jobProfileRepository.update(jobProfileId, updateData, client);
                    results.push({ jobProfileId, status: 'success' });
                } catch (error) {
                    errors.push({ jobProfileId, error: error.message });
                    results.push({ jobProfileId, status: 'failed', error: error.message });
                }
            }

            if (errors.length === 0) {
                await client.commit();
            } else {
                throw new AppError(
                    'Bulk update failed for some records',
                    400,
                    'BULK_UPDATE_ERROR',
                    { results, errors }
                );
            }

            return { results, totalProcessed: jobProfileIds.length, successful: results.filter(r => r.status === 'success').length };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Bulk Updating Job Profile', error.stack);
                throw new AppError(
                    'Failed to Update job profile',
                    500,
                    'JOB_PROFILE_UPDATE_ERROR',
                    { operation: 'bulkUpdateJobProfiles', updateData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = JobProfileService;