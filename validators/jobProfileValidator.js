const Joi = require('joi');
const AppError = require('../utils/appError');
class JobProfileValidatorHelper {
    constructor(db) {
        this.db = db;
        this.statusCache = new Map();
        this.locationCache = new Map();
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
            this.cacheInitializedAt = Date.now();
        }
    }

    async _validateLookupKeyExists(lookupKey, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                'SELECT 1 FROM lookup WHERE lookupKey = ?',
                [lookupKey]
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

            const isValid = await this._validateLookupKeyExists(cachedId, client);
            if (isValid) {
                return cachedId;
            }

            this.statusCache.delete(cacheKey);
        }

        const connection = client || await this.db.getConnection();

        try {
            const query = `SELECT lookupKey FROM lookup WHERE LOWER(value) = LOWER(?) AND lookup.tag = 'profileStatus'`;
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

    async getLocationIdByName(locationName, client = null) {
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

            const isValid = await this._validateLookupKeyExists(cachedId, client);
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

    async checkJobRoleExists(jobRole, clientId, excludeJobProfileId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT jobProfileId FROM jobProfile WHERE jobRole = ? AND clientId = ?`;
            const params = [jobRole, clientId];

            if (excludeJobProfileId) {
                query += ` AND jobProfileId != ?`;
                params.push(excludeJobProfileId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0;
        } finally {
            if (!client) connection.release();
        }
    }

    clearCache() {
        this.statusCache.clear();
        this.locationCache.clear();
    }
}

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

        estimatedCloseDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .custom((value, helpers) => {
                const inputDate = new Date(value + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (inputDate < today) {
                    return helpers.error('date.min');
                }
                return value;
            })
            .messages({
                'string.pattern.base': 'Close date must be in YYYY-MM-DD format',
                'date.min': 'Close date cannot be in the past',
                'any.required': 'Close date is required'
            }),

        workArrangement: Joi.string().trim().lowercase().valid('remote', 'onsite', 'hybrid').required().messages({
            "any.only": "Work arrangement must be one of 'remote', 'onsite', or 'hybrid'",
            "any.required": "Work arrangement is required",
        }),

        location: Joi.object({
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

        status: Joi.string()
            .trim()
            .min(2)
            .max(50)
            .optional()
            .custom((value, helpers) => {
                const validStatuses = ['cancelled', 'closed', 'in progress', 'pending'];
                if (!validStatuses.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
            .messages({
                "string.min": "Status must be at least 2 characters long",
                "string.max": "Status cannot exceed 50 characters",
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
            .message("Tech specification must be comma separated values"),

        estimatedCloseDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .custom((value, helpers) => {
                const inputDate = new Date(value + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (inputDate < today) {
                    return helpers.error('date.min');
                }
                return value;
            })
            .messages({
                'string.pattern.base': 'Close date must be in YYYY-MM-DD format',
                'date.min': 'Close date cannot be in the past',
                'any.required': 'Close date is required'
            }),

        workArrangement: Joi.string().trim().lowercase().valid('remote', 'onsite', 'hybrid').optional().messages({
            "any.only": "Work arrangement must be one of 'remote', 'onsite', or 'hybrid'"
        }),

        positions: Joi.number().integer().positive().optional().messages({
            "number.base": "Positions must be a number",
            "number.integer": "Positions must be an integer",
            "number.positive": "Positions must be a positive number",
        }),

        location: Joi.object({
            country: Joi.string()
                .trim()
                .lowercase()
                .optional()
                .messages({
                    "string.empty": "Location's country is required",
                    "string.base": "Location's country must be a string",
                }),
            city: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .optional()
                .messages({
                    "string.min": "Location's city must be at least 2 characters long",
                    "string.max": "Location's city cannot exceed 100 characters",
                }),
        }).min(1).optional().messages({
            "object.min": "At least one field (country or city) must be provided in location",
            "object.unknown": "Invalid location object structure",
        }),

        status: Joi.string()
            .trim()
            .min(2)
            .max(50)
            .optional()
            .custom((value, helpers) => {
                const validStatuses = ['cancelled', 'closed', 'in progress', 'pending'];
                if (!validStatuses.includes(value.toLowerCase())) {
                    return helpers.error("any.invalid");
                }
                return value;
            })
            .messages({
                "string.min": "Status must be at least 2 characters long",
                "string.max": "Status cannot exceed 50 characters",
            }),
    }).min(1).messages({
        'object.min': 'At least one field must be provided for update'
    }),

    params: Joi.object({
        id: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Job profile ID must be a valid number',
                'number.positive': 'Job profile ID must be a positive number'
            })
    }),

    search: Joi.object({
        clientId: Joi.number().integer().positive().optional(),
        departmentId: Joi.number().integer().positive().optional(),
        jobRole: Joi.string().trim().min(1).max(100).optional(),
        location: Joi.string().trim().min(1).max(100).optional(),
        status: Joi.string().trim().min(1).max(50).optional(),
        minPositions: Joi.number().integer().min(1).optional(),
        maxPositions: Joi.number().integer().min(1).optional(),
        workArrangement: Joi.string().trim().valid('remote', 'onsite', 'hybrid').optional(),
        fromDate: Joi.date().optional(),
        toDate: Joi.date().optional(),
        limit: Joi.number().integer().min(1).max(1000).default(50).optional(),
        offset: Joi.number().integer().min(0).default(0).optional()
    }).custom((value, helpers) => {
        if (value.minPositions !== undefined && value.maxPositions !== undefined) {
            if (value.minPositions > value.maxPositions) {
                return helpers.error('custom.positionRange');
            }
        }

        if (value.fromDate !== undefined && value.toDate !== undefined) {
            if (value.fromDate > value.toDate) {
                return helpers.error('custom.dateRange');
            }
        }

        return value;
    }).messages({
        'custom.positionRange': 'Minimum positions cannot be greater than maximum positions',
        'custom.dateRange': 'From date cannot be greater than to date'
    })
};

class JobProfileValidator {
    static helper = null; // Will be initialized with database connection

    static init(db) {
        JobProfileValidator.helper = new JobProfileValidatorHelper(db);
    }

    static async validateCreate(req, res, next) {
        try {
            // Basic schema validation
            const { error, value } = jobProfileSchemas.create.validate(req.body, {
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

            // Transform location string to locationId
            if (value.location) {
                value.locationId = await JobProfileValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform status string to statusId (if provided)
            if (value.status) {
                value.statusId = await JobProfileValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            } else {
                // Set default status if not provided
                value.statusId = await JobProfileValidator.helper.getStatusIdByName('pending');
            }

            // Check for duplicate job role for the same client
            if (await JobProfileValidator.helper.checkJobRoleExists(value.jobRole, value.clientId)) {
                throw new AppError(
                    'A job profile with this role already exists for this client',
                    409,
                    'DUPLICATE_JOB_ROLE',
                    { field: 'jobRole' }
                );
            }

            // Replace request body with validated and transformed data
            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static async validateUpdate(req, res, next) {
        try {
            // Validate params
            const { error: paramsError } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });

            // Validate body
            let { error: bodyError, value } = jobProfileSchemas.update.validate(req.body, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

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
                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }

            const jobProfileId = req.params.id;

            // Transform location string to locationId
            if (value.location) {
                value.locationId = await JobProfileValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform status string to statusId
            if (value.status) {
                value.statusId = await JobProfileValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            // Check for duplicate job role (if jobRole is being updated)
            if (value.jobRole) {
                // We need to get the existing job profile to check clientId
                const connection = await JobProfileValidator.helper.db.getConnection();
                try {
                    const [existingRows] = await connection.execute(
                        'SELECT clientId FROM jobProfile WHERE jobProfileId = ?',
                        [jobProfileId]
                    );

                    if (existingRows.length === 0) {
                        throw new AppError(
                            `Job profile with ID ${jobProfileId} not found`,
                            404,
                            'JOB_PROFILE_NOT_FOUND'
                        );
                    }

                    const clientId = existingRows[0].clientId;

                    if (await JobProfileValidator.helper.checkJobRoleExists(value.jobRole, clientId, jobProfileId)) {
                        throw new AppError(
                            'A job profile with this role already exists for this client',
                            409,
                            'DUPLICATE_JOB_ROLE',
                            { field: 'jobRole' }
                        );
                    }
                } finally {
                    connection.release();
                }
            }

            // Replace request body with validated and transformed data
            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static validateDelete(req, res, next) {
        const { error } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    static validateGetById(req, res, next) {
        const { error } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
        }
        next();
    }

    static async validateSearch(req, res, next) {
        try {
            const { error, value } = jobProfileSchemas.search.validate(req.query, {
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

            // Transform location string to locationId
            if (value.location) {
                value.locationId = await JobProfileValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform status string to statusId
            if (value.status) {
                value.statusId = await JobProfileValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            req.validatedSearch = value;
            next();
        } catch (error) {
            next(error);
        }
    }
    static validateJDUpload(req, res, next) {
        if (!req.file) {
            return next();
        }

        const allowedMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            throw new AppError(
                'Invalid JD file type. Only PDF, DOC, and DOCX are allowed.',
                400,
                'INVALID_JD_FILE_TYPE',
                {
                    allowedTypes: ['pdf', 'doc', 'docx'],
                    receivedType: req.file.mimetype
                }
            );
        }

        const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

        if (req.file.size > MAX_SIZE) {
            throw new AppError(
                'JD file size exceeds the 5MB limit',
                400,
                'JD_FILE_TOO_LARGE',
                {
                    maxSizeMB: 5
                }
            );
        }

        next();
    }
    static normalizeMultipartBody(req, res, next) {
        if (req.body.location && typeof req.body.location === 'string') {
            try {
                req.body.location = JSON.parse(req.body.location);
            } catch {
                throw new AppError(
                    'Invalid JSON in location field',
                    400,
                    'INVALID_LOCATION_JSON'
                );
            }
        }
        next();
    }
}

module.exports = JobProfileValidator;