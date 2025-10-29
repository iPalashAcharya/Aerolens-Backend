const express = require('express');
const JobProfileController = require('../controllers/jobProfileController');
const JobProfileService = require('../services/jobProfileService');
const JobProfileRepository = require('../repositories/jobProfileRepository');
const JobProfileValidator = require('../validators/jobProfileValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

// Dependency injection
const jobProfileRepository = new JobProfileRepository(db);
const jobProfileService = new JobProfileService(jobProfileRepository, db);
const jobProfileController = new JobProfileController(jobProfileService);
router.use(authenticate);
router.use(auditContextMiddleware);

// Routes
/*router.get('/client/:clientId',
    departmentController.getDepartmentsByClient
);*/

router.get('/',
    jobProfileController.getAllJobProfile
)

router.post('/',
    JobProfileValidator.validateCreate,
    jobProfileController.createJobProfile
);

router.get('/:id',
    JobProfileValidator.validateDelete, // Reusing for ID validation
    jobProfileController.getJobProfile
);

router.patch('/:id',
    JobProfileValidator.validateUpdate,
    jobProfileController.updateJobProfile
);

router.delete('/:id',
    JobProfileValidator.validateDelete,
    jobProfileController.deleteJobProfile
);

module.exports = router;