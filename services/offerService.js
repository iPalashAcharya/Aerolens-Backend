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

    async terminateOffer(offerId, terminationData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const offer = await this.offerRepository.getOfferById(offerId, client);
            if (!offer) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            await this.offerRepository.terminateOffer(offerId, terminationData, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'TERMINATE',
                newValues: {
                    entityType: 'OFFER',
                    entityId: offerId,
                    description: 'Offer terminated',
                    terminationDate: terminationData.terminationDate,
                    terminationReason: terminationData.terminationReason
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            console.error('Error terminating offer:', error.stack);
            throw new AppError('Failed to terminate offer', 500, 'OFFER_TERMINATION_ERROR', { operation: 'terminateOffer', offerId });
        } finally {
            client.release();
        }
    }

    async reviseOffer(offerId, revisionData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const offer = await this.offerRepository.getOfferById(offerId, client);
            if (!offer) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            const fullRevisionData = {
                previousCTC: offer.offeredCTCAmount,
                previousJoiningDate: offer.joiningDate,
                newCTC: revisionData.newCTC,
                newJoiningDate: revisionData.newJoiningDate,
                reason: revisionData.reason,
                revisedBy: auditContext.userId
            };

            const affectedRows = await this.offerRepository.reviseOffer(offerId, fullRevisionData, client);
            if (affectedRows === 0) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'REVISE',
                newValues: {
                    entityType: 'OFFER',
                    entityId: offerId,
                    description: 'Offer revised',
                    newCTC: revisionData.newCTC,
                    newJoiningDate: revisionData.newJoiningDate,
                    reason: revisionData.reason,
                    offerVersion: (offer.offerVersion || 0) + 1
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            console.error('Error revising offer:', error.stack);
            throw new AppError('Failed to revise offer', 500, 'OFFER_REVISION_ERROR', { operation: 'reviseOffer', offerId });
        } finally {
            client.release();
        }
    }

    async updateOfferStatus(offerId, statusData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const offer = await this.offerRepository.getOfferById(offerId, client);
            if (!offer) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            const fullStatusData = {
                offerId,
                status: statusData.status,
                rejectionReason: statusData.rejectionReason ?? null,
                updatedBy: auditContext.userId
            };

            await this.offerRepository.insertOfferStatus(fullStatusData, client);

            const affectedRows = await this.offerRepository.updateOfferStatus(offerId, statusData.status, client);
            if (affectedRows === 0) {
                throw new AppError('Offer not found or already deleted', 404, 'OFFER_NOT_FOUND');
            }

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'STATUS_UPDATE',
                newValues: {
                    entityType: 'OFFER',
                    entityId: offerId,
                    description: 'Offer status updated',
                    status: statusData.status,
                    rejectionReason: statusData.rejectionReason ?? null
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            console.error('Error updating offer status:', error.stack);
            throw new AppError('Failed to update offer status', 500, 'OFFER_STATUS_UPDATE_ERROR', { operation: 'updateOfferStatus', offerId });
        } finally {
            client.release();
        }
    }
}

module.exports = OfferService;
