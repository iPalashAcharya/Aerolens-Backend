const Joi = require('joi');
const AppError = require('../utils/appError');

const clientSchemas = {
    create: Joi.object({
        name: Joi.string()
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
        address: Joi.string()
            .trim()
            .min(5)
            .max(500)
            .required()
            .messages({
                'string.base': 'Address must be a string',
                'string.empty': 'Address cannot be empty',
                'string.min': 'Address must be at least 5 characters long',
                'string.max': 'Address cannot exceed 500 characters',
                'any.required': 'Address is required'
            })
    }),

    update: Joi.object({
        name: Joi.string()
            .trim()
            .min(1)
            .max(255)
            .optional()
            .messages({
                'string.base': 'Name must be a string',
                'string.empty': 'Name cannot be empty',
                'string.min': 'Name must be at least 1 character long',
                'string.max': 'Name cannot exceed 255 characters'
            }),
        address: Joi.string()
            .trim()
            .min(5)
            .max(500)
            .optional()
            .messages({
                'string.base': 'Address must be a string',
                'string.empty': 'Address cannot be empty',
                'string.min': 'Address must be at least 5 characters long',
                'string.max': 'Address cannot exceed 500 characters'
            })
    }).min(1).messages({
        'object.min': 'At least one field (name or address) must be provided for update'
    }),

    params: Joi.object({
        id: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Client ID must be a number',
                'number.integer': 'Client ID must be an integer',
                'number.positive': 'Client ID must be positive',
                'any.required': 'Client ID is required'
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

class ClientValidator {
    static validateCreate(req, res, next) {
        const { error } = clientSchemas.create.validate(req.body, { abortEarly: false });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    static validateUpdate(req, res, next) {
        const { error: bodyError } = clientSchemas.update.validate(req.body, { abortEarly: false });
        const { error: paramsError } = clientSchemas.params.validate(req.params, { abortEarly: false });

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
        next();
    }

    static validateDelete(req, res, next) {
        const { error } = clientSchemas.params.validate(req.params, { abortEarly: false });
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
        const { error } = clientSchemas.pagination.validate(req.query, { abortEarly: false });
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

module.exports = ClientValidator;
