const AppError = require('../utils/appError');
const db = require('../db');
const RoleRepository = require('../repositories/roleRepository');
const { inferLegacyRole, normalizeRoleName } = require('../utils/rbacRoleUtils');

const roleRepository = new RoleRepository(db);

const ACTION_MAP = {
    view: 'canView',
    add: 'canAdd',
    edit: 'canEdit',
    delete: 'canDelete',
    canview: 'canView',
    canadd: 'canAdd',
    canedit: 'canEdit',
    candelete: 'canDelete',
    canfinalizeresult: 'canFinalizeResult'
};

async function resolveRoleContext(user) {
    if (!user) {
        return { roleId: null, roleName: null };
    }

    if (user.roleId && user.roleName) {
        return {
            roleId: user.roleId,
            roleName: user.roleName
        };
    }

    if (user.roleId) {
        const role = await roleRepository.findRoleById(user.roleId);
        if (role) {
            return {
                roleId: role.id,
                roleName: role.name
            };
        }
    }

    if (user.roleName) {
        const role = await roleRepository.findRoleByName(user.roleName);
        if (role) {
            return {
                roleId: role.id,
                roleName: role.name
            };
        }
        return {
            roleId: null,
            roleName: user.roleName
        };
    }

    return {
        roleId: null,
        roleName: inferLegacyRole(user)
    };
}

function requireRole(...roles) {
    const allowed = roles.map((role) => normalizeRoleName(role));

    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
            }

            const { roleName } = await resolveRoleContext(req.user);
            const normalizedRole = normalizeRoleName(roleName);

            if (!allowed.includes(normalizedRole)) {
                throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
            }

            req.user.roleName = roleName;
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

function requirePermission(moduleName, action) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    error: 'UNAUTHORIZED',
                    message: 'Authentication required'
                });
            }

            const normalizedAction = ACTION_MAP[normalizeRoleName(action)];
            if (!normalizedAction) {
                throw new AppError(
                    `Unsupported permission action: ${action}`,
                    500,
                    'UNSUPPORTED_PERMISSION_ACTION'
                );
            }

            const { roleId, roleName } = await resolveRoleContext(req.user);
            req.user.roleId = roleId;
            req.user.roleName = roleName;

            if (!roleId) {
                return res.status(403).json({
                    error: 'FORBIDDEN',
                    message: `You do not have ${normalizedAction} on ${moduleName}`
                });
            }

            // JWT permission claims are UI hints only; enforcement must use live DB state.
            const livePermission = await roleRepository.getPermissionByRoleAndModule(roleId, moduleName);
            const hasPermission = Boolean(livePermission && livePermission[normalizedAction]);

            if (!hasPermission) {
                return res.status(403).json({
                    error: 'FORBIDDEN',
                    message: `You do not have ${normalizedAction} on ${moduleName}`
                });
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = {
    requireRole,
    requirePermission
};
