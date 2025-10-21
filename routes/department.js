const express = require('express');
const DepartmentController = require('../controllers/departmentController');
const DepartmentService = require('../services/departmentService');
const DepartmentRepository = require('../repositories/departmentRepository');
const DepartmentValidator = require('../validators/departmentValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');

const router = express.Router();

// Dependency injection
const departmentRepository = new DepartmentRepository(db);
const departmentService = new DepartmentService(departmentRepository, db);
const departmentController = new DepartmentController(departmentService);
router.use(authenticate);

// Routes
router.get('/client/:clientId',
    departmentController.getDepartmentsByClient
);

router.post('/',
    DepartmentValidator.validateCreate,
    departmentController.createDepartment
);

router.get('/:id',
    DepartmentValidator.validateDelete, // Reusing for ID validation
    departmentController.getDepartment
);

router.patch('/:id',
    DepartmentValidator.validateUpdate,
    departmentController.updateDepartment
);

router.delete('/:id',
    DepartmentValidator.validateDelete,
    departmentController.deleteDepartment
);

module.exports = router;