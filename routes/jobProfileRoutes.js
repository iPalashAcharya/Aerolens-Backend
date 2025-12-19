const express = require('express');
const JobProfileController = require('../controllers/jobProfileController');
const JobProfileService = require('../services/jobProfileService');
const JobProfileRepository = require('../repositories/jobProfileRepository');
const JobProfileValidator = require('../validators/jobProfileValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');
const cleanupS3OnError = require('../middleware/s3CleanupMiddleware');

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
);

router.post('/:id/upload-JD',
    JobProfileValidator.validateDelete,
    (req, res, next) => {
        jobProfileService.upload.single('JD')(req, res, (err) => {
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
    jobProfileController.uploadJD,
    cleanupS3OnError
);

router.get('/:id/get-JD',
    JobProfileValidator.validateDelete,
    jobProfileController.downloadJD
);

router.get('/:id/get-JD/preview',
    JobProfileValidator.validateDelete,
    jobProfileController.previewJD
);

router.delete('/:id/delete-JD',
    JobProfileValidator.validateDelete,
    jobProfileController.deleteJD
);

router.get('/:id/JD/info',
    JobProfileValidator.validateDelete,
    jobProfileController.getJDInfo
);

router.post('/',
    jobProfileService.upload.single('JD'),
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
    JobProfileValidator.normalizeMultipartBody,
    JobProfileValidator.validateCreate,
    JobProfileValidator.validateJDUpload,
    jobProfileController.createJobProfile,
    cleanupS3OnError
);

router.get('/:id',
    JobProfileValidator.validateDelete, // Reusing for ID validation
    jobProfileController.getJobProfile
);

router.patch('/:id',
    jobProfileService.upload.single('JD'),
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
    JobProfileValidator.normalizeMultipartBody, //to normalise location json object
    JobProfileValidator.validateUpdate,
    JobProfileValidator.validateJDUpload,
    jobProfileController.updateJobProfile,
    cleanupS3OnError
);

router.delete('/:id',
    JobProfileValidator.validateDelete,
    jobProfileController.deleteJobProfile
);

module.exports = router;