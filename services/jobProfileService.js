const multer = require('multer');
const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');
const { S3Client, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multerS3 = require('multer-s3');
const path = require('path');

const s3Config = {
    region: process.env.AWS_REGION
};

const s3Client = new S3Client(s3Config);

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET;
const S3_JD_FOLDER = 'jd-descriptions/';

class JobProfileService {
    constructor(jobProfileRepository, db) {
        this.jobProfileRepository = jobProfileRepository;
        this.db = db;
        this.s3Client = s3Client;
        this.bucketName = S3_BUCKET_NAME;
        this.jdFolder = S3_JD_FOLDER;
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
                    jobProfileId: req.params.id || req.body.jobProfileId || 'temp'
                });
            },
            key: (req, file, cb) => {
                try {
                    const jobProfileId = req.params.id || req.body.jobProfileId || 'temp';
                    const timestamp = Date.now();
                    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const fileExtension = path.extname(sanitizedOriginalName);

                    const s3Key = `${this.jdFolder}jobProfile_${jobProfileId}_${timestamp}${fileExtension}`;

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

    async renameS3File(oldKey, jobProfileId, originalName) {

        try {
            const timestamp = Date.now();
            const sanitizedOriginalName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileExtension = path.extname(sanitizedOriginalName);
            const newKey = `${this.jdFolder}jobProfile_${jobProfileId}_${timestamp}${fileExtension}`;

            // Copy object to new key
            const copyCommand = new CopyObjectCommand({
                Bucket: this.bucketName,
                CopySource: `${this.bucketName}/${oldKey}`,
                Key: newKey,
                ServerSideEncryption: 'AES256',
                MetadataDirective: 'REPLACE',
                Metadata: {
                    jobProfileId: jobProfileId.toString(),
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
                jobProfileId,
                originalName
            };
        } catch (error) {
            console.error('Error renaming S3 file:', error);
            try {
                await this.deleteFromS3(oldKey);
            } catch (deleteError) {
                console.error('Error deleting temp file after rename failure:', deleteError);
            }
            throw new AppError('Failed to rename JD file', 500, 'S3_RENAME_ERROR');
        }
    }

    async uploadJD(jobProfileId, file) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!jobProfile) {
                // Delete uploaded S3 file if job profile not found
                if (file.key) {
                    await this.deleteFromS3(file.key);
                }
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            const existingJDInfo = await this.jobProfileRepository.getJDInfo(jobProfileId, client);
            if (existingJDInfo && existingJDInfo.jdFileName) {
                try {
                    await this.deleteFromS3(existingJDInfo.jdFileName);
                    console.log(`Deleted old JD from S3: ${existingJDInfo.jdFileName}`);
                } catch (error) {
                    console.error('Error deleting old JD from S3:', error);
                    // Continue with update even if old file deletion fails
                }
            }

            await this.jobProfileRepository.updateJDInfo(
                jobProfileId,
                file.key, // S3 key
                file.originalname,
                client
            );

            await client.commit();

            return {
                jobProfileId: jobProfileId,
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
            console.error("Error Uploading JD:", error.stack);
            throw new AppError(
                "Failed to Upload JD",
                500,
                "JD_UPLOAD_ERROR",
                { jobProfileId, operation: "uploadJD" }
            );
        } finally {
            client.release();
        }
    }

    async downloadJD(jobProfileId) {
        const client = await this.db.getConnection();
        try {
            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!jobProfile) {
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            const jdInfo = await this.jobProfileRepository.getJDInfo(jobProfileId, client);

            if (!jdInfo || !jdInfo.jdFileName) {
                throw new AppError(
                    'No JD found for this Job Profile',
                    404,
                    'JD_NOT_FOUND'
                );
            }

            // Check if file exists in S3
            const fileExists = await this.fileExistsInS3(jdInfo.jdFileName);
            if (!fileExists) {
                throw new AppError(
                    'JD file not found in storage',
                    404,
                    'JD_FILE_NOT_FOUND'
                );
            }

            // Get file metadata for additional info
            const metadata = await this.getS3FileMetadata(jdInfo.jdFileName);

            // Return S3 key and metadata for controller to stream
            return {
                s3Key: jdInfo.jdFileName,
                originalName: jdInfo.jdOriginalName,
                filename: jdInfo.jdFileName,
                uploadDate: jdInfo.jdUploadDate,
                contentType: metadata.contentType,
                contentLength: metadata.contentLength
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Downloading JD:", error.stack);
            throw new AppError(
                "Failed to Download JD",
                500,
                "JD_DOWNLOAD_ERROR",
                { jobProfileId, operation: "downloadJD" }
            );
        } finally {
            client.release();
        }
    }

    async getJDPresignedUrl(jobProfileId, expiresIn = 900) {
        const client = await this.db.getConnection();
        try {
            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!jobProfile) {
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            const jdInfo = await this.jobProfileRepository.getJDInfo(jobProfileId, client);

            if (!jdInfo || !jdInfo.jdFileName) {
                throw new AppError(
                    'No JD found for this Job Profile',
                    404,
                    'JD_NOT_FOUND'
                );
            }

            // Check if file exists in S3
            const fileExists = await this.fileExistsInS3(jdInfo.jdFileName);
            if (!fileExists) {
                throw new AppError(
                    'JD file not found in storage',
                    404,
                    'JD_FILE_NOT_FOUND'
                );
            }

            // Generate presigned URL
            const downloadUrl = await this.generatePresignedUrl(jdInfo.jdFileName, expiresIn);

            return {
                downloadUrl: downloadUrl,
                originalName: jdInfo.jdOriginalName,
                filename: jdInfo.jdFileName,
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
                { jobProfileId, operation: "getJDPresignedUrl" }
            );
        } finally {
            client.release();
        }
    }

    async deleteJD(jobProfileId) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!jobProfile) {
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            const jdInfo = await this.jobProfileRepository.getJDInfo(jobProfileId, client);

            if (!jdInfo || !jdInfo.jdFileName) {
                throw new AppError(
                    'No JD found for this Job Profile',
                    404,
                    'JD_NOT_FOUND'
                );
            }

            // Delete file from S3
            try {
                await this.deleteFromS3(jdInfo.jdFileName);
            } catch (error) {
                console.error('Error deleting JD from S3:', error);
                // Continue with database update even if S3 deletion fails
            }

            // Update database to remove resume info
            await this.jobProfileRepository.deleteJDInfo(jobProfileId, client);

            await client.commit();

            return {
                message: 'JD deleted successfully',
                deletedFile: jdInfo.jdFileName
            };

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Deleting JD:", error.stack);
            throw new AppError(
                "Failed to Delete JD",
                500,
                "JD_DELETE_ERROR",
                { jobProfileId, operation: "deleteJD" }
            );
        } finally {
            client.release();
        }
    }

    async getJDInfo(jobProfileId) {
        const client = await this.db.getConnection();
        try {
            const jobProfile = await this.jobProfileRepository.findById(jobProfileId, client);
            if (!jobProfile) {
                throw new AppError(
                    `Job Profile with ID ${jobProfileId} not found`,
                    404,
                    'JOB_PROFILE_NOT_FOUND'
                );
            }

            const jdInfo = await this.jobProfileRepository.getJDInfo(jobProfileId, client);

            return {
                hasJD: !!(jdInfo && jdInfo.jdFileName),
                originalName: jdInfo?.jdOriginalName || null,
                uploadDate: jdInfo?.jdUploadDate || null,
                s3Key: jdInfo?.jdFileName || null
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching JD Information:", error.stack);
            throw new AppError(
                "Failed to Fetch JD Information",
                500,
                "JD_FETCH_ERROR",
                { jobProfileId, operation: "getJDInfo" }
            );
        } finally {
            client.release();
        }
    }

    async updateJobProfileJDInfo(jobProfileId, jdData) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            await this.jobProfileRepository.updateJDInfo(
                jobProfileId,
                jdData.jdFileName,
                jdData.jdOriginalName,
                client
            );
            await client.commit();
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Updating JD Information:", error.stack);
            throw new AppError(
                "Failed to Update JD Information",
                500,
                "JD_UPDATE_ERROR",
                { jobProfileId, operation: "updateJobProfileJDInfo" }
            );
        } finally {
            client.release();
        }
    }

    async createJobProfile(jobProfileRequirementData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const exists = await this.jobProfileRepository.existsByRole(
                jobProfileRequirementData.jobRole,
                jobProfileRequirementData.clientId,
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

    async getJobProfileById(jobProfileRequirementId) {
        const client = await this.db.getConnection();
        try {
            const jobProfileRequirement = await this.jobProfileRepository.findById(jobProfileRequirementId, client);

            if (!jobProfileRequirement) {
                throw new AppError(
                    `Job profile with ID ${jobProfileRequirementId} not found`,
                    404,
                    'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
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