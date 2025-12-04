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
        result: Joi.string()
            .valid('pending', 'selected', 'rejected', 'cancelled')
            .optional()
            .default('pending')
            .messages({
                'any.only': 'Result must be one of: pending, selected, rejected, cancelled'
            }),
        recruiterNotes: Joi.string()
            .trim()
            .max(1000)
            .optional()
            .allow('', null)
            .messages({
                'string.max': 'Recruiter notes cannot exceed 1000 characters'
            }),
        interviewerFeedback: Joi.string()
            .trim()
            .max(2000)
            .optional()
            .allow('', null)
            .messages({
                'string.max': 'Interviewer feedback cannot exceed 2000 characters'
            })
    }),

    scheduleRound: Joi.object({
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
            })
    }),

    update: Joi.object({
        interviewerId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Interviewer Id Must be a Number',
                'number.integer': 'Interviewer ID must be an Integer',
                'number.positive': 'Interviewer ID must be Positive'
            }),
        scheduledById: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Scheduled by ID must be a number',
                'number.integer': 'Scheduled by ID must be an integer',
                'number.positive': 'Scheduled by ID must be positive'
            }),
        interviewDate: Joi.date()
            .iso()
            .optional()
            .custom((value, helpers) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (value < today) {
                    return helpers.error('date.min');
                }
                return value;
            })
            .messages({
                'date.min': 'Interview date cannot be in the past',
                'date.base': 'Interview date must be a valid date'
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
            })
    })
        .min(1)
        .messages({
            'object.min': 'At least one field must be provided for update'
        }),

    finalize: Joi.object({
        result: Joi.string()
            .valid('Pending', 'Selected', 'Rejected', 'Cancelled')
            .required()
            .messages({
                'any.only': 'Result must be one of: pending, selected, rejected, cancelled',
                'any.required': 'Result is required'
            }),
        recruiterNotes: Joi.string()
            .trim()
            .max(1000)
            .optional()
            .allow('', null)
            .messages({
                'string.max': 'Recruiter notes cannot exceed 1000 characters'
            }),
        interviewerFeedback: Joi.string()
            .trim()
            .max(2000)
            .optional()
            .allow('', null)
            .messages({
                'string.max': 'Interviewer feedback cannot exceed 2000 characters'
            })
    }),

    params: Joi.object({
        interviewId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Interview ID must be a number',
                'number.integer': 'Interview ID must be an integer',
                'number.positive': 'Interview ID must be positive',
                'any.required': 'Interview ID is required'
            }),
        candidateId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Candidate Id must be a number',
                'number.integer': 'Candidate ID must be an integer',
                'number.positive': 'Candidate ID must be positive',
                'any.required': 'Candidate ID is required'
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
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        req.body = value;
        next();
    }

    static validateScheduleRound(req, res, next) {
        const { value, error } = interviewSchemas.scheduleRound.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
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
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        req.body = value;
        next();
    }

    static validateFinalize(req, res, next) {
        const { value, error } = interviewSchemas.finalize.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        req.body = value;
        next();
    }

    static validateParams(req, res, next) {
        const { error } = interviewSchemas.params.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
                validationErrors: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        next();
    }
}

module.exports = InterviewValidator;