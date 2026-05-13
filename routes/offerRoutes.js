const express = require('express');
const multer  = require('multer');
const OfferController = require('../controllers/offerController');
const OfferService = require('../services/offerService');
const OfferRepository = require('../repositories/offerRepository');
const OfferValidator = require('../validators/offerValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per image
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') cb(null, true);
        else cb(new Error('Only JPEG and PNG images are accepted'));
    },
});

const attachmentFields = upload.fields([
    { name: 'professionalPhoto', maxCount: 1 },
    { name: 'aadhaarFront',      maxCount: 1 },
    { name: 'aadhaarBack',       maxCount: 1 },
    { name: 'aadharFront',       maxCount: 1 },
    { name: 'aadharBack',        maxCount: 1 },
    { name: 'panCard',           maxCount: 1 },
    { name: 'pancard',           maxCount: 1 },
]);

const router = express.Router();

const offerRepository = new OfferRepository(db);
const offerService = new OfferService(offerRepository, db);
const offerController = new OfferController(offerService);

router.use(authenticate);
router.use(auditContextMiddleware);

router.get('/form-data', offerController.getOfferFormData);
router.get('/by-candidate/:candidateId', offerController.getActiveOfferForCandidate);

router.get('/deletions', offerController.getDeleted);

router.get('/', offerController.getOffers);

router.get('/:offerId/details', offerController.getOfferDetails);

router.patch('/:offerId/restore', offerController.restoreOffer);
router.patch('/:offerId', OfferValidator.validateUpdate, offerController.updateOffer);

router.delete('/:offerId', offerController.deleteOffer);

router.post('/:offerId/terminate', OfferValidator.validateTerminate, offerController.terminateOffer);

router.post('/:offerId/revise', OfferValidator.validateRevision, offerController.reviseOffer);

router.post('/:offerId/status', OfferValidator.validateStatusUpdate, offerController.updateOfferStatus);

router.post('/:candidateId', OfferValidator.validateCreate, offerController.createOffer);

// Consultant identity document images (stored in S3, keys saved to offer table)
router.post('/:offerId/consultant-images', attachmentFields, offerController.uploadConsultantImages);
router.get('/:offerId/consultant-images/:field',              offerController.getConsultantImage);

// Document generation — must be placed after specific routes to avoid :candidateId conflicts
router.post('/:offerId/document/with-attachments',            attachmentFields, offerController.generateDocumentWithAttachments);
router.post('/:offerId/document/regenerate-with-attachments', attachmentFields, offerController.regenerateDocumentWithAttachments);
router.post('/:offerId/document', offerController.generateDocument);
router.post('/:offerId/document/regenerate', offerController.regenerateDocument);
router.get('/:offerId/document', offerController.getDocument);
router.get('/:offerId/document/download', offerController.downloadDocument);

module.exports = router;
