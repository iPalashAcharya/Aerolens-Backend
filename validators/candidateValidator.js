const Joi = require('joi');
const AppError = require('../utils/appError');
const path = require('path');
const fs = require('fs');

// Database helper class for lookups
class CandidateValidatorHelper {
    constructor(db) {
        this.db = db;
        this.locationCache = new Map();
        this.statusCache = new Map();
        this.recruiterCache = new Map();
        this.CACHE_TTL_MS = 5 * 60 * 1000;
        this.cacheInitializedAt = Date.now();
    }

    _isCacheExpired() {
        return Date.now() - this.cacheInitializedAt > this.CACHE_TTL_MS;
    }

    _resetCacheIfNeeded() {
        if (this._isCacheExpired()) {
            this.statusCache.clear();
            this.locationCache.clear();
            this.recruiterCache.clear();
            this.cacheInitializedAt = Date.now();
        }
    }

    async _validateIdExists(table, column, id, client = null) {
        const ALLOWED = {
            lookup: ['lookupKey'],
            member: ['memberId'],
            location: ['locationId'],
            client: ['clientId'],
            candidate: ['candidateId']
        };

        if (!ALLOWED[table]?.includes(column)) {
            throw new AppError('Invalid lookup reference', 500, 'INTERNAL_ERROR');
        }
        const connection = client || await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT 1 FROM ${table} WHERE ${column} = ?`,
                [id]
            );
            return rows.length > 0;
        } finally {
            if (!client) connection.release();
        }
    }

    async getStatusIdByName(statusName, client = null) {
        this._resetCacheIfNeeded();
        if (!statusName) {
            statusName = 'pending';
        }

        const cacheKey = statusName.toLowerCase().trim();
        if (this.statusCache.has(cacheKey)) {
            const cachedId = this.statusCache.get(cacheKey);

            const isValid = await this._validateIdExists(
                'lookup',
                'lookupKey',
                cachedId,
                client
            );

            if (isValid) {
                return cachedId;
            }

            this.statusCache.delete(cacheKey);
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

    async getRecruiterId(recruiterName, client = null) {
        this._resetCacheIfNeeded();
        if (!recruiterName) return null;
        const connection = client || await this.db.getConnection();
        const cacheKey = recruiterName.toLowerCase().trim();
        if (this.recruiterCache.has(cacheKey)) {
            const cachedId = this.recruiterCache.get(cacheKey);

            const isValid = await this._validateIdExists(
                'member',
                'memberId',
                cachedId,
                client
            );

            if (isValid) return cachedId;
            this.recruiterCache.delete(cacheKey);
        }

        try {
            const query = `SELECT memberId FROM member WHERE LOWER(memberName)= LOWER(?) AND isRecruiter=TRUE`;
            const [rows] = await connection.execute(query, [recruiterName.trim()]);
            if (rows.length === 0) {
                throw new AppError(
                    `Invalid Recruiter Name: ${recruiterName} Does not exist in the database`,
                    400,
                    `INVALID_RECRUITER_NAME`
                );
            }
            const recruiterId = rows[0].memberId;
            this.recruiterCache.set(cacheKey, recruiterId);
            return recruiterId;
        } finally {
            if (!client) {
                connection.release();
            }
        }
    }

    // Add this method to the CandidateValidatorHelper class (after getRecruiterId method)

    async getJobProfileRequirementId(clientName, departmentName, jobRole, client = null) {
        this._resetCacheIfNeeded();

        if (!clientName || !departmentName || !jobRole) {
            throw new AppError(
                'Client name, department name, and job role are all required to identify job requirement',
                400,
                'INCOMPLETE_JOB_REQUIREMENT_INFO'
            );
        }

        const connection = client || await this.db.getConnection();

        try {
            const query = `
            SELECT jpr.jobProfileRequirementId 
            FROM jobProfileRequirement jpr
            INNER JOIN client c ON c.clientId = jpr.clientId
            INNER JOIN department d ON d.departmentId = jpr.departmentId
            INNER JOIN jobProfile jp ON jpr.jobProfileId = jobProfile.jobProfileId
            WHERE LOWER(c.clientName) = LOWER(?)
            AND LOWER(d.departmentName) = LOWER(?)
            AND LOWER(jp.jobRole) = LOWER(?)
            AND jpr.statusId IN (
                SELECT lookupKey FROM lookup 
                WHERE tag = 'profileStatus' 
                AND value IN ('Pending', 'In Progress')
            )
            LIMIT 1
        `;

            const [rows] = await connection.execute(query, [
                clientName.trim(),
                departmentName.trim(),
                jobRole.trim()
            ]);

            if (rows.length === 0) {
                throw new AppError(
                    `No active job requirement found for Client: '${clientName}', Department: '${departmentName}', Role: '${jobRole}'`,
                    400,
                    'JOB_REQUIREMENT_NOT_FOUND'
                );
            }

            return rows[0].jobProfileRequirementId;
        } finally {
            if (!client) connection.release();
        }
    }

    async transformLocation(locationName, client = null) {
        this._resetCacheIfNeeded();
        if (!locationName) return null;
        if (!locationName.city) {
            throw new AppError(
                `Invalid location object: 'city' is required.`,
                400,
                'INVALID_LOCATION_OBJECT'
            );
        }

        const locationValue = locationName.city;
        if (!locationValue) return null;

        const cacheKey = locationValue.toLowerCase().trim();
        if (this.locationCache.has(cacheKey)) {
            const cachedId = this.locationCache.get(cacheKey);

            const isValid = await this._validateIdExists('location', 'locationId', cachedId)
            if (isValid) {
                return cachedId;
            }

            this.locationCache.delete(cacheKey);
        }

        const connection = client || await this.db.getConnection();
        try {
            const query = `SELECT locationId FROM location WHERE LOWER(cityName) = LOWER(?)`;
            const [rows] = await connection.execute(query, [locationValue.trim()]);

            if (rows.length === 0) {
                throw new AppError(
                    `Invalid location: '${locationValue}'. Location does not exist.`,
                    400,
                    'INVALID_LOCATION'
                );
            }

            const locationId = rows[0].locationId;
            this.locationCache.set(cacheKey, locationId);
            return locationId;
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

        /*recruiterName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .required()
            /*.custom((value, helpers) => {
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
            }),*/
        recruiterId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'any.required': 'Recruiter ID is required',
                'number.base': 'Recruiter ID must be a number',
                'number.positive': 'Recruiter ID must be a positive number'
            }),

        jobProfileRequirementId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'any.required': 'Job Profile Requirement ID is required',
                'number.base': 'Job Profile Requirement ID must be a number',
                'number.positive': 'Job Profile Requirement ID must be a positive number'
            }),

        currentLocation: Joi.object({
            country: Joi.string()
                .trim()
                .lowercase()
                .required()
                .messages({
                    "string.base": "Location's country must be a string",
                }),
            city: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    "string.min": "Location's city must be at least 2 characters long",
                    "string.max": "Location's city cannot exceed 100 characters",
                }),
        }).optional().messages({
            "object.unknown": "Invalid location object structure",
        }),
        expectedLocation: Joi.object({
            country: Joi.string()
                .trim()
                .lowercase()
                .required()
                .messages({
                    "string.empty": "Location's country is required",
                    "string.base": "Location's country must be a string",
                }),
            city: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    "string.min": "Location's city must be at least 2 characters long",
                    "string.max": "Location's city cannot exceed 100 characters",
                }),
        }).required().messages({
            "object.unknown": "Invalid location object structure",
        }),
        currentCTC: Joi.number()
            .precision(2)
            .min(0)
            .max(10000000)
            .optional()
            .messages({
                'number.base': 'Current CTC must be a number',
                'number.integer': 'Current CTC must be a whole number',
                'number.min': 'Current CTC cannot be negative',
                'number.max': 'Current CTC cannot exceed 1,00,00,000',
            }),

        expectedCTC: Joi.number()
            .precision(2)
            .min(0)
            .max(10000000)
            .optional()
            .messages({
                'number.base': 'Expected CTC must be a number',
                'number.integer': 'Expected CTC must be a whole number',
                'number.min': 'Expected CTC cannot be negative',
                'number.max': 'Expected CTC cannot exceed 1,00,00,000',
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
            .precision(2)
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

        /*status: Joi.string()
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
            }),*/
        notes: Joi.string()
            .allow('')
            .optional()
            .messages({
                'string.base': 'Notes must be text'
            }),
        vendorId: Joi.number()
            .allow('')
            .optional()
            .messages({
                'number.base': 'Vendor ID must be a number'
            }),
        referredBy: Joi.string()
            .trim()
            .min(2)
            .max(150)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .optional()
            .allow('')
            .messages({
                'string.min': 'Referred by must be at least 2 characters long',
                'string.max': 'Referred by cannot exceed 150 characters',
                'string.pattern.base': 'Referred by can only contain letters, spaces, periods, hyphens and apostrophes'
            }),
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
            .allow('', null)
            .messages({
                'string.pattern.base': 'Contact number must be a valid phone number (7-25 characters, numbers, spaces, +, -, () allowed)'
            }),

        email: Joi.string()
            .trim()
            .email()
            .max(255)
            .lowercase()
            .optional()
            .allow('', null)
            .messages({
                'string.email': 'Email must be a valid email address',
                'string.max': 'Email cannot exceed 255 characters'
            }),

        /*recruiterName: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .optional()
            .messages({
                'string.min': 'Recruiter name must be at least 2 characters long',
                'string.max': 'Recruiter name cannot exceed 100 characters',
                'string.pattern.base': 'Recruiter name can only contain letters, spaces, periods, hyphens and apostrophes'
            }),*/
        recruiterId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'number.base': 'Recruiter ID must be a number',
                'number.positive': 'Recruiter ID must be a positive number'
            }),

        jobProfileRequirementId: Joi.number()
            .integer()
            .positive()
            .optional()
            .messages({
                'any.required': 'Job Profile Requirement ID is required',
                'number.base': 'Job Profile Requirement ID must be a number',
                'number.positive': 'Job Profile Requirement ID must be a positive number'
            }),

        currentLocation: Joi.object({
            country: Joi.string()
                .trim()
                .lowercase()
                .required()
                .messages({
                    "string.empty": "Location's country is required",
                    "string.base": "Location's country must be a string",
                }),
            city: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    "string.min": "Location's city must be at least 2 characters long",
                    "string.max": "Location's city cannot exceed 100 characters",
                }),
        }).optional().allow(null).messages({
            "object.unknown": "Invalid location object structure",
        }),
        expectedLocation: Joi.object({
            country: Joi.string()
                .trim()
                .lowercase()
                .required()
                .messages({
                    "string.empty": "Location's country is required",
                    "string.base": "Location's country must be a string",
                }),
            city: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    "string.min": "Location's city must be at least 2 characters long",
                    "string.max": "Location's city cannot exceed 100 characters",
                }),
        }).optional().messages({
            "object.unknown": "Invalid location object structure",
        }),
        currentCTC: Joi.number()
            .precision(2)
            .min(0)
            .max(10000000)
            .optional()
            .allow(null)
            .messages({
                'number.base': 'Current CTC must be a number',
                'number.integer': 'Current CTC must be a whole number',
                'number.min': 'Current CTC cannot be negative',
                'number.max': 'Current CTC cannot exceed 1,00,00,000'
            }),

        expectedCTC: Joi.number()
            .precision(2)
            .min(0)
            .max(10000000)
            .optional()
            .allow(null)
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
            .precision(2)
            .min(0)
            .max(50)
            .optional()
            .allow(null)
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
            .allow('', null)
            .messages({
                'string.uri': 'LinkedIn profile URL must be a valid URL',
                'string.pattern.base': 'LinkedIn URL must be in format: https://linkedin.com/in/username',
                'string.max': 'LinkedIn profile URL cannot exceed 500 characters'
            }),

        /*status: Joi.string()
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
            }),*/
        notes: Joi.string()
            .allow('', null)
            .optional()
            .messages({
                'string.base': 'Notes must be text'
            }),
        vendorId: Joi.number()
            .allow(null)
            .optional()
            .messages({
                'number.base': 'Vendor ID must be a number'
            }),
        referredBy: Joi.string()
            .trim()
            .min(2)
            .max(150)
            .pattern(/^[a-zA-Z\s.'-]+$/)
            .optional()
            .allow(null, '')
            .messages({
                'string.min': 'Referred by must be at least 2 characters long',
                'string.max': 'Referred by cannot exceed 150 characters',
                'string.pattern.base': 'Referred by can only contain letters, spaces, periods, hyphens and apostrophes'
            }),

    }).messages({
        'object.min': 'At least one field must be provided for update'
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

    static removeNulls(obj) {
        if (!obj || typeof obj !== 'object') return;

        Object.keys(obj).forEach(key => {
            if (obj[key] === null) {
                delete obj[key];
            } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                CandidateValidator.removeNulls(obj[key]);
                if (Object.keys(obj[key]).length === 0) {
                    delete obj[key];
                }
            }
        });
    }

    static async validateCreate(req, res, next) {
        try {
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

                // Cleanup S3 file if validation fails
                if (req.file && req.file.key) {
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));
                }

                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }

            // File type validation
            if (req.file) {
                const allowedMimeTypes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                ];
                if (!allowedMimeTypes.includes(req.file.mimetype)) {
                    // Cleanup S3 file
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));

                    throw new AppError('Invalid resume file format. Only PDF, DOC and DOCX are allowed.', 400, 'VALIDATION_ERROR', { field: 'resume' });
                }

                const maxSizeBytes = 5 * 1024 * 1024;
                if (req.file.size > maxSizeBytes) {
                    // Cleanup S3 file
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));

                    throw new AppError('Resume file size cannot exceed 5MB', 400, 'VALIDATION_ERROR', { field: 'resume' });
                }
            }

            // Transform location
            if (value.expectedLocation) {
                value.expectedLocation = await CandidateValidator.helper.transformLocation(value.expectedLocation);
            }

            if (value.currentLocation) {
                value.currentLocation = await CandidateValidator.helper.transformLocation(value.currentLocation);
            }

            value.statusId = await CandidateValidator.helper.getStatusIdByName('pending');

            /*if (value.recruiterName) {
                value.recruiterId = await CandidateValidator.helper.getRecruiterId(value.recruiterName);
                delete value.recruiterName;
            }*/

            // Check for duplicates
            if (value.email && await CandidateValidator.helper.checkEmailExists(value.email)) {
                // Cleanup S3 file
                if (req.file && req.file.key) {
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));
                }
                throw new AppError('A candidate with this email already exists', 409, 'DUPLICATE_EMAIL', { field: 'email' });
            }

            if (value.contactNumber && await CandidateValidator.helper.checkContactExists(value.contactNumber)) {
                // Cleanup S3 file
                if (req.file && req.file.key) {
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));
                }
                throw new AppError('A candidate with this contact number already exists', 409, 'DUPLICATE_CONTACT', { field: 'contactNumber' });
            }

            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static async validateUpdate(req, res, next) {
        try {
            // Validate params
            const { error: paramsError } = candidateSchemas.params.validate(req.params, { abortEarly: false });

            // Validate body
            let { error: bodyError, value } = candidateSchemas.update.validate(req.body, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            // If no body fields but req.file exists, set value to empty object
            if (bodyError) {
                const hasMinOneError = bodyError.details.some(d => d.type === 'object.min');
                if (hasMinOneError && req.file) {
                    bodyError = null;
                    value = {};  // Set to empty object instead of leaving undefined
                }
            }

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

                // Cleanup S3 file if validation fails
                if (req.file && req.file.key) {
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));
                }

                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }

            // File type validation
            if (req.file) {
                const allowedMimeTypes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                ];

                if (!allowedMimeTypes.includes(req.file.mimetype)) {
                    // Cleanup S3 file
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));

                    throw new AppError('Invalid resume file format. Only PDF, DOC and DOCX are allowed.', 400, 'VALIDATION_ERROR', { field: 'resume' });
                }

                const maxSizeBytes = 5 * 1024 * 1024;
                if (req.file.size > maxSizeBytes) {
                    // Cleanup S3 file
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));

                    throw new AppError('Resume file size cannot exceed 5MB', 400, 'VALIDATION_ERROR', { field: 'resume' });
                }
            }

            const candidateId = req.params.id;

            // Transform location
            if (value.expectedLocation) {
                value.expectedLocation = await CandidateValidator.helper.transformLocation(value.expectedLocation);
            }

            if (value.currentLocation) {
                value.currentLocation = await CandidateValidator.helper.transformLocation(value.currentLocation);
            }

            // Transform status
            /*if (value.status) {
                value.statusId = await CandidateValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }*/
            /*if (value.recruiterName) {
                value.recruiterId = await CandidateValidator.helper.getRecruiterId(value.recruiterName);
                delete value.recruiterName;
            }*/

            // Check for duplicates (excluding current candidate)
            Object.keys(value).forEach(key => {
                if (value[key] === '') {
                    value[key] = null;
                }
            });
            if (value.email && await CandidateValidator.helper.checkEmailExists(value.email, candidateId)) {
                // Cleanup S3 file
                if (req.file && req.file.key) {
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));
                }
                throw new AppError('A candidate with this email already exists', 409, 'DUPLICATE_EMAIL', { field: 'email' });
            }

            if (value.contactNumber && await CandidateValidator.helper.checkContactExists(value.contactNumber, candidateId)) {
                // Cleanup S3 file
                if (req.file && req.file.key) {
                    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: req.file.key
                    })).catch(err => console.error('S3 cleanup error:', err));
                }
                throw new AppError('A candidate with this contact number already exists', 409, 'DUPLICATE_CONTACT', { field: 'contactNumber' });
            }

            req.body = value;  // ✅ Now this will be {} if only file uploaded
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
                value.preferredJobLocation = await CandidateValidator.helper.transformLocation(value.preferredJobLocation);
            }

            // Transform status
            if (value.status) {
                value.statusId = await CandidateValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            // Replace request query with validated and transformed data
            req.validatedSearch = value;
            next();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = {
    CandidateValidator,
    CandidateValidatorHelper
};