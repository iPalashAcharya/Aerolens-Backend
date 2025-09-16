const express = require('express');
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
    CandidateValidator.validateCreate,
    candidateController.createCandidate
);

router.get('/:id',
    CandidateValidator.validateDelete, // Reusing for ID validation
    candidateController.getCandidate
);

router.patch('/:id',
    CandidateValidator.validateUpdate,
    candidateController.updateCandidate
);

router.delete('/:id',
    CandidateValidator.validateDelete,
    candidateController.deleteCandidate
);

module.exports = router;