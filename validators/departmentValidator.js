const Joi = require('joi');
const AppError = require('../utils/appError');
const { removeNulls } = require('../utils/normaliseNull');

const departmentSchemas = {
    create: Joi.object({
        departmentName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.empty': 'Department name is required',
                'string.min': 'Department name must be at least 2 characters long',
                'string.max': 'Department name cannot exceed 100 characters'
            }),

        departmentDescription: Joi.string()
            .trim()
            .min(10)
            .max(500)
            .required()
            .messages({
                'string.empty': 'Department description is required',
                'string.min': 'Department description must be at least 10 characters long',
                'string.max': 'Department description cannot exceed 500 characters'
            }),

        clientId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Client ID must be a number',
                'number.positive': 'Client ID must be a positive number',
                'any.required': 'Client ID is required'
            })
    }),

    update: Joi.object({
        departmentName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .optional()
            .messages({
                'string.min': 'Department name must be at least 2 characters long',
                'string.max': 'Department name cannot exceed 100 characters'
            }),

        departmentDescription: Joi.string()
            .trim()
            .min(10)
            .max(500)
            .optional()
            .messages({
                'string.min': 'Department description must be at least 10 characters long',
                'string.max': 'Department description cannot exceed 500 characters'
            })
    }).min(1).messages({
        'object.min': 'At least one field (departmentName or departmentDescription) must be provided for update'
    }),

    params: Joi.object({
        id: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Department ID must be a valid number',
                'number.positive': 'Department ID must be a positive number'
            })
    })
};

class DepartmentValidator {
    static validateCreate(req, res, next) {
        const { value, error } = departmentSchemas.create.validate(req.body, { abortEarly: false }); //abortEearly purpose defined below
        if (error) {
            const details = error.details.map(detail => ({ //converts joi data into a small array of {field and message}
                field: detail.path[0], //only show the first field because we dont have nested structures ie we only have department name, client id and department description
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        req.body = value;
        next();
    }

    static validateUpdate(req, res, next) { //validates both request body and route params, Aggregates errors from both validations into a single details array.
        removeNulls(req.body);
        const { value, error: bodyError } = departmentSchemas.update.validate(req.body, { abortEarly: false }); //abortEarly false gathers all the validation errors instead of stopping at the first one
        const { error: paramsError } = departmentSchemas.params.validate(req.params, { abortEarly: false });

        if (bodyError || paramsError) {
            const details = [];
            if (bodyError) {
                details.push(...bodyError.details.map(detail => ({ //used the spread operator to prevent push from pushing the entire bodyError array as a single element in the details array instead take each element in the bodyError array and push it in the details
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
        const { error } = departmentSchemas.params.validate(req.params, { abortEarly: false });
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

module.exports = DepartmentValidator;