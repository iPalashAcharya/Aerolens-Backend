const GeocodingService = require('./geocodingService2');
const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class ClientService {
    constructor(clientRepository, db) {
        this.db = db;
        this.clientRepository = clientRepository;
        this.geocodingService = new GeocodingService();
    }

    async getAllClients(options = {}) {
        const client = await this.db.getConnection();
        try {
            //const { limit = 10, page = 1 } = options;
            const result = await this.clientRepository.getAll(null, null, client);
            //const totalPages = Math.ceil(result.totalRecords / limit);
            /*const pagination = {
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
                data: result
                //pagination
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching clients:", error.stack);
            throw new AppError(
                "Failed to Fetch clients",
                500,
                "CLIENT_FETCH_ERROR",
                { operation: "getAllCLients" }
            );
        } finally {
            client.release();
        }

    }

    async getAllClientsWithDepartment() {
        const client = await this.db.getConnection();
        try {
            return await this.clientRepository.getAllWithDepartments(client);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching clients:", error.stack);
            throw new AppError(
                "Failed to Fetch clients with departments",
                500,
                "CLIENT_FETCH_ERROR",
                { operation: "getAllCLientsWithDepartment" }
            );
        } finally {
            client.release();
        }

    }

    async getClientById(clientId) {
        const client = await this.db.getConnection();
        try {
            const clientData = await this.clientRepository.getById(clientId, client);

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
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error Fetching client with ID:", error.stack);
            throw new AppError(
                "Failed to Fetch client with ID",
                500,
                "CLIENT_FETCH_ERROR",
                { operation: "getClientById" });
        } finally {
            client.release();
        }
    }

    async createClient(clientData, auditContext) {
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

            const result = await this.clientRepository.create(clientData, location, client);
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

    async updateClient(clientId, updateData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const existingClient = await this.clientRepository.exists(clientId, client);
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

            const result = await this.clientRepository.update(clientId, finalUpdateData, location, client);

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
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                oldValues: existingClient,
                newValues: result,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return await this.clientRepository.getById(clientId, client);
        } catch (error) {
            await client.rollback();
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
        } finally {
            await client.release();
        }
    }

    async deleteClient(clientId, auditContext) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();
            const client = await this.clientRepository.getById(clientId, connection);
            if (!client) {
                throw new AppError(
                    `Client with ID ${clientId} not found`,
                    404,
                    'CLIENT_NOT_FOUND'
                );
            }
            const deleted = await this.clientRepository.delete(clientId, connection);

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

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, connection);

            await connection.commit();

            return {
                success: true,
                message: "Client details deleted successfully",
                data: {
                    clientId,
                    deletedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            await connection.rollback();
            if (error instanceof AppError || error.name === 'AppError') {
                throw error;
            }

            console.error("Error deleting client:", error.stack);
            throw new AppError(
                "Failed to delete client",
                500,
                "CLIENT_DELETION_ERROR",
                { clientId, operation: "deleteClient" }
            );
        } finally {
            connection.release();
        }
    }
}

module.exports = ClientService;