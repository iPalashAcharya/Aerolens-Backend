const express = require('express');
const multer = require('multer');
const CandidateController = require('../controllers/candidateController');
const CandidateService = require('../services/candidateService');
const CandidateRepository = require('../repositories/candidateRepository');
const CandidateBulkService = require('../services/candidateBulkService');
const CandidateBulkController = require('../controllers/candidateBulkController');
const {
    CandidateValidator,
    CandidateValidatorHelper
} = require('../validators/candidateValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');
const AppError = require('../utils/appError');
const cleanupS3OnError = require('../middleware/s3CleanupMiddleware');
const candidateRepository = new CandidateRepository(db);
const candidateService = new CandidateService(candidateRepository, db);
const candidateController = new CandidateController(candidateService);

// Initialize validator helper
const validatorHelper = new CandidateValidatorHelper(db);

// Initialize bulk service
const candidateBulkService = new CandidateBulkService(
    candidateRepository,
    validatorHelper,
    db
);

// Initialize bulk controller
const candidateBulkController = new CandidateBulkController(
    candidateBulkService,
    candidateService
);

const router = express.Router();

router.use(authenticate);
router.use(auditContextMiddleware);

// Routes
router.get('/',
    candidateController.getAllCandidates
);

router.get('/create-data',
    candidateController.getCreateData
);

router.post('/',
    (req, res, next) => {
        if (req.is('multipart/form-data')) {
            return candidateService.upload.single('resume')(req, res, next);
        }
        next();
    },
    (req, res, next) => {
        console.log("==== Parsed body BEFORE validator ====");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("==== File info ====");
        if (req.file) {
            console.log({
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                key: req.file.key, // S3 key
                location: req.file.location, // S3 URL
                bucket: req.file.bucket // S3 bucket
            });
        } else {
            console.log("No file");
        }
        console.log("=============================================");
        next();
    },
    CandidateValidator.validateCreate,
    candidateController.createCandidate,
    cleanupS3OnError
);

router.post('/:id/resume',
    CandidateValidator.validateDelete,
    (req, res, next) => {
        candidateService.upload.single('resume')(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return next(new AppError('File too large. Maximum size is 5MB', 400, 'FILE_TOO_LARGE'));
                    }
                    return next(new AppError(err.message, 400, 'MULTER_ERROR'));
                }
                return next(err);
            }
            next();
        });
    },
    candidateController.uploadResume,
    cleanupS3OnError
);

router.get('/:id/resume',
    CandidateValidator.validateDelete,
    candidateController.downloadResume
);

router.get('/:id/resume/preview',
    CandidateValidator.validateDelete,
    candidateController.previewResume
);

router.delete('/:id/resume',
    CandidateValidator.validateDelete,
    candidateController.deleteResume
);

router.get('/:id/resume/info',
    CandidateValidator.validateDelete,
    candidateController.getResumeInfo
);

router.get('/:id',
    CandidateValidator.validateDelete,
    candidateController.getCandidate
);

router.patch('/:id',
    candidateService.upload.single('resume'),
    (req, res, next) => {
        console.log("==== Parsed body BEFORE validator ====");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("==== File info ====");
        if (req.file) {
            console.log({
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                key: req.file.key, // S3 key
                location: req.file.location, // S3 URL
                bucket: req.file.bucket // S3 bucket
            });
        } else {
            console.log("No file");
        }
        console.log("=============================================");
        next();
    },
    CandidateValidator.validateUpdate,
    candidateController.updateCandidate,
    cleanupS3OnError
);

router.delete('/:id',
    CandidateValidator.validateDelete,
    candidateController.deleteCandidate
);

router.post(
    '/bulk-upload',
    authenticate,
    candidateBulkController.upload.single('file'),
    candidateBulkController.uploadBulk
);
// Download template
router.get(
    '/bulk-upload/template',
    authenticate,
    candidateBulkController.downloadTemplate
);

module.exports = router;