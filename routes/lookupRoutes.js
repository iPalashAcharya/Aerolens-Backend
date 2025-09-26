const express = require('express');
const LookupController = require('../controllers/lookupController');
const LookupService = require('../services/lookupService');
const LookupRepository = require('../repositories/lookupRepository');
const LookupValidator = require('../validators/lookupValidator');
const db = require('../db');

const router = express.Router();

const lookupRepository = new LookupRepository(db);
const lookupService = new LookupService(lookupRepository, db);
const lookupController = new LookupController(lookupService);


router.get('/',
    lookupController.getAll
);

router.post('/',
    LookupValidator.validateCreate,
    lookupController.createLookup
);

router.get('/:lookupKey',
    LookupValidator.validateDelete,
    lookupController.getByKey
);

router.delete('/:lookupKey',
    LookupValidator.validateDelete,
    lookupController.deleteLookup
);

module.exports = router;