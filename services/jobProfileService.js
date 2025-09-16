const AppError = require('../utils/appError');

class JobProfileService {
    constructor(jobProfileRepository, db) {
        this.jobProfileRepository = jobProfileRepository;
        this.db = db;
    }

    async createJobProfile(jobProfileData) {
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
            await client.commit();

            return jobProfile;
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfileById(jobProfileId) {
        const jobProfile = await this.jobProfileRepository.findById(jobProfileId);

        if (!jobProfile) {
            throw new AppError(
                `Job profile with ID ${jobProfileId} not found`,
                404,
                'JOB_PROFILE_NOT_FOUND'
            );
        }

        return jobProfile;
    }

    async updateJobProfile(jobProfileId, updateData) {
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
            console.log(existingJobProfile);

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

            await this.jobProfileRepository.update(jobProfileId, updateData, client);
            await client.commit();

            return await this.jobProfileRepository.findById(jobProfileId);
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteJobProfile(jobProfileId) {
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
            await client.commit();

            return { deletedJobProfile: jobProfile };
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getJobProfilesByClientId(clientId, options = {}) {
        const { limit, offset } = options;
        return await this.jobProfileRepository.findByClientId(clientId, limit, offset);
    }

    async getJobProfilesByStatus(statusId) {
        return await this.jobProfileRepository.findByStatus(statusId);
    }

    async getJobProfilesByDepartment(departmentId) {
        return await this.jobProfileRepository.findByDepartment(departmentId);
    }

    async getAllJobProfiles(options = {}) {
        const { limit, offset } = options;
        return await this.jobProfileRepository.findAll(limit, offset);
    }

    async getJobProfileCount(clientId) {
        return await this.jobProfileRepository.countByClient(clientId);
    }

    async getJobProfilesByClientWithPagination(clientId, page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const jobProfiles = await this.jobProfileRepository.findByClientId(clientId, pageSize, offset);
        const totalCount = await this.jobProfileRepository.countByClient(clientId);

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
    }

    async getAllJobProfilesWithPagination(page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
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
    }

    async bulkUpdateJobProfiles(jobProfileIds, updateData) {
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
                await client.rollback();
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
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = JobProfileService;