const Joi = require('joi');
const AppError = require('../utils/appError');

class JobProfileRequirementValidatorHelper {
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

    async checkJobRoleExists(jobRole, clientId, departmentId, excludeJobProfileRequirementId = null, client = null) {
        const connection = client || await this.db.getConnection();

        try {
            let query = `SELECT jobProfileRequirementId FROM jobProfileRequirement WHERE jobRole = ? AND clientId = ? AND departmentId = ?`;
            const params = [jobRole, clientId, departmentId];

            if (excludeJobProfileRequirementId) {
                query += ` AND jobProfileRequirementId != ?`;
                params.push(excludeJobProfileRequirementId);
            }

            const [rows] = await connection.execute(query, params);
            return rows.length > 0;
        } finally {
            if (!client) connection.release();
        }
    }

    async validateJobProfileExists(jobProfileId, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const [rows] = await connection.execute(
                'SELECT 1 FROM jobProfile WHERE jobProfileId = ?',
                [jobProfileId]
            );
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

const jobProfileRequirementSchemas = {
    create: Joi.object({
        jobProfileId: Joi.number().integer().positive().optional().messages({
            "number.base": "Job Profile ID must be a number",
            "number.integer": "Job Profile ID must be an integer",
            "number.positive": "Job Profile ID must be a positive number",
        }),

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

        jobRole: Joi.string().trim().min(2).max(100).required().messages({
            "string.empty": "Job role is required",
            "string.min": "Job role must be at least 2 characters",
            "string.max": "Job role cannot exceed 100 characters",
        }),

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
        jobProfileId: Joi.number().integer().positive().optional().messages({
            "number.base": "Job Profile ID must be a number",
            "number.integer": "Job Profile ID must be an integer",
            "number.positive": "Job Profile ID must be a positive number",
        }),

        jobRole: Joi.string().trim().min(2).max(100).optional(),

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
                'number.base': 'Job profile requirement ID must be a valid number',
                'number.positive': 'Job profile requirement ID must be a positive number'
            })
    }),

    search: Joi.object({
        jobProfileId: Joi.number().integer().positive().optional(),
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

class JobProfileRequirementValidator {
    static helper = null;

    static init(db) {
        JobProfileRequirementValidator.helper = new JobProfileRequirementValidatorHelper(db);
    }

    static async validateCreate(req, res, next) {
        try {
            const { error, value } = jobProfileRequirementSchemas.create.validate(req.body, {
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

            // Validate jobProfileId exists if provided
            if (value.jobProfileId) {
                const exists = await JobProfileRequirementValidator.helper.validateJobProfileExists(value.jobProfileId);
                if (!exists) {
                    throw new AppError(
                        `Job profile with ID ${value.jobProfileId} does not exist`,
                        404,
                        'JOB_PROFILE_NOT_FOUND',
                        { field: 'jobProfileId' }
                    );
                }
            }

            // Transform location string to locationId
            if (value.location) {
                value.locationId = await JobProfileRequirementValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform status string to statusId (if provided)
            if (value.status) {
                value.statusId = await JobProfileRequirementValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            } else {
                value.statusId = await JobProfileRequirementValidator.helper.getStatusIdByName('pending');
            }

            // Check for duplicate job role based on unique constraint (clientId, departmentId, jobRole)
            if (await JobProfileRequirementValidator.helper.checkJobRoleExists(
                value.jobRole,
                value.clientId,
                value.departmentId
            )) {
                throw new AppError(
                    'A job profile requirement with this role already exists for this client and department',
                    409,
                    'DUPLICATE_JOB_REQUIREMENT',
                    { field: 'jobRole' }
                );
            }

            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static async validateUpdate(req, res, next) {
        try {
            const { error: paramsError } = jobProfileRequirementSchemas.params.validate(req.params, { abortEarly: false });

            let { error: bodyError, value } = jobProfileRequirementSchemas.update.validate(req.body, {
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

            const jobProfileRequirementId = req.params.id;

            // Validate jobProfileId exists if provided
            if (value.jobProfileId) {
                const exists = await JobProfileRequirementValidator.helper.validateJobProfileExists(value.jobProfileId);
                if (!exists) {
                    throw new AppError(
                        `Job profile with ID ${value.jobProfileId} does not exist`,
                        404,
                        'JOB_PROFILE_NOT_FOUND',
                        { field: 'jobProfileId' }
                    );
                }
            }

            // Transform location string to locationId
            if (value.location) {
                value.locationId = await JobProfileRequirementValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform status string to statusId
            if (value.status) {
                value.statusId = await JobProfileRequirementValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            // Check for duplicate job role (if jobRole is being updated)
            if (value.jobRole) {
                const connection = await JobProfileRequirementValidator.helper.db.getConnection();
                try {
                    const [existingRows] = await connection.execute(
                        'SELECT clientId, departmentId FROM jobProfileRequirement WHERE jobProfileRequirementId = ?',
                        [jobProfileRequirementId]
                    );

                    if (existingRows.length === 0) {
                        throw new AppError(
                            `Job profile requirement with ID ${jobProfileRequirementId} not found`,
                            404,
                            'JOB_PROFILE_REQUIREMENT_NOT_FOUND'
                        );
                    }

                    const { clientId, departmentId } = existingRows[0];

                    if (await JobProfileRequirementValidator.helper.checkJobRoleExists(
                        value.jobRole,
                        clientId,
                        departmentId,
                        jobProfileRequirementId
                    )) {
                        throw new AppError(
                            'A job profile requirement with this role already exists for this client and department',
                            409,
                            'DUPLICATE_JOB_REQUIREMENT',
                            { field: 'jobRole' }
                        );
                    }
                } finally {
                    connection.release();
                }
            }

            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static validateDelete(req, res, next) {
        try {
            const { error } = jobProfileRequirementSchemas.params.validate(req.params, { abortEarly: false });

            if (error) {
                const details = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }
            next();
        } catch (error) {
            next(error);
        }
    }

    static validateGetById(req, res, next) {
        try {
            const { error } = jobProfileRequirementSchemas.params.validate(req.params, { abortEarly: false });

            if (error) {
                const details = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }
            next();
        } catch (error) {
            next(error);
        }
    }

    static async validateSearch(req, res, next) {
        try {
            const { error, value } = jobProfileRequirementSchemas.search.validate(req.query, {
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
                value.locationId = await JobProfileRequirementValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform status string to statusId
            if (value.status) {
                value.statusId = await JobProfileRequirementValidator.helper.getStatusIdByName(value.status);
                delete value.status;
            }

            req.validatedSearch = value;
            next();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = JobProfileRequirementValidator;