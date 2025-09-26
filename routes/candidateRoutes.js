const express = require('express');
const multer = require('multer');
const CandidateController = require('../controllers/candidateController');
const CandidateService = require('../services/candidateService');
const CandidateRepository = require('../repositories/candidateRepository');
const CandidateValidator = require('../validators/candidateValidator');
const db = require('../db');

const router = express.Router();

// Dependency injection
const candidateRepository = new CandidateRepository(db);
const candidateService = new CandidateService(candidateRepository, db);
const candidateController = new CandidateController(candidateService);

// Routes
/*router.get('/client/:clientId',
    departmentController.getDepartmentsByClient
);*/

router.get('/',
    candidateController.getAllCandidates
);

router.post('/',
    candidateService.upload.single('resume'),
    CandidateValidator.validateCreate,
    candidateController.createCandidate
);

router.post('/:id/resume',
    CandidateValidator.validateDelete,
    (req, res, next) => {
        // Use the upload middleware from candidateService
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
    candidateService.upload.single('resume'),
    CandidateValidator.validateUpdate,
    candidateController.updateCandidate
);

router.delete('/:id',
    CandidateValidator.validateDelete,
    candidateController.deleteCandidate
);

module.exports = router;