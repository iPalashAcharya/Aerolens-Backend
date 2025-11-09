const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const path = require('path');
const fs = require('fs');

class CandidateController {
    constructor(candidateService) {
        this.candidateService = candidateService;
    }

    createCandidate = catchAsync(async (req, res, next) => {
        try {
            const candidateData = req.body;
            console.log("Candidate body:", JSON.stringify(req.body, null, 2));
            console.log("File info:", req.file);

            // Step 1: Create candidate record in DB without resume info
            const candidate = await this.candidateService.createCandidate(candidateData, req.auditContext);

            if (req.file) {
                // Step 2: File is already uploaded to S3 by multer-s3
                // Update candidate resume info in DB with S3 key
                await this.candidateService.updateCandidateResumeInfo(candidate.candidateId, {
                    resumeFilename: req.file.key, // S3 key
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

    /*async createCandidate(req, res, next) {
        try {
            const candidateData = req.body;

            // Step 1: Create candidate record in DB without resume info
            const candidate = await this.candidateService.createCandidate(candidateData);

            if (req.file) {
                // Step 2: Define the new filename using candidateId
                const originalExtension = path.extname(req.file.originalname);
                const newFilename = `candidate_${candidate.candidateId}${originalExtension}`;

                // Step 3: Rename/move the file on disk
                const resumeDir = path.join(__dirname, '..', 'resumes');
                const oldPath = req.file.path; // temp location by multer
                const newPath = path.join(resumeDir, newFilename);

                // Rename the file asynchronously
                await fs.promises.rename(oldPath, newPath);

                // Step 4: Update candidate resume info in DB
                await this.candidateService.updateCandidateResumeInfo(candidate.candidateId, {
                    resumeFilename: newFilename,
                    resumeOriginalName: req.file.originalname,
                    resumeUploadDate: new Date()
                });
            }

            return ApiResponse.success(res, candidate, "Candidate created successfully", 201);
        } catch (error) {
            next(error);
        }
    }*/

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

    getAllCandidates = catchAsync(async (req, res) => {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));

        const candidates = await this.candidateService.getAllCandidatesWithPagination(page, pageSize);

        return ApiResponse.success(
            res,
            candidates,
            'Candidates retrieved successfully'
        );
    });

    updateCandidate = catchAsync(async (req, res, next) => {
        try {
            const updatedCandidate = await this.candidateService.updateCandidate(
                parseInt(req.params.id),
                req.body,
                req.auditContext
            );

            if (req.file) {
                // File is already uploaded to S3 by multer-s3
                // Update candidate resume info in DB with S3 key
                await this.candidateService.updateCandidateResumeInfo(req.params.id, {
                    resumeFilename: req.file.key, // S3 key
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

        // Return presigned URL for S3 download
        return ApiResponse.success(
            res,
            {
                downloadUrl: resumeData.downloadUrl,
                originalName: resumeData.originalName,
                expiresIn: 900 // 15 minutes
            },
            'Resume download URL generated successfully'
        );
    });

    previewResume = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.id);

        const resumeData = await this.candidateService.downloadResume(candidateId);

        res.redirect(resumeData.downloadUrl);
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

        return ApiResponse.success(
            res,
            resumeInfo,
            'Resume information retrieved successfully',
            200
        );
    });
}

module.exports = CandidateController;