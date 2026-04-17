const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const auditContextMiddleware = require('../middleware/auditContext');
const auditLogController = require('../controllers/auditLogController');

const router = express.Router();

router.use(authenticate);
router.use(auditContextMiddleware);

router.get('/', auditLogController.list);
router.get('/:id', auditLogController.getById);

module.exports = router;
