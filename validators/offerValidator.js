const Joi = require('joi');
const AppError = require('../utils/appError');

const offerSchemas = {
    create: Joi.object({
        jobProfileRequirementId: Joi.number().integer().positive().required()
            .messages({ 'any.required': 'Job profile requirement ID is required' }),
        vendorId: Joi.number().integer().positive().optional().allow(null),
        reportingManagerId: Joi.number().integer().positive().required()
            .messages({ 'any.required': 'Reporting manager ID is required' }),
        employmentTypeLookupId: Joi.number().integer().positive().required()
            .messages({ 'any.required': 'Employment type is required' }),
        workModelLookupId: Joi.number().integer().positive().required()
            .messages({ 'any.required': 'Work model is required' }),
        joiningDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                'string.pattern.base': 'Joining date must be YYYY-MM-DD',
                'any.required': 'Joining date is required'
            }),
        sign_before_date: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .allow(null, '')
            .messages({ 'string.pattern.base': 'Sign before date must be YYYY-MM-DD' }),
        offeredCTCAmount: Joi.number().min(1).optional().allow(null),
        currencyLookupId: Joi.number().integer().positive().optional().allow(null),
        compensationTypeLookupId: Joi.number().integer().positive().optional().allow(null),
        variablePay: Joi.number().min(0).optional().allow(null),
        joiningBonus: Joi.number().min(0).optional().allow(null),
        offerLetterSent: Joi.boolean().optional().allow(null),
        serviceAgreementSent: Joi.boolean().optional().allow(null),
        ndaSent: Joi.boolean().required()
            .messages({ 'any.required': 'NDA sent is required' }),
        codeOfConductSent: Joi.boolean().required()
            .messages({ 'any.required': 'Code of conduct sent is required' })
    }),
    terminate: Joi.object({
        terminationDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                'string.pattern.base': 'Termination date must be YYYY-MM-DD',
                'any.required': 'Termination date is required'
            }),
        terminationReason: Joi.string().trim().required()
            .messages({ 'any.required': 'Termination reason is required' })
    }),
    revision: Joi.object({
        newCTC: Joi.number().min(1).optional().allow(null),
        newJoiningDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .allow(null, '')
            .messages({
                'string.pattern.base': 'New joining date must be YYYY-MM-DD'
            }),
        reason: Joi.string().trim().required()
            .messages({ 'any.required': 'Reason is required' })
    })
        .custom((value, helpers) => {
            const hasNewCTC = value.newCTC !== undefined && value.newCTC !== null;
            const hasNewJoiningDate = value.newJoiningDate !== undefined && value.newJoiningDate !== null && String(value.newJoiningDate).trim() !== '';
            if (!hasNewCTC && !hasNewJoiningDate) {
                return helpers.error('custom.revisionRequiresAtLeastOne');
            }
            return value;
        })
        .messages({
            'custom.revisionRequiresAtLeastOne': 'At least one of newCTC or newJoiningDate is required (reason alone is not enough)'
        }),
    statusUpdate: Joi.object({
        status: Joi.string().valid('ACCEPTED', 'REJECTED').required()
            .messages({
                'any.only': 'Status must be ACCEPTED or REJECTED',
                'any.required': 'Status is required'
            }),
        decisionDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                'string.pattern.base': 'Decision date must be YYYY-MM-DD',
                'any.required': 'Decision date is required'
            }),
        signedOfferLetterReceived: Joi.boolean().optional().allow(null),
        signedServiceAgreementReceived: Joi.boolean().optional().allow(null),
        signedNDAReceived: Joi.boolean()
            .when('status', {
                is: 'ACCEPTED',
                then: Joi.required().messages({ 'any.required': 'Signed NDA received is required when status is ACCEPTED' }),
                otherwise: Joi.optional().allow(null)
            }),
        signedCodeOfConductReceived: Joi.boolean()
            .when('status', {
                is: 'ACCEPTED',
                then: Joi.required().messages({ 'any.required': 'Signed code of conduct received is required when status is ACCEPTED' }),
                otherwise: Joi.optional().allow(null)
            }),
        rejectionReason: Joi.string().trim()
            .when('status', {
                is: 'REJECTED',
                then: Joi.required().messages({ 'any.required': 'Rejection reason is required when status is REJECTED' }),
                otherwise: Joi.optional().allow(null, '')
            })
    })
};

class OfferValidator {
    static validateCreate(req, res, next) {
        const { value, error } = offerSchemas.create.validate(req.body, {
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

    static validateTerminate(req, res, next) {
        const { value, error } = offerSchemas.terminate.validate(req.body, {
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

    static validateRevision(req, res, next) {
        const { value, error } = offerSchemas.revision.validate(req.body, {
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

    static validateStatusUpdate(req, res, next) {
        const { value, error } = offerSchemas.statusUpdate.validate(req.body, {
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
}

module.exports = OfferValidator;
