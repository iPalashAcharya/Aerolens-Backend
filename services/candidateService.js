const multer = require('multer');
const fs = require('fs');
const auditLogService = require('./auditLogService');
const { exist } = require('joi');
const { S3Client, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multerS3 = require('multer-s3');
const path = require('path');
const AppError = require('../utils/appError');

const s3Config = {
    region: process.env.AWS_REGION
};

const s3Client = new S3Client(s3Config);

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET;
const S3_RESUME_FOLDER = 'resumes/';

class CandidateService {
    constructor(candidateRepository, db) {
        this.candidateRepository = candidateRepository;
        this.db = db;
        this.s3Client = s3Client;
        this.bucketName = S3_BUCKET_NAME;
        this.resumeFolder = S3_RESUME_FOLDER;
        this.initializeMulter();
    }
    initializeMulter() {
        const storage = multerS3({
            s3: this.s3Client,
            bucket: this.bucketName,
            contentType: multerS3.AUTO_CONTENT_TYPE,
            serverSideEncryption: 'AES256',
            metadata: (req, file, cb) => {
                cb(null, {
                    fieldName: file.fieldname,
                    originalName: file.originalname,
                    uploadDate: new Date().toISOString(),
                    candidateId: req.params.id || req.body.candidateId || 'temp'
                });
            },
            key: (req, file, cb) => {
                try {
                    const candidateId = req.params.id || req.body.candidateId || 'temp';
                    const timestamp = Date.now();
                    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const fileExtension = path.extname(sanitizedOriginalName);

                    const s3Key = `${this.resumeFolder}candidate_${candidateId}_${timestamp}${fileExtension}`;

                    cb(null, s3Key);
                } catch (error) {
                    cb(error);
                }
            }
        });

        const fileFilter = (req, file, cb) => {
            const allowedMimeTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];

            if (allowedMimeTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new AppError('Only PDF, DOC and DOCX files are allowed', 400, 'INVALID_FILE_TYPE'), false);
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

    async deleteFromS3(s3Key) {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key
            });

            await this.s3Client.send(command);
            console.log(`Successfully deleted file from S3: ${s3Key}`);
        } catch (error) {
            console.error('Error deleting file from S3:', error);
            throw new AppError('Failed to delete file from S3', 500, 'S3_DELETE_ERROR');
        }
    }

    async fileExistsInS3(s3Key) {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key
            });

            await this.s3Client.send(command);
            return true;
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }

    async generatePresignedUrl(s3Key, expiresIn = 900) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key
            });

            const url = await getSignedUrl(this.s3Client, command, { expiresIn });
            return url;
        } catch (error) {
            console.error('Error generating presigned URL:', error);
            throw new AppError('Failed to generate download URL', 500, 'S3_URL_ERROR');
        }
    }

    async getS3FileMetadata(s3Key) {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key
            });

            const metadata = await this.s3Client.send(command);
            return {
                contentType: metadata.ContentType,
                contentLength: metadata.ContentLength,
                lastModified: metadata.LastModified,
                metadata: metadata.Metadata
            };
        } catch (error) {
            console.error('Error getting S3 file metadata:', error);
            throw new AppError('Failed to get file metadata', 500, 'S3_METADATA_ERROR');
        }
    }

    async renameS3File(oldKey, candidateId, originalName) {

        try {
            // Generate new key with actual candidateId
            const timestamp = Date.now();
            const sanitizedOriginalName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileExtension = path.extname(sanitizedOriginalName);
            const newKey = `${this.resumeFolder}candidate_${candidateId}_${timestamp}${fileExtension}`;

            // Copy object to new key
            const copyCommand = new CopyObjectCommand({
                Bucket: this.bucketName,
                CopySource: `${this.bucketName}/${oldKey}`,
                Key: newKey,
                ServerSideEncryption: 'AES256',
                MetadataDirective: 'REPLACE',
                Metadata: {
                    candidateId: candidateId.toString(),
                    originalName: originalName,
                    uploadDate: new Date().toISOString()
                }
            });

            await this.s3Client.send(copyCommand);
            console.log(`Successfully copied S3 file from ${oldKey} to ${newKey}`);

            // Delete old temp file
            const deleteCommand = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: oldKey
            });

            await this.s3Client.send(deleteCommand);
            console.log(`Successfully deleted temp S3 file: ${oldKey}`);

            return {
                oldKey,
                newKey,
                candidateId,
                originalName
            };
        } catch (error) {
            console.error('Error renaming S3 file:', error);
            // If copy fails, try to delete the temp file
            try {
                await this.deleteFromS3(oldKey);
            } catch (deleteError) {
                console.error('Error deleting temp file after rename failure:', deleteError);
            }
            throw new AppError('Failed to rename resume file', 500, 'S3_RENAME_ERROR');
        }
    }

    async uploadResume(candidateId, file) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                // Delete uploaded S3 file if candidate not found
                if (file.key) {
                    await this.deleteFromS3(file.key);
                }
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            const existingResumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);
            if (existingResumeInfo && existingResumeInfo.resumeFilename) {
                try {
                    await this.deleteFromS3(existingResumeInfo.resumeFilename);
                    console.log(`Deleted old resume from S3: ${existingResumeInfo.resumeFilename}`);
                } catch (error) {
                    console.error('Error deleting old resume from S3:', error);
                    // Continue with update even if old file deletion fails
                }
            }

            // Update candidate record with new resume information
            await this.candidateRepository.updateResumeInfo(
                candidateId,
                file.key, // S3 key
                file.originalname,
                client
            );

            await client.commit();

            return {
                candidateId: candidateId,
                filename: file.key,
                originalName: file.originalname,
                size: file.size,
                location: file.location, // S3 URL
                uploadDate: new Date()
            };
        } catch (error) {
            await client.rollback();

            // Delete uploaded S3 file on error
            if (file && file.key) {
                try {
                    await this.deleteFromS3(file.key);
                } catch (deleteError) {
                    console.error('Error deleting uploaded S3 file:', deleteError);
                }
            }

            if (error instanceof AppError) {
                throw error;
            }
            console.error("Error Uploading Resume:", error.stack);
            throw new AppError(
                "Failed to Upload Resume",
                500,
                "RESUME_UPLOAD_ERROR",
                { candidateId, operation: "uploadResume" }
            );
        } finally {
            client.release();
        }
    }

    async downloadResume(candidateId) {
        const client = await this.db.getConnection();
        try {
            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);

            if (!resumeInfo || !resumeInfo.resumeFilename) {
                throw new AppError(
                    'No resume found for this candidate',
                    404,
                    'RESUME_NOT_FOUND'
                );
            }

            // Check if file exists in S3
            const fileExists = await this.fileExistsInS3(resumeInfo.resumeFilename);
            if (!fileExists) {
                throw new AppError(
                    'Resume file not found in storage',
                    404,
                    'RESUME_FILE_NOT_FOUND'
                );
            }

            // Get file metadata for additional info
            const metadata = await this.getS3FileMetadata(resumeInfo.resumeFilename);

            // Return S3 key and metadata for controller to stream
            return {
                s3Key: resumeInfo.resumeFilename,
                originalName: resumeInfo.resumeOriginalName,
                filename: resumeInfo.resumeFilename,
                uploadDate: resumeInfo.resumeUploadDate,
                contentType: metadata.contentType,
                contentLength: metadata.contentLength
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Downloading Resume:", error.stack);
            throw new AppError(
                "Failed to Download Resume",
                500,
                "RESUME_DOWNLOAD_ERROR",
                { candidateId, operation: "downloadResume" }
            );
        } finally {
            client.release();
        }
    }

    async getResumePresignedUrl(candidateId, expiresIn = 900) {
        const client = await this.db.getConnection();
        try {
            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);

            if (!resumeInfo || !resumeInfo.resumeFilename) {
                throw new AppError(
                    'No resume found for this candidate',
                    404,
                    'RESUME_NOT_FOUND'
                );
            }

            // Check if file exists in S3
            const fileExists = await this.fileExistsInS3(resumeInfo.resumeFilename);
            if (!fileExists) {
                throw new AppError(
                    'Resume file not found in storage',
                    404,
                    'RESUME_FILE_NOT_FOUND'
                );
            }

            // Generate presigned URL
            const downloadUrl = await this.generatePresignedUrl(resumeInfo.resumeFilename, expiresIn);

            return {
                downloadUrl: downloadUrl,
                originalName: resumeInfo.resumeOriginalName,
                filename: resumeInfo.resumeFilename,
                expiresIn: expiresIn,
                expiresAt: new Date(Date.now() + expiresIn * 1000)
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Generating Presigned URL:", error.stack);
            throw new AppError(
                "Failed to Generate Download URL",
                500,
                "PRESIGNED_URL_ERROR",
                { candidateId, operation: "getResumePresignedUrl" }
            );
        } finally {
            client.release();
        }
    }

    async deleteResume(candidateId) {
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

            const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);

            if (!resumeInfo || !resumeInfo.resumeFilename) {
                throw new AppError(
                    'No resume found for this candidate',
                    404,
                    'RESUME_NOT_FOUND'
                );
            }

            // Delete file from S3
            try {
                await this.deleteFromS3(resumeInfo.resumeFilename);
            } catch (error) {
                console.error('Error deleting resume from S3:', error);
                // Continue with database update even if S3 deletion fails
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
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Deleting Resume:", error.stack);
            throw new AppError(
                "Failed to Delete Resume",
                500,
                "RESUME_DELETE_ERROR",
                { candidateId, operation: "deleteResume" }
            );
        } finally {
            client.release();
        }
    }

    async getResumeInfo(candidateId) {
        const client = await this.db.getConnection();
        try {
            const candidate = await this.candidateRepository.findById(candidateId, client);
            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            const resumeInfo = await this.candidateRepository.getResumeInfo(candidateId, client);

            return {
                hasResume: !!(resumeInfo && resumeInfo.resumeFilename),
                originalName: resumeInfo?.resumeOriginalName || null,
                uploadDate: resumeInfo?.resumeUploadDate || null,
                s3Key: resumeInfo?.resumeFilename || null
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching Resume Information:", error.stack);
            throw new AppError(
                "Failed to Fetch Resume Information",
                500,
                "RESUME_FETCH_ERROR",
                { candidateId, operation: "getResumeInfo" }
            );
        } finally {
            client.release();
        }
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
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Updating Resume Information:", error.stack);
            throw new AppError(
                "Failed to Update Resume Information",
                500,
                "RESUME_UPDATE_ERROR",
                { candidateId, operation: "updateCandidateResumeInfo" }
            );
        } finally {
            client.release();
        }
    }

    async createCandidate(candidateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

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
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: candidate,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

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
        const client = await this.db.getConnection();
        try {
            const candidate = await this.candidateRepository.findById(candidateId, client);

            if (!candidate) {
                throw new AppError(
                    `Candidate with ID ${candidateId} not found`,
                    404,
                    'CANDIDATE_NOT_FOUND'
                );
            }

            return candidate;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching Candidate By ID:", error.stack);
            throw new AppError(
                "Failed to Fetch Candidate",
                500,
                "CANDIDATE_FETCH_ERROR",
                { candidateId, operation: "getCandidateById" }
            );
        } finally {
            client.release();
        }
    }

    async updateCandidate(candidateId, updateData, auditContext) {
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

            const candidate = await this.candidateRepository.update(candidateId, updateData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                oldValues: existingCandidate,
                newValues: candidate,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return await this.candidateRepository.findById(candidateId, client);
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Updating Candidate", error.stack);
            throw new AppError(
                "Failed to Update Candidate",
                500,
                "CANDIDATE_UPDATE_ERROR",
                { candidateId, operation: "updateCandidate" }
            );
        } finally {
            client.release();
        }
    }

    async deleteCandidate(candidateId, auditContext) {
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
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return { deletedCandidate: candidate };
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Deleting Candidate", error.stack);
            throw new AppError(
                "Failed to Delete Candidate",
                500,
                "CANDIDATE_DELETE_ERROR",
                { candidateId, operation: "deleteCandidate" }
            );
        } finally {
            client.release();
        }
    }

    async getCandidatesByStatus(statusId) {
        const client = await this.db.getConnection();
        try {
            return await this.candidateRepository.findByStatus(statusId, client);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching Candidates by Status", error.stack);
            throw new AppError(
                "Failed to fetch Candidates",
                500,
                "CANDIDATE_FETCH_ERROR",
                { statusId, operation: "getCandidatesByStatus" }
            );
        } finally {
            client.release();
        }
    }

    async getAllCandidates(options = {}) {
        //const { limit, offset } = options;
        const client = await this.db.getConnection();
        try {
            //return await this.candidateRepository.findAll(limit, offset, client);
            return await this.candidateRepository.findAll(null, null, client);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching All Candidates", error.stack);
            throw new AppError(
                "Failed to fetch Candidates",
                500,
                "CANDIDATE_FETCH_ERROR",
                { operation: "getAllCandidates" }
            );
        } finally {
            client.release();
        }
    }

    async getCandidateCount() {
        const client = await this.db.getConnection();
        try {
            return await this.candidateRepository.getCount(client);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching Candidate count", error.stack);
            throw new AppError(
                "Failed to fetch candidate count",
                500,
                "CANDIDATE_COUNT_FETCH_ERROR",
                { operation: "getCandidateCount" });
        } finally {
            client.release();
        }
    }

    async getCandidatesWithPagination(page = 1, pageSize = 10, filters = {}) {
        const offset = (page - 1) * pageSize;
        const client = await this.db.getConnection();
        try {
            const candidates = await this.candidateRepository.searchCandidates(filters, pageSize, offset, client);
            const totalCount = await this.candidateRepository.countCandidates(filters, client);

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
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching Candidates with pagination", error.stack);
            throw new AppError(
                "Failed to fetch candidates",
                500,
                "CANDIDATE_FETCH_ERROR",
                { operation: "getCandidatesWithPagination" });
        } finally {
            client.release();
        }
    }

    async getAllCandidatesWithPagination(page = 1, pageSize = 10) {
        const offset = (page - 1) * pageSize;
        const client = await this.db.getConnection();
        try {
            const candidates = await this.candidateRepository.findAll(pageSize, offset, client);

            const totalCount = await this.candidateRepository.getCount(client);

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
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching Candidates with pagination", error.stack);
            throw new AppError(
                "Failed to fetch candidates",
                500,
                "CANDIDATE_FETCH_ERROR",
                { operation: "getAllCandidatesWithPagination" });
        } finally {
            client.release();
        }

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
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Updating Candidates in Bulk", error.stack);
            throw new AppError(
                "Failed to update Candidates",
                500,
                "CANDIDATE_UPDATE_ERROR",
                { operation: "bulkUpdateCandidates" });
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
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Deleting Candidates in bulk", error.stack);
            throw new AppError(
                "Failed to delete candidates",
                500,
                "CANDIDATE_DELETE_ERROR",
                { operation: "bulkDeleteCandidates" });
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
        const client = await this.db.getConnection();

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
        try {
            return await this.candidateRepository.searchCandidates(filters, client);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Deleting Candidates in bulk", error.stack);
            throw new AppError(
                "Failed to delete candidates",
                500,
                "CANDIDATE_DELETE_ERROR",
                { operation: "bulkDeleteCandidates" });
        } finally {
            client.release();
        }
    }
}

module.exports = CandidateService;