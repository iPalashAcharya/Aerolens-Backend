const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
const path = require('path');

class JobProfileController {
    constructor(jobProfileService) {
        this.jobProfileService = jobProfileService;
    }

    getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    supportsInlinePreview(filename) {
        const ext = path.extname(filename).toLowerCase();
        return ext === '.pdf';
    }

    sanitizeFilename(filename) {
        return filename.replace(/["\\\r\n]/g, '');
    }

    uploadJD = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.id);

        if (!req.file) {
            throw new AppError('No JD file uploaded', 400, 'NO_FILE_UPLOADED');
        }

        const jdInfo = await this.jobProfileService.getJDInfo(jobProfileId);
        if (jdInfo.hasJD && jdInfo.s3Key) {
            try {
                await this.jobProfileService.deleteFromS3(jdInfo.s3Key);
                console.log(`Deleted old JD: ${jdInfo.s3Key}`);
            } catch (deleteError) {
                console.error('Error deleting old JD:', deleteError);
            }
        }

        const result = await this.jobProfileService.uploadJD(jobProfileId, req.file);

        return ApiResponse.success(
            res,
            result,
            'JD uploaded successfully',
            200
        );
    });

    downloadJD = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.id);

        const jdData = await this.jobProfileService.downloadJD(jobProfileId);
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { s3Client, bucketName } = this.jobProfileService;

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: jdData.s3Key
        });

        const s3Response = await s3Client.send(command);

        const mimeType = this.getMimeType(jdData.originalName);
        const sanitizedFilename = this.sanitizeFilename(jdData.originalName);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }

        if (s3Response.Body.pipe) {
            s3Response.Body.pipe(res);
        } else {
            const stream = s3Response.Body;
            for await (const chunk of stream) {
                res.write(chunk);
            }
            res.end();
        }
    });

    previewJD = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.id);

        const jdData = await this.jobProfileService.downloadJD(jobProfileId);

        if (!this.supportsInlinePreview(jdData.originalName)) {
            throw new AppError(
                'Preview is only supported for PDF files. Please download the file instead.',
                400,
                'PREVIEW_NOT_SUPPORTED',
                {
                    fileType: path.extname(jdData.originalName),
                    supportedTypes: ['.pdf']
                }
            );
        }

        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { s3Client, bucketName } = this.jobProfileService;

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: jdData.s3Key
        });

        const s3Response = await s3Client.send(command);

        const mimeType = this.getMimeType(jdData.originalName);
        const sanitizedFilename = this.sanitizeFilename(jdData.originalName);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${sanitizedFilename}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }

        if (s3Response.Body.pipe) {
            s3Response.Body.pipe(res);
        } else {
            const stream = s3Response.Body;
            for await (const chunk of stream) {
                res.write(chunk);
            }
            res.end();
        }
    });

    deleteJD = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.id);

        const result = await this.jobProfileService.deleteJD(jobProfileId);

        return ApiResponse.success(
            res,
            result,
            'JD deleted successfully',
            200
        );
    });

    getJDInfo = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.id);

        const jdInfo = await this.jobProfileService.getJDInfo(jobProfileId);

        if (jdInfo.hasJD && jdInfo.originalName) {
            const ext = path.extname(jdInfo.originalName).toLowerCase();
            jdInfo.fileExtension = ext;
            jdInfo.mimeType = this.getMimeType(jdInfo.originalName);
            jdInfo.supportsPreview = this.supportsInlinePreview(jdInfo.originalName);
        }

        return ApiResponse.success(
            res,
            jdInfo,
            'JD information retrieved successfully',
            200
        );
    });

    createJobProfile = catchAsync(async (req, res, next) => {
        try {
            const jobProfileData = req.body;

            const jobProfile = await this.jobProfileService.createJobProfile(jobProfileData, req.auditContext);

            if (req.file) {
                const renamedFileInfo = await this.jobProfileService.renameS3File(
                    req.file.key,
                    jobProfile.jobProfileId,
                    req.file.originalname
                );

                await this.jobProfileService.updateJobProfileJDInfo(jobProfile.jobProfileId, {
                    jdFileName: renamedFileInfo.newKey,
                    jdOriginalName: req.file.originalname,
                    jdUploadDate: new Date()
                });
            }

            return ApiResponse.success(res, jobProfile, "Job Profile created successfully", 201);
        } catch (error) {
            if (req.file && req.file.key) {
                try {
                    await this.jobProfileService.deleteFromS3(req.file.key);
                } catch (deleteError) {
                    console.error('Error deleting S3 file after creation failure:', deleteError);
                }
            }
            next(error);
        }
    });

    getJobProfile = catchAsync(async (req, res) => {
        const jobProfile = await this.jobProfileService.getJobProfileById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            jobProfile,
            'Job Profile retrieved successfully'
        );
    });

    getAllJobProfile = catchAsync(async (req, res) => {
        const jobProfiles = await this.jobProfileService.getAllJobProfiles();
        return ApiResponse.success(
            res,
            jobProfiles,
            'Job Profiles retrieved successfully'
        );
    });

    updateJobProfile = catchAsync(async (req, res, next) => {
        try {
            const jobProfileId = parseInt(req.params.id);

            if (req.file) {
                const jdInfo = await this.jobProfileService.getJDInfo(jobProfileId);
                if (jdInfo.hasJD && jdInfo.s3Key) {
                    try {
                        await this.jobProfileService.deleteFromS3(jdInfo.s3Key);
                        console.log(`Deleted old JD: ${jdInfo.s3Key}`);
                    } catch (deleteError) {
                        console.error('Error deleting old JD:', deleteError);
                    }
                }
            }

            const updatedJobProfile = await this.jobProfileService.updateJobProfile(
                jobProfileId,
                req.body,
                req.auditContext
            );

            if (req.file) {
                await this.jobProfileService.updateJobProfileJDInfo(jobProfileId, {
                    jdFileName: req.file.key,
                    jdOriginalName: req.file.originalname,
                    jdUploadDate: new Date()
                });
            }

            return ApiResponse.success(
                res,
                updatedJobProfile,
                'Job Profile updated successfully'
            );
        } catch (error) {
            if (req.file && req.file.key) {
                try {
                    await this.jobProfileService.deleteFromS3(req.file.key);
                } catch (deleteError) {
                    console.error('Error deleting S3 file after update failure:', deleteError);
                }
            }
            next(error);
        }
    });

    deleteJobProfile = catchAsync(async (req, res) => {
        const jobProfileId = parseInt(req.params.id);

        const jdInfo = await this.jobProfileService.getJDInfo(jobProfileId);
        if (jdInfo.hasJD && jdInfo.s3Key) {
            await this.jobProfileService.deleteJD(jobProfileId);
        }

        await this.jobProfileService.deleteJobProfile(jobProfileId, req.auditContext);

        return ApiResponse.success(
            res,
            null,
            'Job Profile deleted successfully'
        );
    });

    getAllJobProfilesWithPagination = catchAsync(async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        const result = await this.jobProfileService.getAllJobProfilesWithPagination(page, pageSize);

        return ApiResponse.success(
            res,
            result,
            'Job Profiles retrieved successfully'
        );
    });
}

module.exports = JobProfileController;