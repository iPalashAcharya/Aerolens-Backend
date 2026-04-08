const express = require('express');
const RoleRepository = require('../repositories/roleRepository');
const RoleService = require('../services/roleService');
const RoleController = require('../controllers/roleController');
const RoleValidator = require('../validators/roleValidator');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const auditContextMiddleware = require('../middleware/auditContext');
const db = require('../db');

const router = express.Router();

const roleRepository = new RoleRepository(db);
const roleService = new RoleService(roleRepository, db);
const roleController = new RoleController(roleService);

router.use(authenticate);
router.use(auditContextMiddleware);
router.use(requireRole('HR', 'Admin'));

router.get('/getrole', roleController.getRoles);

router.get(
    '/getrole/:id',
    RoleValidator.validateRoleIdParam,
    roleController.getRoleById
);

router.post(
    '/postrole',
    RoleValidator.validateCreate,
    roleController.createRole
);

router.put(
    '/updaterole/:id',
    RoleValidator.validateRoleIdParam,
    RoleValidator.validateUpdate,
    roleController.updateRole
);

router.delete(
    '/role/:id',
    RoleValidator.validateRoleIdParam,
    roleController.deleteRole
);

router.patch(
    '/roles/:roleId/modules/:moduleId/permissions',
    RoleValidator.validateRoleModuleParams,
    RoleValidator.validatePatchPermission,
    roleController.patchModulePermission
);

router.get(
    '/roles/:roleId/modules/permissions',
    RoleValidator.validateRolePermissionRoleParam,
    roleController.getRoleModulePermissions
);

module.exports = router;
