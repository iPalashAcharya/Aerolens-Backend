const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class LookupService {
    constructor(lookupRepository, db) {
        this.db = db;
        this.lookupRepository = lookupRepository;
    }

    async getAll() {
        //const { limit = 10, page = 1 } = options || {};
        const client = await this.db.getConnection();
        try {
            const result = await this.lookupRepository.getAll(null, null, client);
            /*const totalPages = Math.ceil(result.totalRecords / limit);
            const pagination = {
                currentPage: page,
                totalPages,
                totalRecords: result.totalRecords,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page < totalPages ? page + 1 : null,
                prevPage: page > 1 ? page - 1 : null
            };*/
            return {
                data: result.data
                //pagination
            };
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Lookup Data', error.stack);
                throw new AppError(
                    'Failed to fetch lookup',
                    500,
                    'LOOKUP_FETCH_ERROR',
                    { operation: 'getAll' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getDeletedLookups() {
        const client = await this.db.getConnection();
        try {
            const result = await this.lookupRepository.getDeletedLookups(client);
            return { data: result.rows };
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Deleted Lookup Data', error.stack);
                throw new AppError(
                    'Failed to fetch deleted lookup',
                    500,
                    'LOOKUP_FETCH_ERROR',
                    { operation: 'getDeletedLookups' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getDataByTag(tag) {
        const client = await this.db.getConnection();
        try {
            const result = await this.lookupRepository.getByTag(tag, client);
            if (!result) {
                throw new AppError(
                    `Lookup entry with ${tag} not found`,
                    404,
                    'LOOKUP_ENTRY_NOT_FOUND'
                );
            }
            return result;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Lookup Data By Tag', error.stack);
                throw new AppError(
                    'Failed to fetch lookup data by tag',
                    500,
                    'LOOKUP_FETCH_ERROR',
                    { operation: 'getDataByTag', tag }
                );
            }
            throw error;
        } finally {
            client.release();
        }

    }

    async createLookup(lookupData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const exists = await this.lookupRepository.exists(
                lookupData.value,
                client
            );

            if (exists) {
                throw new AppError(
                    'A lookup with this value already exists',
                    409,
                    'DUPLICATE_LOOKUP_VALUE'
                );
            }

            const result = await this.lookupRepository.create(lookupData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                resource_type: 'lookup',
                resource_id: result?.lookupKey ?? null,
                newValues: result,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return result;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error creating Lookup entry:", error.stack);
            throw new AppError(
                "Failed to create lookup entry",
                500,
                "LOOKUP_CREATION_ERROR",
                { operation: "createLookup", lookupData: { value: lookupData.value } }
            );
        } finally {
            client.release();
        }
    }

    async updateLookup(lookupKey, lookupData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const existingLookup = await this.lookupRepository.getByKey(lookupKey, client);
            if (!existingLookup || !Array.isArray(existingLookup.data) || existingLookup.data.length === 0) {
                throw new AppError(
                    `Lookup with Key ${lookupKey} not found`,
                    404,
                    'LOOKUP_NOT_FOUND'
                );
            }

            if (lookupData.tag !== undefined) {
                throw new AppError("Tag cannot be updated", 400, "TAG_UPDATE_NOT_ALLOWED");
            }

            const updatedLookup = await this.lookupRepository.update(lookupKey, lookupData, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                resource_type: 'lookup',
                resource_id: lookupKey,
                entityType: 'lookup',
                entityId: lookupKey,
                oldValues: existingLookup,
                newValues: updatedLookup,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();

            return updatedLookup;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error updating Lookup entry:", error.stack);
            throw new AppError(
                "Failed to update lookup entry",
                500,
                "LOOKUP_UPDATE_ERROR",
                { operation: "updateLookup", lookupKey }
            );
        } finally {
            client.release();
        }
    }

    async getByKey(lookupKey) {
        const client = await this.db.getConnection();
        try {
            const lookupData = await this.lookupRepository.getByKey(lookupKey, client);

            if (!lookupData || !Array.isArray(lookupData.data) || lookupData.data.length === 0) {
                throw new AppError(
                    `Lookup Entry with Key ${lookupKey} not found`,
                    404,
                    "LOOKUP_NOT_FOUND",
                    {
                        lookupKey,
                        suggestion: "Please verify the Lookup Key and try again",
                        searchHint: "You can search for lookup entries using the list endpoint"
                    }
                );
            }
            return lookupData;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error fetching Lookup entry by key:", error.stack);
            throw new AppError(
                "Failed to fetch lookup entry by key",
                500,
                "LOOKUP_FETCH_ERROR",
                { operation: "getByKey", lookupKey }
            );
        } finally {
            client.release();
        }
    }

    async deleteLookup(lookupKey, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const lookup = await this.lookupRepository.getByKey(lookupKey, client);
            if (!lookup || !Array.isArray(lookup.data) || lookup.data.length === 0) {
                throw new AppError(
                    `Lookup Key with ${lookupKey} not found`,
                    404,
                    'LOOKUP_NOT_FOUND'
                );
            }
            const deleted = await this.lookupRepository.delete(lookupKey, client);

            if (!deleted) {
                throw new AppError(
                    `Lookup with lookup key ${lookupKey} not found`,
                    404,
                    "LOOKUP_NOT_FOUND",
                    {
                        lookupKey,
                        suggestion: "Please verify the lookup key and try again"
                    }
                );
            }
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                resource_type: 'lookup',
                resource_id: lookupKey,
                oldValues: lookup,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return {
                success: true,
                message: "Lookup entry deleted successfully",
                data: {
                    lookupKey,
                    deletedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error deleting lookup entry:", error.stack);
            throw new AppError(
                "Failed to delete lookup entry",
                500,
                "LOOKUP_DELETION_ERROR",
                { lookupKey, operation: "deleteLookup" }
            );
        }
    }

    async restoreLookup(lookupKey, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const restored = await this.lookupRepository.restore(lookupKey, client);
            if (!restored) {
                throw new AppError(`Lookup with key ${lookupKey} not found or not deleted`, 404, 'LOOKUP_NOT_FOUND');
            }
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'RESTORE',
                resource_type: 'lookup',
                resource_id: lookupKey,
                oldValues: { lookupKey },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();
            return { lookupKey };
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) throw error;
            throw new AppError('Failed to restore lookup', 500, 'DATABASE_ERROR', { lookupKey, operation: 'restoreLookup' });
        } finally {
            client.release();
        }
    }
}

module.exports = LookupService;
