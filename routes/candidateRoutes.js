const express = require('express');
const multer = require('multer');
const CandidateController = require('../controllers/candidateController');
const CandidateService = require('../services/candidateService');
const CandidateRepository = require('../repositories/candidateRepository');
const CandidateValidator = require('../validators/candidateValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const cors = require('cors');
const auditContextMiddleware = require('../middleware/auditContext');
const AppError = require('../utils/appError');
const corsOptions = {
    origin: 'http://localhost:5173',
    methods: ['PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
const router = express.Router();

router.options('/:id', cors(corsOptions));

// Dependency injection
const candidateRepository = new CandidateRepository(db);
const candidateService = new CandidateService(candidateRepository, db);
const candidateController = new CandidateController(candidateService);
router.use(authenticate);
router.use(auditContextMiddleware)

// Routes
/*router.get('/client/:clientId',
    departmentController.getDepartmentsByClient
);*/

router.get('/',
    candidateController.getAllCandidates
);

router.post('/',
    candidateService.upload.single('resume'),
    (req, res, next) => {                       // logger runs AFTER multer but BEFORE validator
        console.log("==== Parsed body BEFORE validator ====");
        console.log(JSON.stringify(req.body, null, 2));  // parsed fields
        console.log("==== File info ====");
        if (req.file) {
            console.log({
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: req.file.path
            });
        } else {
            console.log("No file");
        }
        console.log("=============================================");
        next();
    },
    CandidateValidator.validateCreate,
    candidateController.createCandidate
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
    candidateController.uploadResume
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
    cors(corsOptions),
    candidateService.upload.single('resume'),
    (req, res, next) => {                       // logger runs AFTER multer but BEFORE validator
        console.log("==== Parsed body BEFORE validator ====");
        console.log(JSON.stringify(req.body, null, 2));  // parsed fields
        console.log("==== File info ====");
        if (req.file) {
            console.log({
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: req.file.path
            });
        } else {
            console.log("No file");
        }
        console.log("=============================================");
        next();
    },
    CandidateValidator.validateUpdate,
    candidateController.updateCandidate
);

router.delete('/:id',
    CandidateValidator.validateDelete,
    candidateController.deleteCandidate
);

module.exports = router;