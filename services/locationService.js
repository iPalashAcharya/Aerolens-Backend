const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class LocationService {
    constructor(locationRepository, db) {
        this.db = db;
        this.locationRepository = locationRepository;
    }

    async getLocationById(locationId) {
        const client = await this.db.getConnection();
        try {
            const location = await this.locationRepository.getById(locationId, client);

            if (!location) {
                throw new AppError(
                    `Location with ID ${locationId} not found`,
                    404,
                    'LOCATION_ID_NOT_FOUND'
                );
            }

            return location;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Location By ID', error.stack);
                throw new AppError(
                    'Failed to fetch location',
                    500,
                    'LOCATION_FETCH_ERROR',
                    { operation: 'getLocationById', locationId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getLocation() {
        const client = await this.db.getConnection();
        try {
            return await this.locationRepository.getAll(client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Every Location', error.stack);
                throw new AppError(
                    'Failed to fetch every Location',
                    500,
                    'LOCATION_FETCH_ERROR',
                    { operation: 'getLocation' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async createLocation(locationData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const exists = await this.locationRepository.exists(
                locationData.city,
                client
            );

            if (exists) {
                throw new AppError(
                    'A location with this city name already exists',
                    409,
                    'DUPLICATE_LOCATION_VALUE'
                );
            }

            const result = await this.locationRepository.create(locationData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
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

            console.error("Error creating Location entry:", error.stack);
            throw new AppError(
                "Failed to create Location entry",
                500,
                "LOCATION_CREATION_ERROR",
                { operation: "createLocation", locationData: { city: locationData.city, country: locationData.country } }
            );
        } finally {
            client.release();
        }
    }

    async updateLocation(locationId, updateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingLocation = await this.locationRepository.getById(locationId, client);
            if (!existingLocation) {
                throw new AppError(
                    `Location with ID ${locationId} does not exist`,
                    404,
                    "LOCATION_NOT_FOUND",
                    {
                        locationId,
                        suggestion: "Please verify the Location Id and try again"
                    }
                );
            }

            const updatedLocation = await this.locationRepository.update(
                locationId,
                updateData,
                client
            );

            if (auditContext) {
                await auditLogService.logAction({
                    userId: auditContext.userId,
                    action: 'UPDATE',
                    previousValues: existingLocation,
                    newValues: updatedLocation,
                    ipAddress: auditContext.ipAddress,
                    userAgent: auditContext.userAgent,
                    timestamp: auditContext.timestamp
                }, client);
            }
            await client.commit();

            return updatedLocation;

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error updating Location", error.stack);
            throw new AppError(
                "Failed to update Location",
                500,
                "LOCATION_UPDATE_ERROR",
                { operation: "updateLocation", locationId }
            );
        } finally {
            client.release();
        }
    }

    async deleteLocation(locationId, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const location = await this.locationRepository.getById(locationId, client);
            if (!location) {
                throw new AppError(
                    `Location with ID ${locationId} not found`,
                    404,
                    'LOCATION_NOT_FOUND'
                );
            }

            await this.locationRepository.delete(locationId, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return { deletedLocation: location };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Location', error.stack);
                throw new AppError(
                    'Failed to Delete Location',
                    500,
                    'LOCATION_DELETE_ERROR',
                    { operation: 'deleteLocation', locationId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = LocationService;