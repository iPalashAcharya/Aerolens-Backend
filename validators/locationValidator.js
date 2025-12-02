const Joi = require('joi');
const AppError = require('../utils/appError');

const locationSchemas = {
    create: Joi.object({
        city: Joi.string()
            .trim()
            .min(1)
            .max(100)
            .required()
            .messages({
                'string.base': 'city must be a string',
                'string.empty': 'city cannot be empty',
                'string.min': 'city must be at least 1 character long',
                'string.max': 'city cannot exceed 100 characters',
                'any.required': 'city is required'
            }),

        country: Joi.string()
            .trim()
            .required()
            .messages({
                'string.base': 'country must be a string',
                'string.empty': 'country cannot be empty',
                'any.required': 'country is required'
            }),
        state: Joi.string()
            .trim()
            .min(1)
            .max(100)
            .allow('', null)
            .optional()
            .messages({
                'string.base': 'state must be a string',
                'string.min': 'state must be at least 1 character long',
                'string.max': 'state cannot exceed 100 characters',
            }),
    }),

    update: Joi.object({
        city: Joi.string()
            .trim()
            .min(1)
            .max(100)
            .optional()
            .messages({
                'string.base': 'city must be a string',
                'string.empty': 'city cannot be empty',
                'string.min': 'city must be at least 1 character long',
                'string.max': 'city cannot exceed 100 characters',
                'any.required': 'city is required'
            }),

        country: Joi.string()
            .trim()
            .optional()
            .messages({
                'string.base': 'country must be a string',
                'string.empty': 'country cannot be empty',
                'any.required': 'country is required',
            }),
        state: Joi.string()
            .trim()
            .min(1)
            .max(100)
            .allow('', null)
            .optional()
            .messages({
                'string.base': 'state must be a string',
                'string.min': 'state must be at least 1 character long',
                'string.max': 'state cannot exceed 100 characters',
            }),
    })
        .min(1)
        .messages({
            'object.min': 'At least one field must be provided for update'
        }),

    params: Joi.object({
        locationId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'location Id must be a number',
                'number.integer': 'Location Id must be an integer',
                'number.positive': 'Location Id must be positive',
                'any.required': 'Location Id is required'
            })
    })
};

class LocationValidator {
    static validateCreate(req, res, next) {
        const { value, error } = locationSchemas.create.validate(req.body, { abortEarly: false, stripUnknown: true });
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
        const { value, error } = locationSchemas.update.validate(req.body, { abortEarly: false, stripUnknown: true });
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

    static validateDelete(req, res, next) {
        const { error } = locationSchemas.params.validate(req.params, { abortEarly: false, stripUnknown: true });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    static validateParams(req, res, next) {
        const { error } = locationSchemas.params.validate(req.params);
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

module.exports = LocationValidator;