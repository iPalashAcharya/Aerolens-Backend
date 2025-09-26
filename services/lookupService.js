const AppError = require('../utils/appError');

class LookupService {
    constructor(lookupRepository, db) {
        this.db = db;
        this.lookupRepository = lookupRepository;
    }

    async getAll(options = {}) {
        const { limit = 10, page = 1 } = options;
        const result = await this.lookupRepository.getAll(limit, page);
        const totalPages = Math.ceil(result.totalRecords / limit);
        const pagination = {
            currentPage: page,
            totalPages,
            totalRecords: result.totalRecords,
            limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null
        };
        return {
            data: result.data,
            pagination
        };
    }

    async getDataByTag(tag) {
        const result = await this.lookupRepository.getByTag(tag);
        if (!result) {
            throw new AppError(
                `Lookup entry with ${tag} not found`,
                404,
                'LOOKUP_ENTRY_NOT_FOUND'
            );
        }
        return result;
    }

    async createLookup(lookupData) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const exists = await this.lookupRepository.exists(
                lookupData.value,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A lookup with this value already exists',
                    409,
                    'DUPLICATE_LOOKUP_VALUE'
                );
            }

            const result = await this.lookupRepository.create(lookupData);
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

    async getByKey(lookupKey) {
        const lookupData = await this.lookupRepository.getByKey(lookupKey);

        if (!lookupData) {
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
    }

    async deleteLookup(lookupKey) {
        try {
            const lookup = await this.lookupRepository.getByKey(lookupKey);
            if (!lookup) {
                throw new AppError(
                    `Lookup Key with ${lookupKey} not found`,
                    404,
                    'LOOKUP_NOT_FOUND'
                );
            }
            const deleted = await this.lookupRepository.delete(lookupKey);

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

            return {
                success: true,
                message: "Lookup entry deleted successfully",
                data: {
                    lookupKey,
                    deletedAt: new Date().toISOString()
                }
            };
        } catch (error) {
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
}

module.exports = LookupService;