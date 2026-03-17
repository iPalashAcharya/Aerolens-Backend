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
        offeredCTCAmount: Joi.number().min(0).optional().allow(null),
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
        newCTC: Joi.number().min(0).required()
            .messages({ 'any.required': 'New CTC is required' }),
        newJoiningDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                'string.pattern.base': 'New joining date must be YYYY-MM-DD',
                'any.required': 'New joining date is required'
            }),
        reason: Joi.string().trim().required()
            .messages({ 'any.required': 'Reason is required' })
    }),
    statusUpdate: Joi.object({
        status: Joi.string().valid('ACCEPTED', 'REJECTED').required()
            .messages({
                'any.only': 'Status must be ACCEPTED or REJECTED',
                'any.required': 'Status is required'
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
