const express = require('express');
const OfferController = require('../controllers/offerController');
const OfferService = require('../services/offerService');
const OfferRepository = require('../repositories/offerRepository');
const OfferValidator = require('../validators/offerValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const offerRepository = new OfferRepository(db);
const offerService = new OfferService(offerRepository, db);
const offerController = new OfferController(offerService);

router.use(authenticate);
router.use(auditContextMiddleware);

router.get('/form-data', offerController.getOfferFormData);

router.get('/deletions', offerController.getDeleted);

router.get('/', offerController.getOffers);

router.get('/:offerId/details', offerController.getOfferDetails);

router.delete('/:offerId', offerController.deleteOffer);

router.post('/:offerId/terminate', OfferValidator.validateTerminate, offerController.terminateOffer);

router.post('/:offerId/revise', OfferValidator.validateRevision, offerController.reviseOffer);

router.post('/:offerId/status', OfferValidator.validateStatusUpdate, offerController.updateOfferStatus);

router.post('/:candidateId', OfferValidator.validateCreate, offerController.createOffer);

module.exports = router;
