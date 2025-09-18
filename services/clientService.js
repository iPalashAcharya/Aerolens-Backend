const GeocodingService = require('./geocodingService');
const AppError = require('../utils/appError');

class ClientService {
    constructor(clientRepository, db) {
        this.db = db;
        this.clientRepository = clientRepository;
        this.geocodingService = new GeocodingService();
    }

    async getAllClients(options = {}) {
        const { limit = 10, page = 1 } = options;
        //const totalPages = Math.ceil(result.totalRecords / limit);

        /*return {
            success: true,
            data: result.data,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords: result.totalRecords,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page < totalPages ? page + 1 : null,
                prevPage: page > 1 ? page - 1 : null
            }
        };*/
        return await this.clientRepository.getAll(limit, page);;
    }

    async getClientById(clientId) {
        const clientData = await this.clientRepository.getById(clientId);

        if (!clientData) {
            throw new AppError(
                `Client with ID ${clientId} not found`,
                404,
                "CLIENT_NOT_FOUND",
                {
                    clientId,
                    suggestion: "Please verify the client ID and try again",
                    searchHint: "You can search for clients using the list endpoint"
                }
            );
        }
        return clientData;
    }

    async createClient(clientData) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            let location;
            try {
                location = await this.geocodingService.geocodeAddressWithFallback(clientData.address);
                console.log('Geocoded location:', location);
            } catch (geocodeError) {
                console.error('Geocoding failed:', geocodeError.message);
                throw new AppError(
                    "Unable to find location for the provided address",
                    422,
                    "GEOCODING_ERROR",
                    {
                        address: clientData.address,
                        geocodeError: geocodeError.message,
                        suggestion: "Please verify the address format and try again"
                    }
                );
            }

            const exists = await this.clientRepository.existsByName(
                clientData.name,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A client with this name already exists',
                    409,
                    'DUPLICATE_CLIENT_NAME'
                );
            }

            const result = await this.clientRepository.create(clientData, location);
            await client.commit();

            return result;
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error creating client:", error.stack);
            throw new AppError(
                "Failed to create client",
                500,
                "CLIENT_CREATION_ERROR",
                { operation: "createClient", clientData: { name: clientData.name } }
            );
        } finally {
            client.release();
        }
    }

    async updateClient(clientId, updateData) {
        try {
            const existingClient = await this.clientRepository.exists(clientId);
            if (!existingClient) {
                throw new AppError(
                    `Client with ID ${clientId} does not exist`,
                    404,
                    "CLIENT_NOT_FOUND",
                    {
                        clientId,
                        suggestion: "Please verify the client ID and try again"
                    }
                );
            }

            const name = updateData.name || existingClient.clientName;
            const address = updateData.address || existingClient.address;
            const finalUpdateData = { name, address };

            let location = null;

            if (updateData.address && updateData.address !== existingClient.address) {
                console.log('Address changed, geocoding new address:', updateData.address);

                try {
                    location = await this.geocodingService.geocodeAddressWithFallback(address);
                    console.log('Geocoded location:', location);
                } catch (geocodeError) {
                    console.error('Geocoding failed for updated address:', geocodeError.message);
                    throw new AppError(
                        "Unable to find location for the new address",
                        422,
                        "GEOCODING_ERROR",
                        {
                            newAddress: address,
                            oldAddress: existingClient.address,
                            geocodeError: geocodeError.message,
                            suggestion: "Please verify the new address format or keep the existing address"
                        }
                    );
                }
            } else {
                console.log('Address unchanged, keeping existing location');
            }

            const result = await this.clientRepository.update(clientId, finalUpdateData, location);

            if (!result) {
                throw new AppError(
                    "No changes were made to the client record",
                    404,
                    "UPDATE_FAILED",
                    {
                        clientId,
                        reason: "Client may have been deleted by another process"
                    }
                );
            }

            return await this.clientRepository.getById(clientId);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error updating client:", error.stack);
            throw new AppError(
                "Failed to update client",
                500,
                "CLIENT_UPDATE_ERROR",
                { clientId, operation: "updateClient" }
            );
        }
    }

    async deleteClient(clientId) {
        try {
            const client = await this.clientRepository.getById(clientId);
            if (!client) {
                throw new AppError(
                    `Client with ID ${clientId} not found`,
                    404,
                    'CLIENT_NOT_FOUND'
                );
            }
            const deleted = await this.clientRepository.delete(clientId);

            if (!deleted) {
                throw new AppError(
                    `Client with ID ${clientId} not found`,
                    404,
                    "CLIENT_NOT_FOUND",
                    {
                        clientId,
                        suggestion: "Please verify the client ID and try again"
                    }
                );
            }

            return {
                success: true,
                message: "Client details deleted successfully",
                data: {
                    clientId,
                    deletedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error deleting client:", error.stack);
            throw new AppError(
                "Failed to delete client",
                500,
                "CLIENT_DELETION_ERROR",
                { clientId, operation: "deleteClient" }
            );
        }
    }
}

module.exports = ClientService;
