const Joi = require('joi');
const AppError = require('../utils/appError');

const interviewSchemas = {
    create: Joi.object({
        interviewDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            /*.custom((value, helpers) => {
                const inputDate = new Date(value + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (inputDate < today) {
                    return helpers.error('date.min');
                }
                return value;
            })*/
            .messages({
                'string.pattern.base': 'Interview date must be in YYYY-MM-DD format',
                //'date.min': 'Interview date cannot be in the past',
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
        eventTimezone: Joi.string()
            .trim()
            .pattern(/^[A-Za-z_]+\/[A-Za-z_]+$/)
            .required()
            .messages({
                'string.pattern.base': 'Timezone must be a valid IANA timezone (e.g. Asia/Kolkata)',
                'any.required': 'Timezone is required'
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
        interviewDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            /*.custom((value, helpers) => {
                const inputDate = new Date(value + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (inputDate < today) {
                    return helpers.error('date.min');
                }
                return value;
            })*/
            .messages({
                'string.pattern.base': 'Interview date must be in YYYY-MM-DD format',
                //'date.min': 'Interview date cannot be in the past',
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
        eventTimezone: Joi.string()
            .trim()
            .pattern(/^[A-Za-z_]+\/[A-Za-z_]+$/)
            .required()
            .messages({
                'string.pattern.base': 'Timezone must be a valid IANA timezone (e.g. Asia/Kolkata)',
                'any.required': 'Timezone is required'
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
        interviewDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            /*.custom((value, helpers) => {
                const inputDate = new Date(value + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (inputDate < today) {
                    return helpers.error('date.min');
                }
                return value;
            })*/
            .messages({
                'string.pattern.base': 'Interview date must be in YYYY-MM-DD format',
                //'date.min': 'Interview date cannot be in the past'
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
        eventTimezone: Joi.string()
            .trim()
            .pattern(/^[A-Za-z_]+\/[A-Za-z_]+$/)
            .optional()
            .messages({
                'string.pattern.base': 'Timezone must be a valid IANA timezone (e.g. Asia/Kolkata)',
            }),
    })
        .min(1)
        .messages({
            'object.min': 'At least one field must be provided for update'
        })
        .with('interviewDate', ['fromTime', 'eventTimezone'])
        .with('fromTime', ['interviewDate', 'eventTimezone'])
        .with('eventTimezone', ['interviewDate', 'fromTime']),

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
            }),
        meetingUrl: Joi.string()
            .uri({
                scheme: ['https'],
                allowRelative: false
            })
            .max(2048)
            .optional()
            .allow('', null)
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
    }),
    query: Joi.object({
        startDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                'string.pattern.base': 'startDate must be in YYYY-MM-DD format',
                'any.required': 'startDate is required'
            }),
        endDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .custom((value, helpers) => {
                const { startDate } = helpers.state.ancestors[0];
                if (startDate && value <= startDate) {
                    return helpers.error('date.greater');
                }
                return value;
            })
            .messages({
                'string.pattern.base': 'endDate must be in YYYY-MM-DD format',
                'date.greater': 'endDate must be greater than startDate',
                'any.required': 'endDate is required'
            })
    }),
    dailyQuery: Joi.object({
        date: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                "string.pattern.base": "date must be in YYYY-MM-DD format",
                "any.required": "date is required"
            })
    }),
    trackerQuery: Joi.object({
        filter: Joi.string()
            .valid('today', 'past7days', 'custom')
            .required()
            .messages({
                'any.only': 'Filter must be one of: today, past7days, custom',
                'any.required': 'Filter is required'
            }),

        // Only required when filter = 'custom'
        startDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .when('filter', {
                is: 'custom',
                then: Joi.required(),
                otherwise: Joi.forbidden()
            })
            .messages({
                'string.pattern.base': 'startDate must be in YYYY-MM-DD format',
                'any.required': 'startDate is required when filter is custom',
                'any.unknown': 'startDate is only allowed when filter is custom'
            }),

        endDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .when('filter', {
                is: 'custom',
                then: Joi.required(),
                otherwise: Joi.forbidden()
            })
            .custom((value, helpers) => {
                const { startDate } = helpers.state.ancestors[0];
                if (startDate && value < startDate) {
                    return helpers.error('date.greater');
                }
                return value;
            })
            .messages({
                'string.pattern.base': 'endDate must be in YYYY-MM-DD format',
                'date.greater': 'endDate must be greater than or equal to startDate',
                'any.required': 'endDate is required when filter is custom',
                'any.unknown': 'endDate is only allowed when filter is custom'
            }),

        // Optional: additional filters
        interviewerId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Interviewer ID must be a number',
                'number.integer': 'Interviewer ID must be an integer',
                'number.positive': 'Interviewer ID must be positive'
            }),

        result: Joi.string()
            .valid('pending', 'selected', 'rejected', 'cancelled')
            .optional()
            .messages({
                'any.only': 'Result must be one of: pending, selected, rejected, cancelled'
            }),

        candidateId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Candidate ID must be a number',
                'number.integer': 'Candidate ID must be an integer',
                'number.positive': 'Candidate ID must be positive'
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

    static validateQuery(req, res, next) {
        const { value, error } = interviewSchemas.query.validate(req.query, {
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

        req.validatedQuery = value;
        next();
    }

    static validateDailyQuery(req, res, next) {
        const { value, error } = interviewSchemas.dailyQuery.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            throw new AppError("Validation failed", 400, "VALIDATION_ERROR", {
                validationErrors: error.details.map(d => ({
                    field: d.path[0],
                    message: d.message
                }))
            });
        }

        req.validatedQuery = value;
        next();
    }
    static validateTrackerQuery(req, res, next) {
        const { value, error } = interviewSchemas.trackerQuery.validate(req.query, {
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

        req.validatedQuery = value;
        next();
    }
}

module.exports = InterviewValidator;