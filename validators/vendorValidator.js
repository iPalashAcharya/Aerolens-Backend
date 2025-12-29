const Joi = require('joi');
const AppError = require('../utils/appError');

const vendorSchemas = {
    create: Joi.object({
        vendorName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.empty': 'Vendor Name is required',
                'string.min': 'Vendor name must be at least 2 characters long',
                'string.max': 'Vendor name cannot exceed 100 characters'
            }),

        vendorPhone: Joi.string()
            .trim()
            .pattern(/^[+]?[\d\s()-]{7,15}$/)
            .optional()
            .allow('', null)
            .messages({
                'string.pattern.base': 'Vendor contact number must be a valid phone number (7-15 characters, numbers, spaces, +, -, () allowed)'
            }),
        vendorEmail: Joi.string()
            .trim()
            .email()
            .max(255)
            .lowercase()
            .optional()
            .allow('', null)
            .messages({
                'string.email': 'Vendor email must be a valid email address',
                'string.max': 'Vendor email cannot exceed 255 characters'
            })
    }),

    update: Joi.object({
        vendorName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .optional()
            .messages({
                'string.empty': 'Vendor Name is required',
                'string.min': 'Vendor name must be at least 2 characters long',
                'string.max': 'Vendor name cannot exceed 100 characters'
            }),

        vendorPhone: Joi.string()
            .trim()
            .pattern(/^[+]?[\d\s()-]{7,15}$/)
            .optional()
            .allow('', null)
            .messages({
                'string.pattern.base': 'Vendor contact number must be a valid phone number (7-15 characters, numbers, spaces, +, -, () allowed)'
            }),
        vendorEmail: Joi.string()
            .trim()
            .email()
            .max(255)
            .lowercase()
            .optional()
            .allow('', null)
            .messages({
                'string.email': 'Vendor email must be a valid email address',
                'string.max': 'Vendor email cannot exceed 255 characters'
            })
    }).min(1).messages({
        'object.min': 'At least one field (vendorName,vendorPhone or vendorEmail) must be provided for update'
    }),

    params: Joi.object({
        vendorId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Vendor ID must be a valid number',
                'number.positive': 'Vendor ID must be a positive number'
            })
    })
};

class VendorValidator {
    static validateCreate(req, res, next) {
        const { value, error } = vendorSchemas.create.validate(req.body, { abortEarly: false }); //abortEearly purpose defined below
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
        const { value, error: bodyError } = vendorSchemas.update.validate(req.body, { abortEarly: false }); //abortEarly false gathers all the validation errors instead of stopping at the first one
        const { error: paramsError } = vendorSchemas.params.validate(req.params, { abortEarly: false });

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
        const { error } = vendorSchemas.params.validate(req.params, { abortEarly: false });
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

module.exports = VendorValidator;