const AppError = require('../utils/appError');

class OfferService {
    constructor(offerRepository, db) {
        this.offerRepository = offerRepository;
        this.db = db;
    }

    async createOffer(offerData, auditContext) {
        const client = await this.db.getConnection();
        try {
            const offer = await this.offerRepository.createOffer(offerData, client);
            return offer;
        } catch (error) {
            if (error instanceof AppError) throw error;
            console.error('Error creating offer:', error.stack);
            throw new AppError('Failed to create offer', 500, 'OFFER_CREATION_ERROR', { operation: 'createOffer' });
        } finally {
            client.release();
        }
    }

    async getOffers() {
        const client = await this.db.getConnection();
        try {
            const offers = await this.offerRepository.getOffers(client);
            return offers;
        } catch (error) {
            if (error instanceof AppError) throw error;
            console.error('Error fetching offers:', error.stack);
            throw new AppError('Failed to fetch offers', 500, 'OFFER_FETCH_ERROR', { operation: 'getOffers' });
        } finally {
            client.release();
        }
    }

    async getOfferFormData() {
        const client = await this.db.getConnection();
        try {
            return await this.offerRepository.getOfferFormData(client);
        } catch (error) {
            if (error instanceof AppError) throw error;
            console.error('Error fetching offer form data:', error.stack);
            throw new AppError('Failed to fetch offer form data', 500, 'OFFER_FORM_DATA_ERROR', { operation: 'getOfferFormData' });
        } finally {
            client.release();
        }
    }
}

module.exports = OfferService;
