const Joi = require('joi');
const AppError = require('../utils/appError');

class AuthValidatorHelper {
    constructor(db) {
        this.db = db;
    }

    async transformDesignation(designationString, client = null) {
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
    designation: Joi.string()
        .lowercase()
        .trim()
        .required()
        .min(2)
        .max(100)
        .messages({
            'any.required': 'Designation is required'
        }),
    isRecruiter: Joi.boolean()
        .default(false),
    isInterviewer: Joi.boolean()
        .default(false)
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
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', details));
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
            return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', details));
        }

        if (value.designation) {
            value.designation = await AuthValidator.helper.transformDesignation(value.designation);
        }
        req.body = value;
        next();
    }
}

module.exports = AuthValidator;