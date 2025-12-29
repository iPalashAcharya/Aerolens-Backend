const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class VendorService {
    constructor(vendorRepository, db) {
        this.vendorRepository = vendorRepository;
        this.db = db;
    }

    async getAllVendors() {
        const client = await this.db.getConnection();
        try {
            return await this.vendorRepository.getAll(client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Vendors', error.stack);
                throw new AppError(
                    'Failed to fetch all Vendors',
                    500,
                    'DATABASE_ERROR',
                    { operation: 'getAllVendors' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async createVendor(vendorData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const normalize = v => (v === '' ? null : v);

            vendorData.vendorPhone = normalize(vendorData.vendorPhone);
            vendorData.vendorEmail = normalize(vendorData.vendorEmail);

            const exists = await this.vendorRepository.exists(
                vendorData.vendorPhone,
                vendorData.vendorEmail,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A vendor with this phone or email already exists',
                    409,
                    'VENDOR_DUPLICATE'
                );
            }

            const vendor = await this.vendorRepository.create(vendorData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: vendor,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return vendor;
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error creating Vendor', error.stack);
                throw new AppError(
                    'Failed to create Vendor',
                    500,
                    'DATABASE_ERROR',
                    { operation: 'createVendor', vendorData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getVendorById(vendorId) {
        const client = await this.db.getConnection();
        try {
            const vendor = await this.vendorRepository.findById(vendorId, client);

            if (!vendor) {
                throw new AppError(
                    `Vendor with ID ${vendorId} not found`,
                    404,
                    'VENDOR_NOT_FOUND'
                );
            }

            return vendor;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Vendor with ID', error.stack);
                throw new AppError(
                    'Failed to FETCH Vendor',
                    500,
                    'DATABASE_ERROR',
                    { operation: 'getVendorById' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async updateVendor(vendorId, updateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingVendor = await this.vendorRepository.findById(vendorId, client);
            if (!existingVendor) {
                throw new AppError(
                    `Vendor with ID ${vendorId} not found`,
                    404,
                    'VENDOR_NOT_FOUND'
                );
            }

            const normalize = v => (v === '' ? null : v);

            if ('vendorName' in updateData) {
                updateData.vendorName = updateData.vendorName?.trim();
            }

            if ('vendorPhone' in updateData) {
                updateData.vendorPhone = normalize(updateData.vendorPhone);
            }

            if ('vendorEmail' in updateData) {
                updateData.vendorEmail = normalize(updateData.vendorEmail);
            }

            const allowedFields = ['vendorName', 'vendorPhone', 'vendorEmail'];

            updateData = Object.fromEntries(
                Object.entries(updateData).filter(([key]) =>
                    allowedFields.includes(key)
                )
            );

            if (Object.keys(updateData).length === 0) {
                throw new AppError(
                    'No valid fields provided for update',
                    400,
                    'INVALID_UPDATE_FIELDS'
                );
            }

            if (updateData.vendorPhone || updateData.vendorEmail) {
                const exists = await this.vendorRepository.exists(
                    updateData.vendorPhone,
                    updateData.vendorEmail,
                    vendorId,
                    client
                );

                if (exists) {
                    throw new AppError(
                        'Vendor phone or email already exists',
                        409,
                        'VENDOR_DUPLICATE'
                    );
                }
            }

            await this.vendorRepository.update(vendorId, updateData, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                oldValues: existingVendor,
                newValues: updateData,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return await this.vendorRepository.findById(vendorId, client);

        } catch (error) {
            await client.rollback();

            if (!(error instanceof AppError)) {
                console.error('Error updating Vendor', error.stack);
                throw new AppError(
                    'Failed to update Vendor',
                    500,
                    'DATABASE_ERROR',
                    { operation: 'updateVendor', updateData }
                );
            }

            throw error;
        } finally {
            client.release();
        }
    }

    async deleteVendor(vendorId, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const vendor = await this.vendorRepository.findById(vendorId, client);
            if (!vendor) {
                throw new AppError(
                    `Vendor with ID ${vendorId} not found`,
                    404,
                    'VENDOR_NOT_FOUND'
                );
            }

            await this.vendorRepository.delete(vendorId, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return { deletedVendor: vendor };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error deleting Vendor', error.stack);
                throw new AppError(
                    'Failed to delete Vendor',
                    500,
                    'DATABASE_ERROR',
                    { vendorId, operation: 'deleteVendor' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = VendorService;