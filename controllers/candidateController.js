const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
const path = require('path');
const fs = require('fs');

class CandidateController {
    constructor(candidateService) {
        this.candidateService = candidateService;
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

    createCandidate = catchAsync(async (req, res, next) => {
        try {
            const candidateData = req.body;
            console.log("Candidate body:", JSON.stringify(req.body, null, 2));
            console.log("File info:", req.file);

            // Step 1: Create candidate record in DB without resume info
            const candidate = await this.candidateService.createCandidate(candidateData, req.auditContext);

            if (req.file) {
                // Step 2: Rename the S3 file with the proper candidateId
                const renamedFileInfo = await this.candidateService.renameS3File(
                    req.file.key,
                    candidate.candidateId,
                    req.file.originalname
                );

                // Step 3: Update candidate resume info in DB with new S3 key
                await this.candidateService.updateCandidateResumeInfo(candidate.candidateId, {
                    resumeFilename: renamedFileInfo.newKey,
                    resumeOriginalName: req.file.originalname,
                    resumeUploadDate: new Date()
                });
            }

            return ApiResponse.success(res, candidate, "Candidate created successfully", 201);
        } catch (error) {
            // If error occurs and file was uploaded to S3, delete it
            if (req.file && req.file.key) {
                try {
                    await this.candidateService.deleteFromS3(req.file.key);
                } catch (deleteError) {
                    console.error('Error deleting S3 file after creation failure:', deleteError);
                }
            }
            next(error);
        }
    });

    getCandidate = catchAsync(async (req, res) => {
        const candidate = await this.candidateService.getCandidateById(
            parseInt(req.params.id)
        );

        return ApiResponse.success(
            res,
            candidate,
            'Candidate retrieved successfully'
        );
    });

    getCreateData = catchAsync(async (req, res) => {
        const formData = await this.candidateService.getFormData();
        res.status(200).json({
            success: true,
            message: "Interview Form Data retrieved successfully",
            data: {
                recruiters: formData.recruiters,
                //status: formData.status,
                locations: formData.locations
            }
        });
    });


    getAllCandidates = catchAsync(async (req, res) => {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));

        const candidates = await this.candidateService.getAllCandidates();

        return ApiResponse.success(
            res,
            candidates,
            'Candidates retrieved successfully'
        );
    });

    updateCandidate = catchAsync(async (req, res, next) => {
        try {
            const candidateId = parseInt(req.params.id);

            // If new file is uploaded, delete old resume first
            if (req.file) {
                const resumeInfo = await this.candidateService.getResumeInfo(candidateId);
                if (resumeInfo.hasResume && resumeInfo.s3Key) {
                    try {
                        await this.candidateService.deleteFromS3(resumeInfo.s3Key);
                        console.log(`Deleted old resume: ${resumeInfo.s3Key}`);
                    } catch (deleteError) {
                        console.error('Error deleting old resume:', deleteError);
                        // Continue with update even if old file deletion fails
                    }
                }
            }

            const updatedCandidate = await this.candidateService.updateCandidate(
                candidateId,
                req.body,
                req.auditContext
            );

            if (req.file) {
                // Update candidate resume info in DB with new S3 key
                await this.candidateService.updateCandidateResumeInfo(candidateId, {
                    resumeFilename: req.file.key,
                    resumeOriginalName: req.file.originalname,
                    resumeUploadDate: new Date()
                });
            }

            return ApiResponse.success(
                res,
                updatedCandidate,
                'Candidate updated successfully'
            );
        } catch (error) {
            // If error occurs and file was uploaded to S3, delete it
            if (req.file && req.file.key) {
                try {
                    await this.candidateService.deleteFromS3(req.file.key);
                } catch (deleteError) {
                    console.error('Error deleting S3 file after update failure:', deleteError);
                }
            }
            next(error);
        }
    });

    deleteCandidate = catchAsync(async (req, res) => {
        // Delete resume from S3 if exists
        const resumeInfo = await this.candidateService.getResumeInfo(parseInt(req.params.id));
        if (resumeInfo.hasResume) {
            await this.candidateService.deleteResume(parseInt(req.params.id));
        }

        await this.candidateService.deleteCandidate(parseInt(req.params.id), req.auditContext);
        return ApiResponse.success(
            res,
            null,
            'Candidate deleted successfully'
        );
    });

    uploadResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        if (!req.file) {
            throw new AppError('No resume file uploaded', 400, 'NO_FILE_UPLOADED');
        }

        // Delete old resume before uploading new one
        const resumeInfo = await this.candidateService.getResumeInfo(candidateId);
        if (resumeInfo.hasResume && resumeInfo.s3Key) {
            try {
                await this.candidateService.deleteFromS3(resumeInfo.s3Key);
                console.log(`Deleted old resume: ${resumeInfo.s3Key}`);
            } catch (deleteError) {
                console.error('Error deleting old resume:', deleteError);
                // Continue with upload even if old file deletion fails
            }
        }

        const result = await this.candidateService.uploadResume(candidateId, req.file);

        return ApiResponse.success(
            res,
            result,
            'Resume uploaded successfully',
            200
        );
    });

    downloadResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeData = await this.candidateService.downloadResume(candidateId);
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { s3Client, bucketName } = this.candidateService;

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: resumeData.s3Key
        });

        const s3Response = await s3Client.send(command);

        const mimeType = this.getMimeType(resumeData.originalName);
        const sanitizedFilename = this.sanitizeFilename(resumeData.originalName);

        // Set headers for download
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }

        // Stream the S3 response to client
        // Handle both Node.js streams and Web streams
        if (s3Response.Body.pipe) {
            // Node.js stream
            s3Response.Body.pipe(res);
        } else {
            // Web stream (AWS SDK v3)
            const stream = s3Response.Body;
            for await (const chunk of stream) {
                res.write(chunk);
            }
            res.end();
        }
    });

    previewResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeData = await this.candidateService.downloadResume(candidateId);
        if (!this.supportsInlinePreview(resumeData.originalName)) {
            throw new AppError(
                'Preview is only supported for PDF files. Please download the file instead.',
                400,
                'PREVIEW_NOT_SUPPORTED',
                {
                    fileType: path.extname(resumeData.originalName),
                    supportedTypes: ['.pdf']
                }
            );
        }
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { s3Client, bucketName } = this.candidateService;

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: resumeData.s3Key
        });

        const s3Response = await s3Client.send(command);

        const mimeType = this.getMimeType(resumeData.originalName);
        const sanitizedFilename = this.sanitizeFilename(resumeData.originalName);

        // Set headers for inline preview
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${sanitizedFilename}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }

        // Stream the S3 response to client
        if (s3Response.Body.pipe) {
            // Node.js stream
            s3Response.Body.pipe(res);
        } else {
            // Web stream (AWS SDK v3)
            const stream = s3Response.Body;
            for await (const chunk of stream) {
                res.write(chunk);
            }
            res.end();
        }
    });

    deleteResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const result = await this.candidateService.deleteResume(candidateId);

        return ApiResponse.success(
            res,
            result,
            'Resume deleted successfully',
            200
        );
    });

    getResumeInfo = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeInfo = await this.candidateService.getResumeInfo(candidateId);

        if (resumeInfo.hasResume && resumeInfo.originalName) {
            const ext = path.extname(resumeInfo.originalName).toLowerCase();
            resumeInfo.fileExtension = ext;
            resumeInfo.mimeType = this.getMimeType(resumeInfo.originalName);
            resumeInfo.supportsPreview = this.supportsInlinePreview(resumeInfo.originalName);
        }

        return ApiResponse.success(
            res,
            resumeInfo,
            'Resume information retrieved successfully',
            200
        );
    });
}

module.exports = CandidateController;