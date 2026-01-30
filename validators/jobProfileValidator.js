const Joi = require('joi');
const AppError = require('../utils/appError');

const normalizeWhitespace = (text) => {
    if (!text) return null;

    return text
        .replace(/\r\n/g, '\n')                         // Normalize line endings
        .replace(/\r/g, '\n')
        .replace(/-\s*\n\s*/g, '-')                     // Fix hyphenation across lines
        .replace(/\b([A-Z])\s+([a-z])/g, '$1$2')        // Fix "W eb" → "Web"
        .replace(/(\w+)\s*-\s*(\w+)/g, '$1-$2')         // Fix "large - scale"
        .replace(/[ \t]+/g, ' ')                         // Collapse spaces
        .replace(/\n{3,}/g, '\n\n')                      // Max 2 newlines
        .replace(/ ?\n ?/g, '\n')                        // Trim newlines
        .trim();
};

// ENHANCED: Smart bullet point splitter that detects markers
const splitBulletPoints = (text) => {
    if (!text) return null;

    // Common bullet markers (Unicode and ASCII)
    const bulletMarkers = [
        '•',   // U+2022 Bullet
        '●',   // U+25CF Black Circle
        '○',   // U+25CB White Circle
        '■',   // U+25A0 Black Square
        '□',   // U+25A1 White Square
        '▪',   // U+25AA Black Small Square
        '▫',   // U+25AB White Small Square
        '‣',   // U+2023 Triangular Bullet
        '⁃',   // U+2043 Hyphen Bullet
        '◦',   // U+25E6 White Bullet
        '▸',   // U+25B8 Black Right-Pointing Small Triangle
        '▹',   // U+25B9 White Right-Pointing Small Triangle
        '→',   // U+2192 Rightwards Arrow
        '⇒',   // U+21D2 Rightwards Double Arrow
        '➔',   // U+2794 Heavy Wide-Headed Rightwards Arrow
        '➢',   // U+27A2 Three-D Top-Lighted Rightwards Arrowhead
        '➤',   // U+27A4 Black Rightwards Arrowhead
        '*',   // Asterisk
        '·',   // U+00B7 Middle Dot
        '+',   // Plus sign (common in markdown)
    ];

    // Check if text contains any bullet markers
    const hasBulletMarkers = bulletMarkers.some(marker => text.includes(marker));

    if (hasBulletMarkers) {
        // Escape special regex characters for each marker
        const escapedMarkers = bulletMarkers.map(m =>
            m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        );

        // Create pattern that matches bullet markers at start of line or after whitespace
        // This regex looks for:
        // - Start of string OR newline
        // - Optional whitespace
        // - One of the bullet markers
        // - Optional whitespace after the marker
        const markerPattern = escapedMarkers.join('|');
        const regex = new RegExp(
            `(?:^|\\n)\\s*(${markerPattern})\\s*`,
            'gm'
        );

        // Split on bullet markers and clean up
        const bullets = text
            .split(regex)
            .filter(part => {
                // Filter out empty strings and the captured bullet markers themselves
                const trimmed = part.trim();
                return trimmed.length > 0 && !bulletMarkers.includes(trimmed);
            })
            .map(line => {
                // Normalize whitespace within each bullet point
                // Replace multiple spaces/tabs with single space
                // Replace multiple newlines within a bullet with single space
                return line
                    .replace(/\s+/g, ' ')  // Collapse all whitespace to single space
                    .trim();
            })
            .filter(line => line.length > 0);

        return bullets.join('\n');
    }

    // Fallback: No markers found
    // Try to intelligently split on newlines
    // Consider a line as a new bullet if it's not just a continuation
    const lines = text.split('\n');
    const bullets = [];
    let currentBullet = '';

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            // Empty line - if we have a current bullet, save it
            if (currentBullet) {
                bullets.push(currentBullet.trim());
                currentBullet = '';
            }
            continue;
        }

        // Check if this looks like a new bullet point
        // Heuristic: starts with capital letter or number, or previous bullet seems complete
        const looksLikeNewBullet =
            /^[A-Z0-9]/.test(trimmed) && // Starts with capital or number
            currentBullet && // We have a previous bullet
            (
                /[.!?]$/.test(currentBullet.trim()) || // Previous ends with punctuation
                currentBullet.split(' ').length > 5 // Previous has substantial content
            );

        if (looksLikeNewBullet) {
            bullets.push(currentBullet.trim());
            currentBullet = trimmed;
        } else {
            // Continuation of current bullet
            currentBullet += (currentBullet ? ' ' : '') + trimmed;
        }
    }

    // Don't forget the last bullet
    if (currentBullet) {
        bullets.push(currentBullet.trim());
    }

    // If we couldn't intelligently split, just join all non-empty lines
    if (bullets.length === 0) {
        return lines
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .join('\n');
    }

    return bullets.join('\n');
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

    // Handle single object with type 'bullets'
    if (content.type === 'bullets' && Array.isArray(content.content)) {
        result = content.content
            .map(item => {
                if (!item.text) return null;

                // Check if this single text field contains multiple bullets
                // (embedded newlines OR bullet markers present)
                const hasEmbeddedNewlines = item.text.includes('\n');
                const hasBulletMarkers = /[•●○■□▪▫‣⁃◦▸▹→⇒➔➢➤\*\·\+\-]/.test(item.text);

                if (hasEmbeddedNewlines || hasBulletMarkers) {
                    // Split into separate bullet points
                    return splitBulletPoints(item.text);
                }

                // Single bullet point - just normalize whitespace
                return normalizeWhitespace(item.text);
            })
            .filter(Boolean)
            .join('\n');
    }

    // Handle single object with type 'paragraph'
    else if (content.type === 'paragraph' && Array.isArray(content.content)) {
        result = content.content
            .map(item => {
                if (!item.text) return null;

                // For paragraphs, preserve natural line breaks but normalize spacing
                return item.text
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean)
                    .join('\n');
            })
            .filter(Boolean)
            .join('\n\n'); // Double newline between paragraph blocks
    }

    // Handle array of objects (mixed types)
    else if (Array.isArray(content)) {
        result = content
            .map(item => {
                if (item.type === 'paragraph' && Array.isArray(item.content)) {
                    return item.content
                        .map(c => {
                            if (!c.text) return null;
                            return c.text
                                .split('\n')
                                .map(line => line.trim())
                                .filter(Boolean)
                                .join('\n');
                        })
                        .filter(Boolean)
                        .join('\n\n');
                }

                if (item.type === 'bullets' && Array.isArray(item.content)) {
                    return item.content
                        .map(c => {
                            if (!c.text) return null;

                            // Handle embedded newlines or bullet markers
                            const hasEmbeddedNewlines = c.text.includes('\n');
                            const hasBulletMarkers = /[•●○■□▪▫‣⁃◦▸▹→⇒➔➢➤\*\·\+\-]/.test(c.text);

                            if (hasEmbeddedNewlines || hasBulletMarkers) {
                                return splitBulletPoints(c.text);
                            }

                            return normalizeWhitespace(c.text);
                        })
                        .filter(Boolean)
                        .join('\n');
                }

                return normalizeWhitespace(item.text) || '';
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

    async validateTechSpecifications(techSpecIds, client = null) {
        if (!techSpecIds || !Array.isArray(techSpecIds) || techSpecIds.length === 0) {
            return [];
        }

        this._resetCacheIfNeeded();
        const connection = client || await this.db.getConnection();

        try {
            const validatedSpecs = [];

            for (const specId of techSpecIds) {
                if (!specId) continue;

                const cacheKey = `id_${specId}`;

                if (this.techSpecCache.has(cacheKey)) {
                    validatedSpecs.push(this.techSpecCache.get(cacheKey));
                    continue;
                }

                const query = `
                    SELECT lookupKey 
                    FROM lookup 
                    WHERE lookupKey = ? AND tag = 'techSpecification'
                `;
                const [rows] = await connection.execute(query, [specId]);

                if (rows.length === 0) {
                    throw new AppError(
                        `Invalid technical specification ID: '${specId}'. Technical specification does not exist.`,
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
            Joi.number().integer().positive()
        ).optional().allow(null).messages({
            'array.base': 'Technical specifications must be an array',
            'number.base': 'Technical specification IDs must be numbers',
            'number.integer': 'Technical specification IDs must be integers',
            'number.positive': 'Technical specification IDs must be positive'
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
            Joi.number().integer().positive()
        ).optional().allow(null).messages({
            'array.base': 'Technical specifications must be an array',
            'number.base': 'Technical specification IDs must be numbers',
            'number.integer': 'Technical specification IDs must be integers',
            'number.positive': 'Technical specification IDs must be positive'
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
            // Handle comma-separated string from frontend
            if (req.body.techSpecifications && typeof req.body.techSpecifications === 'string') {
                let techSpecString = req.body.techSpecifications.trim();
                if ((techSpecString.startsWith('"') && techSpecString.endsWith('"')) ||
                    (techSpecString.startsWith("'") && techSpecString.endsWith("'"))) {
                    techSpecString = techSpecString.slice(1, -1);
                }
                req.body.techSpecifications = techSpecString
                    .split(',')
                    .map(id => parseInt(id.trim(), 10))
                    .filter(id => !isNaN(id) && id > 0);
            }

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
            // Handle comma-separated string from frontend
            if (req.body.techSpecifications && typeof req.body.techSpecifications === 'string') {
                console.log('=== TECH SPEC DEBUG ===');
                console.log('Raw techSpecifications:', req.body.techSpecifications);
                let techSpecString = req.body.techSpecifications.trim();
                if ((techSpecString.startsWith('"') && techSpecString.endsWith('"')) ||
                    (techSpecString.startsWith("'") && techSpecString.endsWith("'"))) {
                    techSpecString = techSpecString.slice(1, -1);
                }
                req.body.techSpecifications = techSpecString
                    .split(',')
                    .map(id => parseInt(id.trim(), 10))
                    .filter(id => !isNaN(id) && id > 0);
                console.log('Parsed techSpecifications:', req.body.techSpecifications);
                console.log('======================');
            }

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