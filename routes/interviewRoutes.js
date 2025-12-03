const express = require('express');
const InterviewController = require('../controllers/interviewController');
const InterviewService = require('../services/interviewService');
const InterviewRepository = require('../repositories/interviewRepository');
const InterviewValidator = require('../validators/interviewValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const interviewRepository = new InterviewRepository(db);
const interviewService = new InterviewService(interviewRepository, db);
const interviewController = new InterviewController(interviewService);
router.use(authenticate);
router.use(auditContextMiddleware);

router.get('/',
    interviewController.getAll
);

router.get('/create-data',
    interviewController.getCreateData
);

router.post('/',
    InterviewValidator.validateCreate,
    interviewController.createInterview
);

router.patch('/:interviewId',
    InterviewValidator.validateUpdate,
    interviewController.updateInterview
);

router.put('/:interviewId/rounds',
    InterviewValidator.validateRoundUpdate,
    interviewController.updateInterviewRounds
);

router.put('/:interviewId/finalize',
    InterviewValidator.validateFinalize,
    interviewController.finalizeInterview
);

router.get('/:interviewId',
    InterviewValidator.validateDelete,
    interviewController.getById
);

router.get('/:interviewId/rounds',
    InterviewValidator.validateDelete,
    interviewController.getInterviewRounds
);

router.delete('/:interviewId',
    InterviewValidator.validateDelete,
    interviewController.deleteInterview
);

module.exports = router;