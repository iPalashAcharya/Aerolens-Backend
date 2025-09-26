const Joi = require('joi');
const AppError = require('../utils/appError');
const path = require('path');
const fs = require('fs');

// Database helper class for lookups
class CandidateValidatorHelper {
    constructor(db) {
        this.db = db;
        this.locationMap = new Map([
            ['ahmedabad', 'Ahmedabad'],
            ['bangalore', 'Bangalore'],
            ['bengaluru', 'Bangalore']
        ]);
        this.statusCache = new Map();
    }

    async getStatusIdByName(statusName, client = null) {
        if (!statusName) return null;

        const cacheKey = statusName.toLowerCase().trim();
        if (this.statusCache.has(cacheKey)) {
            return this.statusCache.get(cacheKey);
        }

        const connection = client || await this.db.getConnection();

        try {
            const query = `SELECT lookupKey FROM lookup WHERE LOWER(value) = LOWER(?) AND tag='candidateStatus'`;
            const [rows] = await connection.execute(query, [statusName.trim()]);

            if (rows.length === 0) {
                throw new AppError(
                    `Invalid status: '${statusName}'. Status does not exist.`,
                    400,
                    'INVALID_STATUS'
                );
            }

            const statusId = rows[0].lookupKey;
            this.statusCache.set(cacheKey, statusId);

            return statusId;
        } finally {
            if (!client) connection.release();
        }
    }

    async transformLocation(locationString, client = null) {
        if (!locationString) return null;
        const connection = client || await this.db.getConnection();

        try {
            const normalizationMap = {
                "bengaluru": "bangalore",
                "bangalore": "bangalore",
                "ahmedabad": "ahmedabad",
                "san francisco": "san francisco"
            };

            const normalizedLocation = normalizationMap[locationString.toLowerCase().trim()] || locationString.toLowerCase().trim();
            const query = `SELECT lookupKey FROM lookup WHERE LOWER(value) = LOWER(?) AND tag = 'location'`;
            const [rows] = await connection.execute(query, [normalizedLocation]);

            if (!rows) {
                throw new AppError(
                    `Invalid location: '${locationString}'. Must be either Ahmedabad, Bangalore or San Francisco.`,
                    400,
                    'INVALID_LOCATION'
                );
            }
            return rows[0].lookupKey;
        } finally {
            if (!client) connection.release();
        }
    }

    async checkEmailExists(email, excludeCandidateId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT candidateId FROM candidate WHERE email = ?`;
            const params = [email];

            if (excludeCandidateId) {
                query += ` AND candidateId != ?`;
                params.push(excludeCandidateId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0;
        } finally {
            if (!client) connection.release();
        }
    }

    async checkContactExists(contactNumber, excludeCandidateId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT candidateId FROM candidate WHERE contactNumber = ?`;
            const params = [contactNumber];

            if (excludeCandidateId) {
                query += ` AND candidateId != ?`;
                params.push(excludeCandidateId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0;
        } finally {
            if (!client) connection.release();
        }
    }
}

// Schema definitions
const candidateSchemas = {
    create: Joi.object({
        candidateName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .required()
            .messages({
                'string.empty': 'Candidate name is required',
                'string.min': 'Candidate name must be at least 2 characters long',
                'string.max': 'Candidate name cannot exceed 100 characters',
                'string.pattern.base': 'Candidate name can only contain letters, spaces, periods, hyphens and apostrophes'
            }),

        contactNumber: Joi.string()
            .trim()
            .pattern(/^[+]?[\d\s()-]{7,25}$/)
            .required()
            .messages({
                'string.empty': 'Contact number is required',
                'string.pattern.base': 'Contact number must be a valid phone number (7-25 characters, numbers, spaces, +, -, () allowed)'
            }),

        email: Joi.string()
            .trim()
            .email()
            .max(255)
            .lowercase()
            .required()
            .messages({
                'string.empty': 'Email is required',
                'string.email': 'Email must be a valid email address',
                'string.max': 'Email cannot exceed 255 characters'
            }),

        recruiterName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .required()
            .custom((value, helpers) => {
                const validRecruiters = ['jayraj', 'khushi', 'yash'];
                if (!validRecruiters.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
            .messages({
                'string.empty': 'Recruiter name is required',
                'string.min': 'Recruiter name must be at least 2 characters long',
                'string.max': 'Recruiter name cannot exceed 100 characters',
                'string.pattern.base': 'Recruiter name can only contain letters, spaces, periods, hyphens and apostrophes'
            }),

        jobRole: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.empty': 'Job role is required',
                'string.min': 'Job role must be at least 2 characters long',
                'string.max': 'Job role cannot exceed 100 characters'
            }),

        preferredJobLocation: Joi.string()
            .trim()
            .lowercase()
            .custom((value, helpers) => {
                const validLocation = ['ahmedabad', 'bengaluru', 'bangalore', 'san francisco'];
                if (!validLocation.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
            .required()
            .messages({
                'string.empty': 'Preferred job location is required',
                'any.only': 'Preferred job location must be either Ahmedabad or Bangalore'
            }),

        currentCTC: Joi.number()
            .integer()
            .min(0)
            .max(10000000)
            .required()
            .messages({
                'number.base': 'Current CTC must be a number',
                'number.integer': 'Current CTC must be a whole number',
                'number.min': 'Current CTC cannot be negative',
                'number.max': 'Current CTC cannot exceed 1,00,00,000',
                'any.required': 'Current CTC is required'
            }),

        expectedCTC: Joi.number()
            .integer()
            .min(0)
            .max(10000000)
            .required()
            .messages({
                'number.base': 'Expected CTC must be a number',
                'number.integer': 'Expected CTC must be a whole number',
                'number.min': 'Expected CTC cannot be negative',
                'number.max': 'Expected CTC cannot exceed 1,00,00,000',
                'any.required': 'Expected CTC is required'
            }),

        noticePeriod: Joi.number()
            .integer()
            .min(0)
            .max(365)
            .required()
            .messages({
                'number.base': 'Notice period must be a number',
                'number.integer': 'Notice period must be a whole number (days)',
                'number.min': 'Notice period cannot be negative',
                'number.max': 'Notice period cannot exceed 365 days',
                'any.required': 'Notice period is required'
            }),

        experienceYears: Joi.number()
            .integer()
            .min(0)
            .max(50)
            .required()
            .messages({
                'number.base': 'Experience years must be a number',
                'number.integer': 'Experience years must be a whole number',
                'number.min': 'Experience years cannot be negative',
                'number.max': 'Experience years cannot exceed 50',
                'any.required': 'Experience years is required'
            }),

        linkedinProfileUrl: Joi.string()
            .trim()
            .uri({ scheme: ['http', 'https'] })
            .pattern(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/)
            .max(500)
            .optional()
            .allow('')
            .messages({
                'string.uri': 'LinkedIn profile URL must be a valid URL',
                'string.pattern.base': 'LinkedIn URL must be in format: https://linkedin.com/in/username',
                'string.max': 'LinkedIn profile URL cannot exceed 500 characters'
            }),

        status: Joi.string()
            .trim()
            .min(1)
            .max(50)
            .optional()
            .custom((value, helpers) => {
                const validStatuses = ['selected', 'rejected', 'interview pending'];
                if (!validStatuses.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
            .messages({
                'string.min': 'Status must be at least 1 character long',
                'string.max': 'Status cannot exceed 50 characters'
            })
    }).custom((value, helpers) => {
        if (value.expectedCTC < value.currentCTC) {
            return helpers.error('custom.ctcRange');
        }
        return value;
    }).messages({
        'custom.ctcRange': 'Expected CTC should not be less than current CTC'
    }),

    update: Joi.object({
        candidateName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .optional()
            .messages({
                'string.min': 'Candidate name must be at least 2 characters long',
                'string.max': 'Candidate name cannot exceed 100 characters',
                'string.pattern.base': 'Candidate name can only contain letters, spaces, periods, hyphens and apostrophes'
            }),

        contactNumber: Joi.string()
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

        recruiterName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .optional()
            .messages({
                'string.min': 'Recruiter name must be at least 2 characters long',
                'string.max': 'Recruiter name cannot exceed 100 characters',
                'string.pattern.base': 'Recruiter name can only contain letters, spaces, periods, hyphens and apostrophes'
            }),

        jobRole: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .optional()
            .messages({
                'string.min': 'Job role must be at least 2 characters long',
                'string.max': 'Job role cannot exceed 100 characters'
            }),

        preferredJobLocation: Joi.string()
            .trim()
            .lowercase()
            .custom((value, helpers) => {
                const validLocation = ['ahmedabad', 'bengaluru', 'bangalore', 'san francisco'];
                if (!validLocation.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
            .optional()
            .messages({
                'any.only': 'Preferred job location must be either Ahmedabad or Bangalore'
            }),

        currentCTC: Joi.number()
            .integer()
            .min(0)
            .max(10000000)
            .optional()
            .messages({
                'number.base': 'Current CTC must be a number',
                'number.integer': 'Current CTC must be a whole number',
                'number.min': 'Current CTC cannot be negative',
                'number.max': 'Current CTC cannot exceed 1,00,00,000'
            }),

        expectedCTC: Joi.number()
            .integer()
            .min(0)
            .max(10000000)
            .optional()
            .messages({
                'number.base': 'Expected CTC must be a number',
                'number.integer': 'Expected CTC must be a whole number',
                'number.min': 'Expected CTC cannot be negative',
                'number.max': 'Expected CTC cannot exceed 1,00,00,000'
            }),

        noticePeriod: Joi.number()
            .integer()
            .min(0)
            .max(365)
            .optional()
            .messages({
                'number.base': 'Notice period must be a number',
                'number.integer': 'Notice period must be a whole number (days)',
                'number.min': 'Notice period cannot be negative',
                'number.max': 'Notice period cannot exceed 365 days'
            }),

        experienceYears: Joi.number()
            .integer()
            .min(0)
            .max(50)
            .optional()
            .messages({
                'number.base': 'Experience years must be a number',
                'number.integer': 'Experience years must be a whole number',
                'number.min': 'Experience years cannot be negative',
                'number.max': 'Experience years cannot exceed 50'
            }),

        linkedinProfileUrl: Joi.string()
            .trim()
            .uri({ scheme: ['http', 'https'] })
            .pattern(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/)
            .max(500)
            .optional()
            .allow('')
            .messages({
                'string.uri': 'LinkedIn profile URL must be a valid URL',
                'string.pattern.base': 'LinkedIn URL must be in format: https://linkedin.com/in/username',
                'string.max': 'LinkedIn profile URL cannot exceed 500 characters'
            }),

        status: Joi.string()
            .trim()
            .min(1)
            .max(50)
            .optional()
            .messages({
                'string.min': 'Status must be at least 1 character long',
                'string.max': 'Status cannot exceed 50 characters'
            })
            .custom((value, helpers) => {
                const validStatuses = ['selected', 'rejected', 'interview pending'];
                if (!validStatuses.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
    }).min(1)
        .custom((value, helpers) => {
            // CTC validation if both are provided
            if (value.currentCTC !== undefined && value.expectedCTC !== undefined) {
                if (value.expectedCTC < value.currentCTC) {
                    return helpers.error('custom.ctcRange');
                }
            }
            return value;
        })
        .messages({
            'object.min': 'At least one field must be provided for update',
            'custom.ctcRange': 'Expected CTC should not be less than current CTC'
        }),

    search: Joi.object({
        candidateName: Joi.string().trim().min(1).max(100).optional(),
        email: Joi.string().trim().email().max(255).optional(),
        jobRole: Joi.string().trim().min(1).max(100).optional(),
        preferredJobLocation: Joi.string().trim().lowercase().valid('ahmedabad', 'bangalore', 'bengaluru').optional(),
        recruiterName: Joi.string().trim().min(1).max(100).optional(),
        minExperience: Joi.number().integer().min(0).max(50).optional(),
        maxExperience: Joi.number().integer().min(0).max(50).optional(),
        minCurrentCTC: Joi.number().integer().min(0).max(10000000).optional(),
        maxCurrentCTC: Joi.number().integer().min(0).max(10000000).optional(),
        status: Joi.string().trim().min(1).max(50).optional(),
        limit: Joi.number().integer().min(1).max(1000).default(50).optional(),
        offset: Joi.number().integer().min(0).default(0).optional()
    }).custom((value, helpers) => {
        // Experience range validation
        if (value.minExperience !== undefined && value.maxExperience !== undefined) {
            if (value.minExperience > value.maxExperience) {
                return helpers.error('custom.experienceRange');
            }
        }

        // CTC range validation
        if (value.minCurrentCTC !== undefined && value.maxCurrentCTC !== undefined) {
            if (value.minCurrentCTC > value.maxCurrentCTC) {
                return helpers.error('custom.ctcRange');
            }
        }

        return value;
    }).messages({
        'custom.experienceRange': 'Minimum experience cannot be greater than maximum experience',
        'custom.ctcRange': 'Minimum CTC cannot be greater than maximum CTC'
    }),

    params: Joi.object({
        id: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Candidate ID must be a valid number',
                'number.integer': 'Candidate ID must be an integer',
                'number.positive': 'Candidate ID must be a positive number',
                'any.required': 'Candidate ID is required'
            })
    })
};

class CandidateValidator {
    static helper = null; // Will be initialized with database connection

    static init(db) {
        CandidateValidator.helper = new CandidateValidatorHelper(db);
    }

    static async validateCreate(req, res, next) {
        try {
            // Basic schema validation
            const { error, value } = candidateSchemas.create.validate(req.body, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            if (error) {
                const details = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }

            // Transform location
            if (value.preferredJobLocation) {
                value.preferredJobLocation = await CandidateValidator.helper.transformLocation(value.preferredJobLocation);
            }

            // Transform status
            if (value.status) {
                value.statusId = await CandidateValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            // Check for duplicates
            if (await CandidateValidator.helper.checkEmailExists(value.email)) {
                throw new AppError('A candidate with this email already exists', 409, 'DUPLICATE_EMAIL', { field: 'email' });
            }

            if (await CandidateValidator.helper.checkContactExists(value.contactNumber)) {
                throw new AppError('A candidate with this contact number already exists', 409, 'DUPLICATE_CONTACT', { field: 'contactNumber' });
            }

            // Replace request body with validated and transformed data
            req.body = value;
            next();
        } catch (error) {
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, (unlinkErr) => {
                    next(error);
                });
            } else {
                next(error);
            }
        }
    }

    static async validateUpdate(req, res, next) {
        try {
            // Validate params
            const { error: paramsError } = candidateSchemas.params.validate(req.params, { abortEarly: false });

            // Validate body
            const { error: bodyError, value } = candidateSchemas.update.validate(req.body, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            if (paramsError || bodyError) {
                const details = [];
                if (paramsError) {
                    details.push(...paramsError.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    })));
                }
                if (bodyError) {
                    details.push(...bodyError.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    })));
                }
                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }

            const candidateId = req.params.id;

            // Transform location
            if (value.preferredJobLocation) {
                value.preferredJobLocation = CandidateValidator.helper.transformLocation(value.preferredJobLocation);
            }

            // Transform status
            if (value.status) {
                value.statusId = await CandidateValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            // Check for duplicates (excluding current candidate)
            if (value.email && await CandidateValidator.helper.checkEmailExists(value.email, candidateId)) {
                throw new AppError('A candidate with this email already exists', 409, 'DUPLICATE_EMAIL', { field: 'email' });
            }

            if (value.contactNumber && await CandidateValidator.helper.checkContactExists(value.contactNumber, candidateId)) {
                throw new AppError('A candidate with this contact number already exists', 409, 'DUPLICATE_CONTACT', { field: 'contactNumber' });
            }

            // Replace request body with validated and transformed data
            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static validateDelete(req, res, next) {
        const { error } = candidateSchemas.params.validate(req.params, { abortEarly: false });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    /*static validateGetById(req, res, next) {
        const { error } = candidateSchemas.params.validate(req.params, { abortEarly: false });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }*/

    static async validateSearch(req, res, next) {
        try {
            const { error, value } = candidateSchemas.search.validate(req.query, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            if (error) {
                const details = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                throw new AppError('Search validation failed', 400, 'SEARCH_VALIDATION_ERROR', { validationErrors: details });
            }

            // Transform location
            if (value.preferredJobLocation) {
                value.preferredJobLocation = CandidateValidator.helper.transformLocation(value.preferredJobLocation);
            }

            // Transform status
            if (value.status) {
                value.statusId = await CandidateValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            // Replace request query with validated and transformed data
            req.query = value;
            next();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = CandidateValidator;