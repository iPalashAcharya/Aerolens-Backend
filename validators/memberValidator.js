const Joi = require('joi');
const AppError = require('../utils/appError');

class MemberValidatorHelper {
    constructor(db) {
        this.db = db;
        this.designationCache = new Map();
        this.clientCache = new Map();
        this.locationCache = new Map();
        this.skillCache = new Map();
    }

    async transformSkills(skills, client = null) {
        if (!skills || !Array.isArray(skills)) return [];

        const connection = client || await this.db.getConnection();
        const transformedSkills = [];

        try {
            for (const skill of skills) {
                const cacheKey = skill.skillName.toLowerCase().trim();

                let skillId = this.skillCache.get(cacheKey);
                if (!skillId) {
                    const query = `
                        SELECT lookupKey FROM lookup 
                        WHERE LOWER(value) = LOWER(?) AND tag = 'skill'
                    `;
                    const [rows] = await connection.execute(query, [skill.skillName.trim()]);
                    if (rows.length === 0) {
                        throw new AppError(
                            `Invalid skill: ${skill.skillName}. Please refer to the lookup table.`,
                            400,
                            'INVALID_SKILL'
                        );
                    }
                    skillId = rows[0].lookupKey;
                    this.skillCache.set(cacheKey, skillId);
                }

                transformedSkills.push({
                    skill: skillId,
                    proficiencyLevel: skill.proficiencyLevel ?? null,
                    yearsOfExperience: skill.yearsOfExperience ?? null
                });
            }
            return transformedSkills;
        } finally {
            if (!client) connection.release();
        }
    }

    async transformDesignation(designation, client = null) {
        if (!designation) return null;
        const cacheKey = designation.toLowerCase().trim();
        if (this.designationCache.has(cacheKey)) {
            return this.designationCache.get(cacheKey);
        }
        const connection = client || await this.db.getConnection();
        try {
            const query = `SELECT lookupKey FROM lookup WHERE LOWER(value) = LOWER(?) AND lookup.tag = 'designation'`;
            const [result] = await connection.execute(query, [designation.trim()]);
            if (result.length === 0) {
                throw new AppError(
                    `Invalid Designation ${designation}, Please refer lookup table for valid designations`,
                    400,
                    `INVALID_DESIGNATION`
                );
            }
            const designationId = result[0].lookupKey;
            this.designationCache.set(cacheKey, designationId);

            return designationId;

        } finally {
            if (!client) connection.release();
        }
    }

    async validateClientExists(clientId, client = null) {
        const connection = client || await this.db.getConnection();
        try {
            const query = `SELECT clientId FROM client WHERE clientId = ? AND isActive = TRUE`;
            const [result] = await connection.execute(query, [clientId]);
            if (result.length === 0) {
                throw new AppError(
                    `Client with ID ${clientId} does not exist or is inactive`,
                    400,
                    'INVALID_CLIENT_ID'
                );
            }
            return true;
        } finally {
            if (!client) connection.release();
        }
    }

    async transformClient(clientName, client = null) {
        if (!clientName) return null;
        const cacheKey = clientName.trim().toLowerCase();
        if (this.clientCache.has(cacheKey)) {
            return this.clientCache.get(cacheKey);
        }
        const connection = client || await this.db.getConnection();

        try {
            const query = `SELECT clientId FROM client WHERE LOWER(clientName) = LOWER(?)`;
            const [result] = await connection.execute(query, [clientName.trim()]);
            if (result.length === 0) {
                throw new AppError(
                    `Invalid Client Name Given`,
                    400,
                    `INVALID_CLIENT_NAME`
                );
            }
            const clientId = result[0].clientId;
            this.clientCache.set(cacheKey, clientId);

            return clientId;
        } finally {
            if (!client) connection.release();
        }
    }

    async getLocationIdByName(locationName, client = null) {
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
            return this.locationCache.get(cacheKey);
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
}

const memberSchema = {
    update: Joi.object({
        memberName: Joi.string()
            .min(2)
            .max(100)
            .trim()
            .messages({
                'string.min': 'Name must be at least 2 characters',
                'string.max': 'Name cannot exceed 100 characters'
            }),

        memberContact: Joi.string()
            .pattern(/^[0-9+\-\s()]+$/)
            .max(25)
            .messages({
                'string.pattern.base': 'Invalid contact number format'
            }),

        email: Joi.string()
            .email()
            .lowercase()
            .trim()
            .messages({
                'string.email': 'Please provide a valid email address'
            }),

        designation: Joi.string()
            .lowercase()
            .trim()
            .min(2)
            .max(100)
            .messages({
                'string.min': 'Designation must be at least 2 characters',
                'string.max': 'Designation cannot exceed 100 characters'
            }),

        isRecruiter: Joi.boolean(),

        isInterviewer: Joi.boolean(),

        clientId: Joi.number()
            .integer()
            .positive()
            .messages({
                'number.base': 'Client ID must be a number',
                'number.integer': 'Client ID must be an integer',
                'number.positive': 'Client ID must be positive'
            }),

        organisation: Joi.string()
            .trim()
            .min(1)
            .max(255)
            .allow('')
            .messages({
                'string.base': 'Organisation must be a string',
                'string.min': 'Organisation cannot be empty',
                'string.max': 'Organisation cannot exceed 255 characters'
            }),

        skills: Joi.array()
            .items(
                Joi.object({
                    skillName: Joi.string().trim().min(1).max(100).required()
                        .messages({
                            'string.base': 'Skill name must be a string',
                            'string.empty': 'Skill name cannot be empty',
                            'any.required': 'Skill name is required'
                        }),
                    proficiencyLevel: Joi.string()
                        .trim()
                        .valid('Beginner', 'Intermediate', 'Advanced', 'Expert')
                        .allow(null)
                        .default(null)
                        .messages({
                            'any.only': 'Proficiency level must be one of: Beginner, Intermediate, Advanced, Expert'
                        }),
                    yearsOfExperience: Joi.number()
                        .integer()
                        .min(0)
                        .max(60)
                        .allow(null)
                        .default(null)
                        .messages({
                            'number.base': 'Years of experience must be a number',
                            'number.integer': 'Years of experience must be an integer',
                            'number.min': 'Years of experience cannot be negative',
                            'number.max': 'Years of experience cannot exceed 60'
                        })
                })
            )
            .messages({
                'array.base': 'Skills must be an array',
                'array.includes': 'Each skill must be a valid skill object'
            }),

        location: Joi.object({
            city: Joi.string().trim().min(1).max(255),
            country: Joi.string().trim().min(1).max(255)
        })
            .messages({
                'object.base': 'Location must be an object with city and country'
            }),

        interviewerCapacity: Joi.number()
            .integer()
            .min(0)
            .messages({
                'number.base': 'Interviewer capacity must be a number',
                'number.integer': 'Interviewer capacity must be an integer',
                'number.min': 'Interviewer capacity cannot be negative'
            })
    }).min(1)
        .messages({
            'object.min': 'At least one field must be provided for update'
        }),

    params: Joi.object({
        memberId: Joi.number()
            .integer()
            .positive()
            .required()
            .messages({
                'number.base': 'Member ID must be a number',
                'number.integer': 'Member ID must be an integer',
                'number.positive': 'Member ID must be positive',
                'any.required': 'Member ID is required'
            })
    }),
};

class MemberValidator {
    static helper = null;

    static init(db) {
        MemberValidator.helper = new MemberValidatorHelper(db);
    }

    static async validateUpdate(req, res, next) {
        try {
            const { value, error: bodyError } = memberSchema.update.validate(req.body, {
                abortEarly: false,
                stripUnknown: true
            });
            const { error: paramsError } = memberSchema.params.validate(req.params, {
                abortEarly: false
            });

            if (bodyError || paramsError) {
                const details = [];
                if (bodyError) {
                    details.push(...bodyError.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    })));
                }
                if (paramsError) {
                    details.push(...paramsError.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    })));
                }
                throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', { validationErrors: details });
            }

            // Transform designation
            if (value.designation) {
                value.designationId = await MemberValidator.helper.transformDesignation(value.designation);
                delete value.designation;
            }

            if (value.clientId) {
                await MemberValidator.helper.validateClientExists(value.clientId);
            }

            // Transform location
            if (value.location) {
                value.locationId = await MemberValidator.helper.getLocationIdByName(value.location);
                delete value.location;
            }

            // Transform skills (FIXED: now returns correct format with 'skill' property)
            if (value.skills !== undefined) {
                value.skills = await MemberValidator.helper.transformSkills(value.skills);
            }

            if (value.isInterviewer === false) {
                value.interviewerCapacity = null;
            }

            req.body = value;
            next();
        } catch (error) {
            next(error);
        }
    }

    static validateDelete(req, res, next) {
        try {
            const { error } = memberSchema.params.validate(req.params, {
                abortEarly: false,
                stripUnknown: true
            });

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

    static validateParams(req, res, next) {
        try {
            const { error } = memberSchema.params.validate(req.params);

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
}

module.exports = MemberValidator;