const AppError = require('../utils/appError');

class CandidateService {
    constructor(candidateRepository, db) {
        this.candidateRepository = candidateRepository;
        this.db = db;
    }

    async createCandidate(candidateData) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            // Check if candidate with same email already exists
            const exists = await this.candidateRepository.checkEmailExists(
                candidateData.email,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A candidate with this email already exists',
                    409,
                    'DUPLICATE_CANDIDATE_EMAIL'
                );
            }

            const candidate = await this.candidateRepository.create(candidateData, client);
            await client.commit();

            return candidate;
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getCandidateById(candidateId) {
        const candidate = await this.candidateRepository.findById(candidateId);

        if (!candidate) {
            throw new AppError(
                `Candidate with ID ${candidateId} not found`,
                404,
                'CANDIDATE_NOT_FOUND'
            );
        }

        return candidate;
    }

    async updateCandidate(candidateId, updateData) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingCandidate = await this.candidateRepository.findById(candidateId, client);
            if (!existingCandidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            // Check for email uniqueness if email is being updated
            if (updateData.email && updateData.email !== existingCandidate.email) {
                const exists = await this.candidateRepository.checkEmailExists(
                    updateData.email,
                    candidateId,
                    client
                );

                if (exists) {
                    throw new AppError(
                        'A candidate with this email already exists',
                        409,
                        'DUPLICATE_CANDIDATE_EMAIL'
                    );
                }
            }

            await this.candidateRepository.update(candidateId, updateData, client);
            await client.commit();

            return await this.candidateRepository.findById(candidateId);
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteCandidate(candidateId) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            await this.candidateRepository.delete(candidateId, client);
            await client.commit();

            return { deletedCandidate: candidate };
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getCandidatesByStatus(statusId) {
        return await this.candidateRepository.findByStatus(statusId);
    }

    async getAllCandidates(options = {}) {
        const { limit, offset } = options;
        return await this.candidateRepository.findAll(limit, offset);
    }

    async getCandidateCount() {
        return await this.candidateRepository.getCount();
    }

    async getCandidatesWithPagination(page = 1, pageSize = 10, filters = {}) {
        const offset = (page - 1) * pageSize;

        // Use searchCandidates for filtered results
        const candidates = await this.candidateRepository.searchCandidates(filters, pageSize, offset);

        // Get total count for the same filters
        const totalCount = await this.getCandidateCountWithFilters(filters);

        return {
            candidates,
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

    async getAllCandidatesWithPagination(page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const candidates = await this.candidateRepository.findAll(pageSize, offset);

        const totalCount = await this.candidateRepository.getCount();

        return {
            candidates,
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

    async bulkUpdateCandidates(candidateIds, updateData) {
        const client = await this.db.getConnection();
        const results = [];
        const errors = [];

        try {
            await client.beginTransaction();

            for (const candidateId of candidateIds) {
                try {
                    await this.candidateRepository.update(candidateId, updateData, client);
                    results.push({ candidateId, status: 'success' });
                } catch (error) {
                    errors.push({ candidateId, error: error.message });
                    results.push({ candidateId, status: 'failed', error: error.message });
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
                totalProcessed: candidateIds.length,
                successful: results.filter(r => r.status === 'success').length
            };
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async bulkDeleteCandidates(candidateIds) {
        const client = await this.db.getConnection();
        const results = [];
        const errors = [];

        try {
            await client.beginTransaction();

            for (const candidateId of candidateIds) {
                try {
                    const candidate = await this.candidateRepository.findById(candidateId, client);
                    if (candidate) {
                        await this.candidateRepository.delete(candidateId, client);
                        results.push({ candidateId, status: 'success', deletedCandidate: candidate });
                    } else {
                        results.push({ candidateId, status: 'not_found', error: 'Candidate not found' });
                    }
                } catch (error) {
                    errors.push({ candidateId, error: error.message });
                    results.push({ candidateId, status: 'failed', error: error.message });
                }
            }

            if (errors.length === 0) {
                await client.commit();
            } else {
                await client.rollback();
                throw new AppError(
                    'Bulk delete failed for some records',
                    400,
                    'BULK_DELETE_ERROR',
                    { results, errors }
                );
            }

            return {
                results,
                totalProcessed: candidateIds.length,
                successful: results.filter(r => r.status === 'success').length
            };
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async searchCandidates(searchCriteria) {
        const {
            name,
            email,
            jobRole,
            location,
            minExperience,
            maxExperience,
            minExpectedCTC,
            maxExpectedCTC,
            statusId,
            recruiterName
        } = searchCriteria;

        const filters = {};

        if (name) filters.candidateName = name;
        if (email) filters.email = email;
        if (jobRole) filters.jobRole = jobRole;
        if (location) filters.preferredJobLocation = location;
        if (statusId) filters.statusId = statusId;
        if (recruiterName) filters.recruiterName = recruiterName;
        if (minExperience !== undefined || maxExperience !== undefined) {
            filters.experienceRange = { min: minExperience, max: maxExperience };
        }
        if (minExpectedCTC !== undefined || maxExpectedCTC !== undefined) {
            filters.expectedCTCRange = { min: minExpectedCTC, max: maxExpectedCTC };
        }

        return await this.candidateRepository.searchCandidates(filters);
    }
}

module.exports = CandidateService;