const Joi = require('joi');
const AppError = require('../utils/appError');

const offerSchemas = {
    create: Joi.object({
        candidateId: Joi.number().integer().positive().required()
            .messages({ 'any.required': 'Candidate ID is required' }),
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
}

module.exports = OfferValidator;
