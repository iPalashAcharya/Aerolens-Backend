const express = require('express');
const JobProfileRequirementController = require('../controllers/jobProfileRequirementController');
const JobProfileRequirementService = require('../services/jobProfileRequirementService');
const JobProfileRequirementRepository = require('../repositories/jobProfileRequirementRepository');
const JobProfileRequirementValidator = require('../validators/jobProfileRequirementValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

// Dependency injection
const jobProfileRequirementRepository = new JobProfileRequirementRepository(db);
const jobProfileRequirementService = new JobProfileRequirementService(jobProfileRequirementRepository, db);
const jobProfileRequirementController = new JobProfileRequirementController(jobProfileRequirementService);
router.use(authenticate);
router.use(auditContextMiddleware);

// Routes
/*router.get('/client/:clientId',
    departmentController.getDepartmentsByClient
);*/

router.get('/',
    jobProfileRequirementController.getAllJobProfileRequirements
);

router.post('/',
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
                key: req.file.key,
                location: req.file.location,
                bucket: req.file.bucket
            });
        } else {
            console.log("No file");
        }
        console.log("=============================================");
        next();
    },
    JobProfileRequirementValidator.validateCreate,
    jobProfileRequirementController.createJobProfileRequirement
);

router.get('/:id',
    JobProfileRequirementValidator.validateDelete, // Reusing for ID validation
    jobProfileRequirementController.getJobProfileRequirement
);

router.patch('/:id',
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
                key: req.file.key,
                location: req.file.location,
                bucket: req.file.bucket
            });
        } else {
            console.log("No file");
        }
        console.log("=============================================");
        next();
    },
    JobProfileRequirementValidator.validateUpdate,
    jobProfileRequirementController.updateJobProfileRequirement
);

router.delete('/:id',
    JobProfileRequirementValidator.validateDelete,
    jobProfileRequirementController.deleteJobProfileRequirement
);

module.exports = router;