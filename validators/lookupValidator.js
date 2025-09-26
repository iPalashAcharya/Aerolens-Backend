const Joi = require('joi');
const AppError = require('../utils/appError');

const lookupSchemas = {
    create: Joi.object({
        tag: Joi.string()
            .trim()
            .min(1)
            .max(100)
            .required()
            .messages({
                'string.base': 'Tag must be a string',
                'string.empty': 'Tag cannot be empty',
                'string.min': 'Tag must be at least 1 character long',
                'string.max': 'Tag cannot exceed 100 characters',
                'any.required': 'Tag is required'
            }),
        value: Joi.string()
            .trim()
            .min(1)
            .max(500)
            .required()
            .messages({
                'string.base': 'Value must be a string',
                'string.empty': 'Value cannot be empty',
                'string.min': 'Value must be at least 1 character long',
                'string.max': 'Value cannot exceed 500 characters',
                'any.required': 'Value is required'
            })
    }),

    params: Joi.object({
        lookupKey: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Lookup key must be a number',
                'number.integer': 'Lookup key must be an integer',
                'number.positive': 'Lookup key must be positive',
                'any.required': 'Lookup key is required'
            })
    }),

    pagination: Joi.object({
        page: Joi.number()
            .integer()
            .min(1)
            .default(1)
            .messages({
                'number.base': 'Page must be a number',
                'number.integer': 'Page must be an integer',
                'number.min': 'Page must be at least 1'
            }),
        limit: Joi.number()
            .integer()
            .min(1)
            .max(100)
            .default(10)
            .messages({
                'number.base': 'Limit must be a number',
                'number.integer': 'Limit must be an integer',
                'number.min': 'Limit must be at least 1',
                'number.max': 'Limit cannot exceed 100'
            })
    })
};

class LookupValidator {
    static validateCreate(req, res, next) {
        const { error } = lookupSchemas.create.validate(req.body, { abortEarly: false });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    static validateDelete(req, res, next) {
        const { error } = lookupSchemas.params.validate(req.params, { abortEarly: false });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    static validatePagination(req, res, next) {
        const { error } = lookupSchemas.pagination.validate(req.query, { abortEarly: false });
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

module.exports = LookupValidator;