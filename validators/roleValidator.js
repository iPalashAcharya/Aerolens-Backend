const Joi = require('joi');
const AppError = require('../utils/appError');

const booleanFlag = Joi.boolean().truthy('true').falsy('false');

const roleSchemas = {
    roleIdParam: Joi.object({
        id: Joi.number().integer().positive().required()
    }),
    roleModuleParam: Joi.object({
        roleId: Joi.number().integer().positive().required(),
        moduleId: Joi.number().integer().positive().required()
    }),
    rolePermissionRoleParam: Joi.object({
        roleId: Joi.number().integer().positive().required()
    }),
    createRole: Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        briefPurpose: Joi.string().trim().max(255).allow(null, '').optional()
    }),
    updateRole: Joi.object({
        name: Joi.string().trim().min(2).max(100).optional(),
        briefPurpose: Joi.string().trim().max(255).allow(null, '').optional()
    }).min(1),
    patchPermission: Joi.object({
        canView: booleanFlag.optional(),
        canAdd: booleanFlag.optional(),
        canEdit: booleanFlag.optional(),
        canDelete: booleanFlag.optional(),
        canFinalizeResult: booleanFlag.optional(),
        customActions: Joi.object({
            canFinalizeResult: booleanFlag.optional()
        }).optional()
    }).custom((value, helpers) => {
        const hasDirectFlags = ['canView', 'canAdd', 'canEdit', 'canDelete', 'canFinalizeResult']
            .some((key) => Object.prototype.hasOwnProperty.call(value, key));
        const hasCustomFinalize =
            value.customActions &&
            Object.prototype.hasOwnProperty.call(value.customActions, 'canFinalizeResult');

        if (!hasDirectFlags && !hasCustomFinalize) {
            return helpers.error('any.invalid');
        }

        return value;
    }).messages({
        'any.invalid': 'At least one permission flag must be provided'
    })
};

function formatValidationError(error) {
    return error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
    }));
}

class RoleValidator {
    static validateCreate(req, res, next) {
        const { value, error } = roleSchemas.createRole.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: formatValidationError(error)
            }));
        }

        req.body = value;
        return next();
    }

    static validateUpdate(req, res, next) {
        const { value, error } = roleSchemas.updateRole.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: formatValidationError(error)
            }));
        }

        req.body = value;
        return next();
    }

    static validateRoleIdParam(req, res, next) {
        const { error } = roleSchemas.roleIdParam.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: formatValidationError(error)
            }));
        }

        return next();
    }

    static validateRoleModuleParams(req, res, next) {
        const { error } = roleSchemas.roleModuleParam.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: formatValidationError(error)
            }));
        }

        return next();
    }

    static validateRolePermissionRoleParam(req, res, next) {
        const { error } = roleSchemas.rolePermissionRoleParam.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: formatValidationError(error)
            }));
        }

        return next();
    }

    static validatePatchPermission(req, res, next) {
        const { value, error } = roleSchemas.patchPermission.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: formatValidationError(error)
            }));
        }

        const normalized = {
            canView: value.canView ?? false,
            canAdd: value.canAdd ?? false,
            canEdit: value.canEdit ?? false,
            canDelete: value.canDelete ?? false,
            canFinalizeResult:
                value.canFinalizeResult ??
                value.customActions?.canFinalizeResult ??
                false
        };

        req.body = normalized;
        return next();
    }
}

module.exports = RoleValidator;
