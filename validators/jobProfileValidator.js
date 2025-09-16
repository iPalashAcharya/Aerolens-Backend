const Joi = require('joi');
const AppError = require('../utils/appError');

const jobProfileSchemas = {
    create: Joi.object({
        clientId: Joi.number().integer().positive().required().messages({
            "number.base": "Client ID must be a number",
            "number.integer": "Client ID must be an integer",
            "number.positive": "Client ID must be a positive number",
            "any.required": "Client ID is required",
        }),

        departmentId: Joi.number().integer().positive().required().messages({
            "number.base": "Department ID must be a number",
            "number.integer": "Department ID must be an integer",
            "number.positive": "Department ID must be a positive number",
            "any.required": "Department ID is required",
        }),

        jobProfileDescription: Joi.string()
            .trim()
            .min(10)
            .max(500)
            .required()
            .messages({
                "string.empty": "Job profile description is required",
                "string.min": "Job profile description must be at least 10 characters long",
                "string.max": "Job profile description cannot exceed 500 characters",
            }),

        jobRole: Joi.string().trim().min(2).max(100).required().messages({
            "string.empty": "Job role is required",
            "string.min": "Job role must be at least 2 characters",
            "string.max": "Job role cannot exceed 100 characters",
        }),

        techSpecification: Joi.string()
            .trim()
            .required()
            .custom((value, helpers) => {
                const techs = value.split(",").map((t) => t.trim());
                if (techs.some((t) => t.length < 2)) {
                    return helpers.error("any.invalid");
                }
                return value;
            }, "Comma-separated validation")
            .message("Tech specification must be comma-separated values"),

        positions: Joi.number().integer().positive().required().messages({
            "number.base": "Positions must be a number",
            "number.integer": "Positions must be an integer",
            "number.positive": "Positions must be a positive number",
            "any.required": "Positions is required",
        }),

        estimatedCloseDate: Joi.date().greater("now").optional().messages({
            "date.base": "Estimated close date must be a valid date",
            "date.greater": "Estimated close date must be in the future",
        }),

        locationId: Joi.number().integer().positive().required().messages({
            "number.base": "Location ID must be a number",
            "number.integer": "Location ID must be an integer",
            "number.positive": "Location ID must be a positive number",
            "any.required": "Location ID is required",
        }),

        statusId: Joi.number().integer().positive().optional().messages({
            "number.base": "Status ID must be a number",
            "number.integer": "Status ID must be an integer",
            "number.positive": "Status ID must be a positive number",
        }),
    }),
    update: Joi.object({
        jobProfileDescription: Joi.string().trim().min(10).max(500).optional(),
        jobRole: Joi.string().trim().min(2).max(100).optional(),
        techSpecification: Joi.string()
            .trim()
            .optional()
            .custom((value, helpers) => {
                const techs = value.split(",").map(t => t.trim());
                if (techs.some(t => t.length < 2)) {
                    return helpers.error("any.invalid");
                }
                return value;
            }, "Comma-separated validation")
            .message("tech specification must be comma separated values"),
        estimatedCloseDate: Joi.date().greater("now").optional().messages({
            "date.base": "Estimated close date must be a valid date",
            "date.greater": "Estimated close date must be in the future",
        }),
        positions: Joi.number().positive().optional(),
        locationId: Joi.number().integer().positive().optional(),
        statusId: Joi.number().integer().positive().optional()
    }).min(1).messages({
        'object.min': 'At least one field (departmentName or departmentDescription) must be provided for update'
    }),
    params: Joi.object({
        id: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'job profile ID must be a valid number',
                'number.positive': 'job profile ID must be a positive number'
            })
    })
};

class JobProfileValidator {
    static validateCreate(req, res, next) {
        const { error } = jobProfileSchemas.create.validate(req.body, { abortEarly: false });
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
        const { error: bodyError } = jobProfileSchemas.update.validate(req.body, { abortEarly: false });
        const { error: paramsError } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });

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
        const { error } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });
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

module.exports = JobProfileValidator;