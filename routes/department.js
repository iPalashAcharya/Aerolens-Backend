const express = require('express');
const DepartmentController = require('../controllers/departmentController');
const DepartmentService = require('../services/departmentService');
const DepartmentRepository = require('../repositories/departmentRepository');
const DepartmentValidator = require('../validators/departmentValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const departmentRepository = new DepartmentRepository(db);
const departmentService = new DepartmentService(departmentRepository, db);
const departmentController = new DepartmentController(departmentService);
router.use(authenticate);
router.use(auditContextMiddleware);

router.get('/client/:clientId', departmentController.getDepartmentsByClient);

router.get('/client/:clientId/deleted', departmentController.getDeletedDepartments);

router.post('/', DepartmentValidator.validateCreate, departmentController.createDepartment);

router.patch('/:id/restore', departmentController.restoreDepartment);

router.get('/:departmentId/audit-logs', departmentController.getDepartmentAuditLogsById);

router.get('/:id', DepartmentValidator.validateDelete, departmentController.getDepartment);

router.patch('/:id', DepartmentValidator.validateUpdate, departmentController.updateDepartment);

router.delete('/:id', DepartmentValidator.validateDelete, departmentController.deleteDepartment);

module.exports = router;
