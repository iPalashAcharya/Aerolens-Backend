const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class OfferController {
    constructor(offerService) {
        this.offerService = offerService;
    }

    createOffer = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.candidateId, 10);
        const createdBy = req.auditContext.userId;
        const offer = await this.offerService.createOffer(
            { ...req.body, candidateId, createdBy },
            req.auditContext
        );
        return ApiResponse.success(res, offer, 'Offer created successfully', 201);
    });

    getOffers = catchAsync(async (req, res) => {
        const offers = await this.offerService.getOffers();
        return ApiResponse.success(res, offers, 'Offers retrieved successfully');
    });

    deleteOffer = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        await this.offerService.deleteOffer(offerId, req.auditContext);
        return ApiResponse.success(res, null, 'Offer deleted successfully');
    });

    terminateOffer = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const terminatedBy = req.auditContext.userId;
        const terminationData = {
            terminationDate: req.body.terminationDate,
            terminationReason: req.body.terminationReason,
            terminatedBy
        };
        await this.offerService.terminateOffer(offerId, terminationData, req.auditContext);
        return ApiResponse.success(res, null, 'Offer terminated successfully');
    });

    reviseOffer = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const revisedBy = req.auditContext.userId;
        const revisionData = {
            newCTC: req.body.newCTC,
            newJoiningDate: req.body.newJoiningDate,
            reason: req.body.reason,
            revisedBy
        };
        await this.offerService.reviseOffer(offerId, revisionData, req.auditContext);
        return ApiResponse.success(res, null, 'Offer revised successfully');
    });

    getOfferFormData = catchAsync(async (req, res) => {
        const formData = await this.offerService.getOfferFormData();
        res.status(200).json({
            success: true,
            message: 'Offer form data retrieved successfully',
            data: {
                employmentTypes: formData.employmentTypes,
                workModes: formData.workModes,
                currencies: formData.currencies,
                compensationTypes: formData.compensationTypes,
                vendors: formData.vendors,
                members: formData.members,
                jobProfileRequirements: formData.jobProfileRequirements
            }
        });
    });
}

module.exports = OfferController;
