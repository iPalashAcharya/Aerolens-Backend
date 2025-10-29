const express = require('express');
const ContactController = require('../controllers/contactController');
const ContactService = require('../services/contactService');
const ContactRepository = require('../repositories/contactRepository');
const ContactValidator = require('../validators/contactValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const contactRepository = new ContactRepository(db);
const contactService = new ContactService(contactRepository, db);
const contactController = new ContactController(contactService);
router.use(authenticate);
router.use(auditContextMiddleware);

router.post('/',
    ContactValidator.validateCreate,
    contactController.createContact
);

router.patch('/:contactId',
    ContactValidator.validateUpdate,
    contactController.updateContact
);

router.delete('/:contactId',
    ContactValidator.validateDelete,
    contactController.deleteContact
);

module.exports = router;