const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Controller for bulk candidate uploads
 */
class CandidateBulkController {
    constructor(candidateBulkService, candidateService) {
        this.candidateBulkService = candidateBulkService;
        this.candidateService = candidateService;
        this._initializeUpload();
    }

    /**
     * Configure multer for bulk file uploads
     * Stores temporarily on disk for streaming
     */
    _initializeUpload() {
        const uploadDir = path.join(__dirname, '../uploads/bulk');

        // Ensure upload directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                cb(null, `bulk-${uniqueSuffix}${ext}`);
            }
        });

        const fileFilter = (req, file, cb) => {
            const allowedMimeTypes = [
                'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ];

            if (allowedMimeTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new AppError(
                    'Only CSV and Excel files are allowed',
                    400,
                    'INVALID_FILE_TYPE'
                ), false);
            }
        };

        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 10 * 1024 * 1024 // 10MB
            },
            fileFilter: fileFilter
        });
    }

    /**
     * Bulk upload endpoint
     */
    uploadBulk = catchAsync(async (req, res, next) => {
        if (!req.file) {
            throw new AppError('No file uploaded', 400, 'NO_FILE_UPLOADED');
        }

        try {
            const result = await this.candidateBulkService.processBulkUpload(req.file, {
                userId: req.user?.userId,
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            });

            return ApiResponse.success(
                res,
                result,
                'Bulk upload completed',
                result.summary.failed > 0 ? 207 : 201 // 207 Multi-Status if partial success
            );

        } catch (error) {
            next(error);
        }
    });

    /**
     * Download CSV template
     */
    downloadTemplate = catchAsync(async (req, res) => {
        const template = await this.candidateBulkService.generateTemplate();

        // Build CSV string
        const csvRows = [];

        // Headers
        csvRows.push(template.headers.join(','));

        // Sample data
        template.sampleData.forEach(row => {
            const values = template.headers.map(header => {
                const value = row[header];
                // Escape quotes and wrap in quotes if contains comma
                if (value === null || value === undefined) return '';
                const str = String(value);
                return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
            });
            csvRows.push(values.join(','));
        });

        const csv = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="candidate_bulk_upload_template.csv"');
        res.send(csv);
    });

    /**
     * Validate bulk upload file without inserting
     * Useful for pre-flight validation
     */
    validateBulk = catchAsync(async (req, res, next) => {
        if (!req.file) {
            throw new AppError('No file uploaded', 400, 'NO_FILE_UPLOADED');
        }

        try {
            // TODO: Implement dry-run validation
            // This would parse and validate without database commits

            return ApiResponse.success(
                res,
                { message: 'Validation not yet implemented' },
                'File validation'
            );

        } catch (error) {
            next(error);
        }
    });

    /**
     * Get bulk upload statistics/history
     */
    getUploadHistory = catchAsync(async (req, res) => {
        // TODO: Implement upload history tracking
        // Store bulk upload jobs in a separate table with status

        return ApiResponse.success(
            res,
            { history: [] },
            'Upload history retrieved'
        );
    });
}

module.exports = CandidateBulkController;