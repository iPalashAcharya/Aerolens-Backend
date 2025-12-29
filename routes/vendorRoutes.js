const express = require('express');
const VendorController = require('../controllers/vendorController');
const VendorService = require('../services/vendorService');
const VendorRepository = require('../repositories/vendorRepository');
const VendorValidator = require('../validators/vendorValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const vendorRepository = new VendorRepository(db);
const vendorService = new VendorService(vendorRepository, db);
const vendorController = new VendorController(vendorService);
router.use(authenticate);
router.use(auditContextMiddleware);

router.get('/',
    vendorController.getAll
);

router.post('/',
    VendorValidator.validateCreate,
    vendorController.createVendor
);

router.get('/:vendorId',
    VendorValidator.validateDelete, // Reusing for ID validation
    vendorController.getVendor
);

router.patch('/:vendorId',
    VendorValidator.validateUpdate,
    vendorController.updateVendor
);

router.delete('/:vendorId',
    VendorValidator.validateDelete,
    vendorController.deleteVendor
);

module.exports = router;