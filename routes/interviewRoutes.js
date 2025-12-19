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

router.get('/candidate/:candidateId',
    InterviewValidator.validateParams,
    interviewController.getInterviewsByCandidateId
);

router.get('/:interviewId',
    InterviewValidator.validateParams,
    interviewController.getById
);

router.get('/report/overall',
    interviewController.getTotalSummary
);

router.get(
    '/report/monthly',
    InterviewValidator.validateQuery,
    interviewController.getMonthlySummary
);

router.get(
    '/report/daily',
    InterviewValidator.validateDailyQuery,
    interviewController.getDailySummary
);

router.post('/:candidateId',
    InterviewValidator.validateParams,
    InterviewValidator.validateCreate,
    interviewController.createInterview
);

router.post('/:candidateId/rounds',
    InterviewValidator.validateParams,
    InterviewValidator.validateScheduleRound,
    interviewController.scheduleNextRound
);

router.patch('/:interviewId',
    InterviewValidator.validateParams,
    InterviewValidator.validateUpdate,
    interviewController.updateInterview
);

router.put('/:interviewId/finalize',
    InterviewValidator.validateParams,
    InterviewValidator.validateFinalize,
    interviewController.finalizeInterview
);

router.delete('/:interviewId',
    InterviewValidator.validateParams,
    interviewController.deleteInterview
);

module.exports = router;