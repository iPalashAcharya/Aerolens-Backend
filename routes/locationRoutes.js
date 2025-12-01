const express = require('express');
const LocationController = require('../controllers/locationController');
const LocationService = require('../services/locationService');
const LocationRepository = require('../repositories/locationRepository');
const LocationValidator = require('../validators/locationValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const locationRepository = new LocationRepository(db);
const locationService = new LocationService(locationRepository, db);
const locationController = new LocationController(locationService);
router.use(authenticate);
router.use(auditContextMiddleware);


router.get('/',
    locationController.getAll
);

router.post('/',
    LocationValidator.validateCreate,
    locationController.createLocation
)

router.patch('/:locationId',
    LocationValidator.validateUpdate,
    locationController.updateLocation
);

router.get('/:locationId',
    LocationValidator.validateParams,
    locationController.getById
);

router.delete('/:locationId',
    LocationValidator.validateDelete,
    locationController.deleteLocation
);

module.exports = router;