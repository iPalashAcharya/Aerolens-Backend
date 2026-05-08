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

    getDeleted = catchAsync(async (req, res) => {
        const result = await this.offerService.getDeletedOffers();
        return ApiResponse.success(res, result.data, 'Deleted offers retrieved successfully');
    });

    getOffers = catchAsync(async (req, res) => {
        const offers = await this.offerService.getOffers();
        return ApiResponse.success(res, offers, 'Offers retrieved successfully');
    });

    getOfferDetails = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const data = await this.offerService.getOfferDetails(offerId);
        return ApiResponse.success(res, data, 'Offer details retrieved successfully');
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

    updateOfferStatus = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const statusData = {
            status: req.body.status,
            decisionDate: req.body.decisionDate,
            signedOfferLetterReceived: req.body.signedOfferLetterReceived,
            signedServiceAgreementReceived: req.body.signedServiceAgreementReceived,
            signedNDAReceived: req.body.signedNDAReceived,
            signedCodeOfConductReceived: req.body.signedCodeOfConductReceived,
            rejectionReason: req.body.rejectionReason ?? null
        };
        await this.offerService.updateOfferStatus(offerId, statusData, req.auditContext);
        return ApiResponse.success(res, null, 'Offer status updated successfully');
    });

    updateOffer = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const updated = await this.offerService.updateOffer(offerId, req.body, req.auditContext);
        return ApiResponse.success(res, updated, 'Offer updated successfully');
    });

    getActiveOfferForCandidate = catchAsync(async (req, res) => {
        const candidateId = parseInt(req.params.candidateId, 10);
        const offer = await this.offerService.getActiveOfferForCandidate(candidateId);
        return ApiResponse.success(res, offer ?? null, 'Active offer retrieved');
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

    restoreOffer = catchAsync(async (req, res) => {
        const result = await this.offerService.restoreOffer(parseInt(req.params.offerId), req.auditContext);
        return ApiResponse.success(res, result, 'Offer restored successfully');
    });

    generateDocument = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const generatedBy = req.auditContext.userId;
        const doc = await this.offerService.generateDocument(offerId, generatedBy);
        return ApiResponse.success(res, doc, 'Document generated successfully', 201);
    });

    regenerateDocument = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const generatedBy = req.auditContext.userId;
        const doc = await this.offerService.regenerateDocument(offerId, generatedBy);
        return ApiResponse.success(res, doc, 'Document regenerated successfully');
    });

    getDocument = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        const doc = await this.offerService.getDocument(offerId);
        return ApiResponse.success(res, doc ?? null, 'Document info retrieved');
    });

    downloadDocument = catchAsync(async (req, res) => {
        const offerId = parseInt(req.params.offerId, 10);
        await this.offerService.streamDocument(offerId, res);
    });
}

module.exports = OfferController;
