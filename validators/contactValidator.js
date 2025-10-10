const Joi = require('joi');
const AppError = require('../utils/appError');

const contactSchemas = {
    create: Joi.object({
        clientId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Client ID must be a number',
                'number.positive': 'Client ID must be a positive number',
                'any.required': 'Client ID is required'
            }),

        contactPersonName: Joi.string()
            .trim()
            .min(1)
            .max(255)
            .required()
            .messages({
                'string.base': 'Name must be a string',
                'string.empty': 'Name cannot be empty',
                'string.min': 'Name must be at least 1 character long',
                'string.max': 'Name cannot exceed 255 characters',
                'any.required': 'Name is required'
            }),
        designation: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.base': "Designation must be a string",
                'string.empty': 'Designation cannot be empty',
                'string.min': 'Designation must be atleast 2 characters long',
                'string.max': 'Designation cannot exceed 100 characters',
                'any.required': 'Designation is required'
            }),
        phone: Joi.string()
            .trim()
            .pattern(/^[+]?[\d\s()-]{7,25}$/)
            .optional()
            .messages({
                'string.pattern.base': 'Contact number must be a valid phone number (7-25 characters, numbers, spaces, +, -, () allowed)'
            }),
        email: Joi.string()
            .trim()
            .email()
            .max(255)
            .lowercase()
            .optional()
            .messages({
                'string.email': 'Email must be a valid email address',
                'string.max': 'Email cannot exceed 255 characters'
            }),
    }),

    update: Joi.object({
        contactPersonName: Joi.string()
            .trim()
            .min(1)
            .max(255)
            .optional()
            .messages({
                'string.base': 'Name must be a string',
                'string.empty': 'Name cannot be empty',
                'string.min': 'Name must be at least 1 character long',
                'string.max': 'Name cannot exceed 255 characters',
                'any.required': 'Name is required'
            }),
        designation: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .optional()
            .messages({
                'string.base': "Designation must be a string",
                'string.empty': 'Designation cannot be empty',
                'string.min': 'Designation must be atleast 2 characters long',
                'string.max': 'Designation cannot exceed 100 characters',
                'any.required': 'Designation is required'
            }),
        phone: Joi.string()
            .trim()
            .pattern(/^[+]?[\d\s()-]{7,25}$/)
            .optional()
            .messages({
                'string.pattern.base': 'Contact number must be a valid phone number (7-25 characters, numbers, spaces, +, -, () allowed)'
            }),
        email: Joi.string()
            .trim()
            .email()
            .max(255)
            .lowercase()
            .optional()
            .messages({
                'string.email': 'Email must be a valid email address',
                'string.max': 'Email cannot exceed 255 characters'
            })
    }).min(1).messages({
        'object.min': 'At least one field must be provided for update'
    }),

    params: Joi.object({
        contactId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Contact Person Id must be a number',
                'number.integer': 'Contact Person ID must be an integer',
                'number.positive': 'Contact Person ID must be positive',
                'any.required': 'Contact Person ID is required'
            })
    }),
};

class ContactValidator {
    static validateCreate(req, res, next) {
        const { value, error } = contactSchemas.create.validate(req.body, { abortEarly: false });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        req.body = value;
        next();
    }

    static validateUpdate(req, res, next) {
        const { value, error: bodyError } = contactSchemas.update.validate(req.body, { abortEarly: false });
        const { error: paramsError } = contactSchemas.params.validate(req.params, { abortEarly: false });

        if (bodyError || paramsError) {
            const details = [];
            if (bodyError) {
                details.push(...bodyError.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                })));
            }
            if (paramsError) {
                details.push(...paramsError.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                })));
            }
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        req.body = value;
        next();
    }

    static validateDelete(req, res, next) {
        const { error } = contactSchemas.params.validate(req.params, { abortEarly: false });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }
}

module.exports = ContactValidator;