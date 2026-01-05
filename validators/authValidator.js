const Joi = require('joi');
const AppError = require('../utils/appError');

class AuthValidatorHelper {
    constructor(db) {
        this.db = db;
    }

    /*async transformDesignation(designationString, client = null) {
        if (!designationString) return null;
        const connection = client || await this.db.getConnection();
        try {
            const query = `SELECT lookupKey FROM lookup WHERE LOWER(value) = LOWER(?) AND tag='designation'`;
            const [rows] = await connection.execute(query, [designationString]);

            if (!rows || rows.length === 0) {
                throw new AppError(
                    `Invalid designation specified. Provided designation is not currently present in the database`,
                    400,
                    `INVALID_DESIGNATION`
                );
            }
            return rows[0].lookupKey;
        } finally {
            if (!client) connection.release();
        }
    }*/
    async validateVendorExists(vendorId, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT vendorId FROM recruitmentVendor WHERE vendorId = ?`,
                [vendorId]
            );

            if (rows.length === 0) {
                throw new AppError(
                    `Vendor with ID ${vendorId} does not exist`,
                    400,
                    'INVALID_VENDOR_ID'
                );
            }
            return true;
        } finally {
            if (!client) connection.release();
        }
    }
    async validateDesignationExists(designationId, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT lookupKey FROM lookup WHERE lookupKey = ? AND tag='designation'`,
                [designationId]
            );

            if (rows.length === 0) {
                throw new AppError(
                    `Designation with ID ${designationId} does not exist`,
                    400,
                    'INVALID_DESIGNATION_ID'
                );
            }
            return designationId;
        } finally {
            if (!client) connection.release();
        }
    }
}

const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .lowercase()
        .trim()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .required()
        .min(8)
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'any.required': 'Password is required'
        })
});

const registerSchema = Joi.object({
    memberName: Joi.string()
        .required()
        .min(2)
        .max(100)
        .trim()
        .messages({
            'any.required': 'Member name is required',
            'string.min': 'Name must be at least 2 characters',
            'string.max': 'Name cannot exceed 100 characters'
        }),
    memberContact: Joi.string()
        .required()
        .pattern(/^[0-9+\-\s()]+$/)
        .max(25)
        .messages({
            'any.required': 'Contact number is required',
            'string.pattern.base': 'Invalid contact number format'
        }),
    email: Joi.string()
        .email()
        .required()
        .lowercase()
        .trim()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .required()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .messages({
            'any.required': 'Password is required',
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character'
        }),
    /*designation: Joi.string()
        .lowercase()
        .trim()
        .required()
        .min(2)
        .max(100)
        .messages({
            'any.required': 'Designation is required'
        }),*/
    designationId: Joi.number()
        .integer()
        .positive()
        .required()
        .messages({
            'number.base': 'Designation ID must be a number',
            'number.positive': 'Designation ID must be a positive number'
        }),
    isRecruiter: Joi.boolean()
        .default(false),
    isInterviewer: Joi.boolean()
        .default(false),
    vendorId: Joi.when('isRecruiter', {
        is: true,
        then: Joi.number()
            .integer()
            .positive()
            .optional()
            .allow(null)
            .messages({
                'number.base': 'Vendor ID must be a number',
                'number.positive': 'Vendor ID must be a positive number'
            }),
        otherwise: Joi.forbidden().messages({
            'any.unknown': 'Vendor ID is only allowed when isRecruiter is true'
        })
    })
});

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string()
        .required()
        .messages({
            'any.required': 'Current password is required',
            'string.empty': 'Current password cannot be empty'
        }),
    newPassword: Joi.string()
        .required()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .invalid(Joi.ref('currentPassword'))
        .messages({
            'any.required': 'New password is required',
            'string.min': 'New password must be at least 8 characters',
            'string.max': 'New password cannot exceed 128 characters',
            'string.empty': 'New password cannot be empty',
            'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number and one special character (@$!%*?&)',
            'any.invalid': 'New password must be different from current password'
        }),
    /*confirmPassword: Joi.string()
        .required()
        .valid(Joi.ref('newPassword'))
        .messages({
            'any.required': 'Password confirmation is required',
            'any.only': 'Passwords do not match',
            'string.empty': 'Password confirmation cannot be empty'
        })*/
});

class AuthValidator {
    static helper = null;

    static init(db) {
        AuthValidator.helper = new AuthValidatorHelper(db);
    }

    static async validateLogin(req, res, next) {
        const { error } = loginSchema.validate(req.body, { abortEarly: false });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details }));
        }
        next();
    }

    static async validateRegister(req, res, next) {
        const { error, value } = registerSchema.validate(req.body, { abortEarly: false });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details }));
        }

        if (value.designationId) {
            value.designation = await AuthValidator.helper.validateDesignationExists(value.designationId);
            delete value.designationId;
        }
        if (value.isRecruiter === true && value.vendorId) {
            await AuthValidator.helper.validateVendorExists(value.vendorId);
        }
        req.body = value;
        next();
    }
    static async validateResetPassword(req, res, next) {
        try {
            const { error, value } = changePasswordSchema.validate(req.body, {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                const details = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details }));
            }

            req.body = value;
            next();
        } catch (err) {
            next(new AppError('Validation error occurred', 500, 'VALIDATION_SYSTEM_ERROR', err.message));
        }
    }
}

module.exports = AuthValidator;