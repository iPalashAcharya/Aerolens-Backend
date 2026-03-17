const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class OfferService {
    constructor(offerRepository, db) {
        this.offerRepository = offerRepository;
        this.db = db;
    }

    async createOffer(offerData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const offer = await this.offerRepository.createOffer(offerData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: offer,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();
            return offer;
        } catch (error) {
            await client.rollback();
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

    async deleteOffer(offerId, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const offer = await this.offerRepository.getOfferById(offerId, client);
            if (!offer) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            const affectedRows = await this.offerRepository.softDeleteOffer(offerId, client);
            if (affectedRows === 0) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                oldValues: offer,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            console.error('Error deleting offer:', error.stack);
            throw new AppError('Failed to delete offer', 500, 'OFFER_DELETION_ERROR', { operation: 'deleteOffer', offerId });
        } finally {
            client.release();
        }
    }
}

module.exports = OfferService;
