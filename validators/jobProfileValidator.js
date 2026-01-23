const Joi = require('joi');
const AppError = require('../utils/appError');

const normalizeWhitespace = (text) => {
    if (!text) return null;

    return text
        .replace(/\r\n/g, '\n')       // Windows → Unix
        .replace(/\r/g, '\n')         // Old Mac → Unix
        .replace(/[ \t]+/g, ' ')      // Collapse multiple spaces/tabs
        .replace(/\n{3,}/g, '\n\n')   // Max 2 newlines
        .replace(/ \n/g, '\n')        // Space before newline
        .replace(/\n /g, '\n')        // Space after newline
        .trim();                      // Trim edges
};

// Helper to convert structured content to plain text
const convertStructuredContentToText = (content) => {
    if (!content) return null;

    // Parse JSON string if needed
    if (typeof content === 'string') {
        const trimmed = content.trim();

        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                content = JSON.parse(trimmed);
            } catch {
                return normalizeWhitespace(trimmed);
            }
        } else {
            return normalizeWhitespace(trimmed);
        }
    }

    let result = null;

    if (content.type === 'bullets' && Array.isArray(content.content)) {
        result = content.content
            .map(item => item.text?.trim())
            .filter(Boolean)
            .join('\n');
    }

    else if (content.type === 'paragraph' && Array.isArray(content.content)) {
        result = content.content
            .map(item => item.text?.trim())
            .filter(Boolean)
            .join('\n');
    }

    else if (Array.isArray(content)) {
        result = content
            .map(item => {
                if (item.type === 'paragraph' && Array.isArray(item.content)) {
                    return item.content
                        .map(c => c.text?.trim())
                        .filter(Boolean)
                        .join('\n');
                }
                if (item.type === 'bullets' && Array.isArray(item.content)) {
                    return item.content
                        .map(c => c.text?.trim())
                        .filter(Boolean)
                        .join('\n');
                }
                return item.text?.trim() || '';
            })
            .filter(Boolean)
            .join('\n\n');
    }

    return normalizeWhitespace(result);
};

class JobProfileValidatorHelper {
    constructor(db) {
        this.db = db;
        this.techSpecCache = new Map();
        this.CACHE_TTL_MS = 5 * 60 * 1000;
        this.cacheInitializedAt = Date.now();
    }

    _isCacheExpired() {
        return Date.now() - this.cacheInitializedAt > this.CACHE_TTL_MS;
    }

    _resetCacheIfNeeded() {
        if (this._isCacheExpired()) {
            this.techSpecCache.clear();
            this.cacheInitializedAt = Date.now();
        }
    }

    async validateTechSpecifications(techSpecs, client = null) {
        if (!techSpecs || !Array.isArray(techSpecs) || techSpecs.length === 0) {
            return [];
        }

        this._resetCacheIfNeeded();
        const connection = client || await this.db.getConnection();

        try {
            const validatedSpecs = [];

            for (const spec of techSpecs) {
                const specName = typeof spec === 'string' ? spec : spec.name;
                if (!specName) continue;

                const cacheKey = specName.toLowerCase().trim();

                if (this.techSpecCache.has(cacheKey)) {
                    validatedSpecs.push(this.techSpecCache.get(cacheKey));
                    continue;
                }

                const query = `
                    SELECT lookupKey, value 
                    FROM lookup 
                    WHERE LOWER(value) = LOWER(?) AND tag = 'techSpecification'
                `;
                const [rows] = await connection.execute(query, [specName.trim()]);

                if (rows.length === 0) {
                    throw new AppError(
                        `Invalid technical specification: '${specName}'. Technical specification does not exist.`,
                        400,
                        'INVALID_TECH_SPEC'
                    );
                }

                const lookupId = rows[0].lookupKey;
                this.techSpecCache.set(cacheKey, lookupId);
                validatedSpecs.push(lookupId);
            }

            return validatedSpecs;
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
        this.techSpecCache.clear();
    }
}

const structuredContentSchema = Joi.alternatives().try(
    Joi.string().trim().max(5000),
    Joi.object({
        type: Joi.string().valid('paragraph', 'bullets').required(),
        content: Joi.array().items(
            Joi.object({
                id: Joi.string().optional(),
                text: Joi.string().required()
            })
        ).required()
    }),
    Joi.array().items(
        Joi.object({
            type: Joi.string().valid('paragraph', 'bullets').required(),
            content: Joi.array().items(
                Joi.object({
                    id: Joi.string().optional(),
                    text: Joi.string().required()
                })
            ).required()
        })
    )
);

const jobProfileSchemas = {
    create: Joi.object({
        position: Joi.string().trim().min(2).max(100).required().messages({
            'string.min': 'Position must be at least 2 characters long',
            'string.max': 'Position cannot exceed 100 characters',
            'any.required': 'Position is required'
        }),
        experience: Joi.string().trim().max(50).optional().allow(null, '').messages({
            'string.max': 'Experience cannot exceed 50 characters'
        }),
        experienceMinYears: Joi.number().min(0).max(99.99).precision(2).optional().allow(null).messages({
            'number.min': 'Minimum experience cannot be negative',
            'number.max': 'Minimum experience cannot exceed 99.99 years'
        }),
        experienceMaxYears: Joi.number().min(0).max(99.99).precision(2).optional().allow(null).messages({
            'number.min': 'Maximum experience cannot be negative',
            'number.max': 'Maximum experience cannot exceed 99.99 years'
        }),
        overview: structuredContentSchema.optional().allow(null),
        responsibilities: structuredContentSchema.optional().allow(null),
        requiredSkills: structuredContentSchema.optional().allow(null),
        niceToHave: structuredContentSchema.optional().allow(null),
        techSpecifications: Joi.array().items(
            Joi.alternatives().try(
                Joi.string().trim(),
                Joi.object({
                    name: Joi.string().trim().required(),
                    id: Joi.any().optional()
                })
            )
        ).optional().allow(null).messages({
            'array.base': 'Technical specifications must be an array'
        })
    }).custom((value, helpers) => {
        if (value.experienceMinYears && value.experienceMaxYears) {
            if (value.experienceMinYears > value.experienceMaxYears) {
                return helpers.error('custom.experienceRange');
            }
        }
        return value;
    }).messages({
        'custom.experienceRange': 'Minimum experience cannot be greater than maximum experience'
    }),

    update: Joi.object({
        position: Joi.string().trim().min(2).max(100).optional().messages({
            'string.min': 'Position must be at least 2 characters long',
            'string.max': 'Position cannot exceed 100 characters'
        }),
        experience: Joi.string().trim().max(50).optional().allow(null, '').messages({
            'string.max': 'Experience cannot exceed 50 characters'
        }),
        experienceMinYears: Joi.number().min(0).max(99.99).precision(2).optional().allow(null).messages({
            'number.min': 'Minimum experience cannot be negative',
            'number.max': 'Minimum experience cannot exceed 99.99 years'
        }),
        experienceMaxYears: Joi.number().min(0).max(99.99).precision(2).optional().allow(null).messages({
            'number.min': 'Maximum experience cannot be negative',
            'number.max': 'Maximum experience cannot exceed 99.99 years'
        }),
        overview: structuredContentSchema.optional().allow(null),
        responsibilities: structuredContentSchema.optional().allow(null),
        requiredSkills: structuredContentSchema.optional().allow(null),
        niceToHave: structuredContentSchema.optional().allow(null),
        techSpecifications: Joi.array().items(
            Joi.alternatives().try(
                Joi.string().trim(),
                Joi.object({
                    name: Joi.string().trim().required(),
                    id: Joi.any().optional()
                })
            )
        ).optional().allow(null).messages({
            'array.base': 'Technical specifications must be an array'
        })
    }).min(1).custom((value, helpers) => {
        if (value.experienceMinYears !== undefined && value.experienceMaxYears !== undefined) {
            if (value.experienceMinYears > value.experienceMaxYears) {
                return helpers.error('custom.experienceRange');
            }
        }
        return value;
    }).messages({
        'object.min': 'At least one field must be provided for update',
        'custom.experienceRange': 'Minimum experience cannot be greater than maximum experience'
    }),

    params: Joi.object({
        id: Joi.number().integer().positive().required().messages({
            'number.base': 'Job profile ID must be a valid number',
            'number.positive': 'Job profile ID must be a positive number',
            'any.required': 'Job profile ID is required'
        })
    }),

    search: Joi.object({
        position: Joi.string().trim().optional(),
        experience: Joi.string().trim().optional(),
        minExperience: Joi.number().min(0).optional(),
        maxExperience: Joi.number().min(0).optional(),
        techSpecification: Joi.string().trim().optional(),
        limit: Joi.number().integer().min(1).max(1000).default(50).optional(),
        offset: Joi.number().integer().min(0).default(0).optional()
    }).custom((value, helpers) => {
        if (value.minExperience !== undefined && value.maxExperience !== undefined) {
            if (value.minExperience > value.maxExperience) {
                return helpers.error('custom.experienceRange');
            }
        }
        return value;
    }).messages({
        'custom.experienceRange': 'Minimum experience cannot be greater than maximum experience'
    })
};

class JobProfileValidator {
    static helper = null;

    static init(db) {
        JobProfileValidator.helper = new JobProfileValidatorHelper(db);
    }

    static async validateCreate(req, res, next) {
        try {
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

            // Transform structured content to text
            const transformedData = {
                jobRole: value.position,
                experienceText: value.experience || null,
                experienceMinYears: value.experienceMinYears || null,
                experienceMaxYears: value.experienceMaxYears || null,
                jobOverview: convertStructuredContentToText(value.overview),
                keyResponsibilities: convertStructuredContentToText(value.responsibilities),
                requiredSkillsText: convertStructuredContentToText(value.requiredSkills),
                niceToHave: convertStructuredContentToText(value.niceToHave)
            };

            // Validate and transform technical specifications
            if (value.techSpecifications && value.techSpecifications.length > 0) {
                transformedData.techSpecLookupIds = await JobProfileValidator.helper.validateTechSpecifications(
                    value.techSpecifications
                );
            }

            req.body = transformedData;
            next();
        } catch (error) {
            next(error);
        }
    }

    static async validateUpdate(req, res, next) {
        try {
            const { error: paramsError } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });
            const { error: bodyError, value } = jobProfileSchemas.update.validate(req.body, {
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

            // Transform structured content to text
            const transformedData = {};

            if (value.position !== undefined) {
                transformedData.jobRole = value.position;
            }
            if (value.experience !== undefined) {
                transformedData.experienceText = value.experience;
            }
            if (value.experienceMinYears !== undefined) {
                transformedData.experienceMinYears = value.experienceMinYears;
            }
            if (value.experienceMaxYears !== undefined) {
                transformedData.experienceMaxYears = value.experienceMaxYears;
            }
            if (value.overview !== undefined) {
                transformedData.jobOverview = convertStructuredContentToText(value.overview);
            }
            if (value.responsibilities !== undefined) {
                transformedData.keyResponsibilities = convertStructuredContentToText(value.responsibilities);
            }
            if (value.requiredSkills !== undefined) {
                transformedData.requiredSkillsText = convertStructuredContentToText(value.requiredSkills);
            }
            if (value.niceToHave !== undefined) {
                transformedData.niceToHave = convertStructuredContentToText(value.niceToHave);
            }

            // Validate and transform technical specifications
            if (value.techSpecifications !== undefined) {
                if (value.techSpecifications && value.techSpecifications.length > 0) {
                    transformedData.techSpecLookupIds = await JobProfileValidator.helper.validateTechSpecifications(
                        value.techSpecifications
                    );
                } else {
                    transformedData.techSpecLookupIds = [];
                }
            }

            req.body = transformedData;
            next();
        } catch (error) {
            next(error);
        }
    }

    static validateDelete(req, res, next) {
        try {
            const { error } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });

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
            const { error } = jobProfileSchemas.params.validate(req.params, { abortEarly: false });

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

            req.validatedSearch = value;
            next();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = JobProfileValidator;