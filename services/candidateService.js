const AppError = require('../utils/appError');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

class CandidateService {
    constructor(candidateRepository, db) {
        this.candidateRepository = candidateRepository;
        this.db = db;
        this.initializeMulter();
    }
    initializeMulter() {
        const resumeDir = path.join(__dirname, '../resumes');

        const ensureResumeDirectory = async () => {
            try {
                await fs.promises.access(resumeDir);
            } catch (error) {
                await fs.promises.mkdir(resumeDir, { recursive: true });
            }
        };

        ensureResumeDirectory();

        // Multer configuration
        const storage = multer.diskStorage({
            destination: async (req, file, cb) => {
                await ensureResumeDirectory();
                cb(null, resumeDir);
            },
            filename: (req, file, cb) => {
                const candidateId = req.params.id || req.body.candidateId;
                const timestamp = Date.now();
                const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                const filename = `candidate_${candidateId}_${timestamp}_${sanitizedOriginalName}`;
                cb(null, filename);
            }
        });

        const fileFilter = (req, file, cb) => {
            if (file.mimetype === 'application/pdf') {
                cb(null, true);
            } else {
                cb(new Error('Only PDF files are allowed'), false);
            }
        };

        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 5 * 1024 * 1024 // 5MB limit
            },
            fileFilter: fileFilter
        });
    }

    async uploadResume(candidateId, file) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            // Check if candidate exists
            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            // If candidate already has a resume, delete the old file
            const existingResumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);
            if (existingResumeInfo && existingResumeInfo.resumeFilename) {
                const oldFilePath = path.join(__dirname, '../resumes', existingResumeInfo.resumeFilename);
                try {
                    await fs.promises.unlink(oldFilePath);
                } catch (error) {
                    console.error('Error deleting old resume file:', error);
                    // Continue with update even if old file deletion fails
                }
            }

            // Update candidate record with new resume information
            await this.candidateRepository.updateResumeInfo(
                candidateId,
                file.filename,
                file.originalname,
                client
            );

            await client.commit();

            return {
                candidateId: candidateId,
                filename: file.filename,
                originalName: file.originalname,
                size: file.size,
                uploadDate: new Date()
            };

        } catch (error) {
            await client.rollback();

            // Clean up uploaded file if database update fails
            if (file && file.path) {
                try {
                    await fs.promises.unlink(file.path);
                } catch (unlinkError) {
                    console.error('Error deleting uploaded file:', unlinkError);
                }
            }

            throw error;
        } finally {
            client.release();
        }
    }

    async downloadResume(candidateId) {
        // Check if candidate exists
        const candidate = await this.candidateRepository.findById(candidateId);
        if (!candidate) {
            throw new AppError(
                `Candidate with ID ${candidateId} not found`,
                404,
                'CANDIDATE_NOT_FOUND'
            );
        }

        // Get resume information
        const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId);

        if (!resumeInfo || !resumeInfo.resumeFilename) {
            throw new AppError(
                'No resume found for this candidate',
                404,
                'RESUME_NOT_FOUND'
            );
        }

        const filePath = path.join(__dirname, '../resumes', resumeInfo.resumeFilename);

        // Check if file exists
        try {
            await fs.promises.access(filePath);
        } catch (error) {
            throw new AppError(
                'Resume file not found on server',
                404,
                'RESUME_FILE_NOT_FOUND'
            );
        }

        return {
            filePath: filePath,
            originalName: resumeInfo.resumeOriginalName,
            filename: resumeInfo.resumeFilename
        };
    }

    async deleteResume(candidateId) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            // Check if candidate exists
            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            // Get current resume information
            const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);

            if (!resumeInfo || !resumeInfo.resumeFilename) {
                throw new AppError(
                    'No resume found for this candidate',
                    404,
                    'RESUME_NOT_FOUND'
                );
            }

            // Delete file from filesystem
            const filePath = path.join(__dirname, '../resumes', resumeInfo.resumeFilename);
            try {
                await fs.promises.unlink(filePath);
            } catch (error) {
                console.error('Error deleting resume file:', error);
                // Continue with database update even if file deletion fails
            }

            // Update database to remove resume info
            await this.candidateRepository.deleteResumeInfo(candidateId, client);

            await client.commit();

            return {
                message: 'Resume deleted successfully',
                deletedFile: resumeInfo.resumeOriginalName
            };

        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getResumeInfo(candidateId) {
        // Check if candidate exists
        const candidate = await this.candidateRepository.findById(candidateId);
        if (!candidate) {
            throw new AppError(
                `Candidate with ID ${candidateId} not found`,
                404,
                'CANDIDATE_NOT_FOUND'
            );
        }

        const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId);

        return {
            hasResume: !!(resumeInfo && resumeInfo.resumeFilename),
            originalName: resumeInfo?.resumeOriginalName || null,
            uploadDate: resumeInfo?.resumeUploadDate || null
        };
    }

    async updateCandidateResumeInfo(candidateId, resumeData) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            await this.candidateRepository.updateResumeInfo(
                candidateId,
                resumeData.resumeFilename,
                resumeData.resumeOriginalName,
                client
            );
            await client.commit();
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
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
            if (updateData.resume) {
                const newFilePath = path.join(__dirname, "../resumes", updateData.resume);
                fs.unlink(newFilePath, (err) => {
                    if (err) console.error("Failed to cleanup new resume:", err);
                });
            }
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