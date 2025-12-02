const Joi = require('joi');
const AppError = require('../utils/appError');

const interviewSchemas = {
    create: Joi.object({
        interviewDate: Joi.date()
            .iso()
            .required()
            .custom((value, helpers) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (value < today) {
                    return helpers.error('date.min', { limit: today.toISOString().split('T')[0] });
                }
                return value;
            })
            .messages({
                'date.min': 'Interview date cannot be in the past',
                'date.base': 'Interview date must be a valid date',
                'any.required': 'Interview date is required'
            }),
        fromTime: Joi.string()
            .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .required()
            .messages({
                'string.pattern.base': 'From time must be in HH:MM format (00:00-23:59)',
                'any.required': 'From time is required'
            }),
        durationMinutes: Joi.number()
            .integer()
            .min(15)
            .max(480)
            .required()
            .messages({
                'number.base': 'Duration must be a number',
                'number.integer': 'Duration must be an integer',
                'number.min': 'Duration must be at least 15 minutes',
                'number.max': 'Duration cannot exceed 8 hours (480 minutes)',
                'any.required': 'Duration is required'
            }),
        candidateId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Candidate ID must be a number',
                'number.integer': 'Candidate ID must be an integer',
                'number.positive': 'Candidate ID must be positive',
                'any.required': 'Candidate ID is required'
            }),
        interviewerId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Interviewer ID must be a number',
                'number.integer': 'Interviewer ID must be an integer',
                'number.positive': 'Interviewer ID must be positive',
                'any.required': 'Interviewer ID is required'
            }),
        scheduledById: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Scheduled by ID must be a number',
                'number.integer': 'Scheduled by ID must be an integer',
                'number.positive': 'Scheduled by ID must be positive',
                'any.required': 'Scheduled by ID is required'
            }),
        recruiterNotes: Joi.string()
            .trim()
            .max(1000)
            .optional()
            .allow('')
            .messages({
                'string.max': 'Recruiter notes cannot exceed 1000 characters'
            }),
        interviewerFeedback: Joi.string()
            .trim()
            .max(2000)
            .optional()
            .allow('')
            .messages({
                'string.max': 'Interviewer feedback cannot exceed 2000 characters'
            })
    }),

    update: Joi.object({
        interviewDate: Joi.date()
            .iso()
            .optional()
            .custom((value, helpers) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (value < today) {
                    return helpers.error('date.min', { limit: today.toISOString().split('T')[0] });
                }
                return value;
            })
            .messages({
                'date.min': 'Interview date cannot be in the past',
                'date.base': 'Interview date must be a valid date',
                'any.required': 'Interview date is required'
            }),
        fromTime: Joi.string()
            .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .optional()
            .messages({
                'string.pattern.base': 'From time must be in HH:MM format (00:00-23:59)'
            }),
        durationMinutes: Joi.number()
            .integer()
            .min(15)
            .max(480)
            .optional()
            .messages({
                'number.base': 'Duration must be a number',
                'number.integer': 'Duration must be an integer',
                'number.min': 'Duration must be at least 15 minutes',
                'number.max': 'Duration cannot exceed 8 hours (480 minutes)'
            }),
        result: Joi.string()
            .valid('pending', 'selected', 'rejected', 'cancelled')
            .optional()
            .messages({
                'any.only': 'Result must be one of: pending, selected, rejected, cancelled'
            }),
        recruiterNotes: Joi.string()
            .trim()
            .max(1000)
            .optional()
            .allow('')
            .messages({
                'string.max': 'Recruiter notes cannot exceed 1000 characters'
            }),
        interviewerFeedback: Joi.string()
            .trim()
            .max(2000)
            .optional()
            .allow('')
            .messages({
                'string.max': 'Interviewer feedback cannot exceed 2000 characters'
            })
    })
        .min(1)
        .messages({
            'object.min': 'At least one field must be provided for update'
        }),

    params: Joi.object({
        interviewId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Interview ID must be a number',
                'number.integer': 'Interview ID must be an integer',
                'number.positive': 'Interview ID must be positive',
                'any.required': 'Interview ID is required'
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
            }),
        result: Joi.string()
            .valid('pending', 'selected', 'rejected', 'cancelled')
            .optional()
            .messages({
                'any.only': 'Result filter must be one of: pending, selected, rejected, cancelled'
            })
    })
};

class InterviewValidator {
    static validateCreate(req, res, next) {
        const { value, error } = interviewSchemas.create.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: details
            });
        }
        req.body = value;
        next();
    }

    static validateUpdate(req, res, next) {
        const { value, error } = interviewSchemas.update.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: details
            });
        }
        req.body = value;
        next();
    }

    static validateDelete(req, res, next) {
        const { error } = interviewSchemas.params.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: details
            });
        }
        next();
    }

    static validatePagination(req, res, next) {
        const { error } = interviewSchemas.pagination.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: details
            });
        }
        next();
    }
}

module.exports = InterviewValidator;