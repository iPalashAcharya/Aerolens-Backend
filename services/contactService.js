const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class ContactService {
    constructor(contactRepository, db) {
        this.db = db;
        this.contactRepository = contactRepository;
    }

    async createContact(contactData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const exists = await this.contactRepository.existsByName(
                contactData.contactPersonName,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A contact person with this name already exists',
                    409,
                    'DUPLICATE_CONTACT_PERSON_NAME'
                );
            }

            const result = await this.contactRepository.create(contactData, client);
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

            console.error("Error creating Contact Person", error.stack);
            throw new AppError(
                "Failed to create Contact Person",
                500,
                "CONTACT_PERSON_CREATION_ERROR",
                { operation: "createContact", contactData: { name: contactData.contactPersonName } }
            );
        } finally {
            client.release();
        }
    }

    async updateContact(contactId, updateData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();
            const existingContact = await this.contactRepository.exists(contactId, client);
            if (!existingContact) {
                throw new AppError(
                    `Contact Person with ID ${contactId} does not exist`,
                    404,
                    "CONTACT_PERSON_NOT_FOUND",
                    {
                        contactId,
                        suggestion: "Please verify the contact person ID and try again"
                    }
                );
            }

            const name = updateData.contactPersonName || existingContact.contactPersonName;
            const designation = updateData.designation || existingContact.designation;
            const email = updateData.email || existingContact.emailAddress;
            const phone = updateData.phone || existingContact.phone;
            const finalUpdateData = { contactPersonName: name, designation, emailAddress: email, phone };

            const result = await this.contactRepository.update(contactId, finalUpdateData, client);

            if (!result) {
                throw new AppError(
                    "No changes were made to the contact person record",
                    404,
                    "UPDATE_FAILED",
                    {
                        contactId,
                        reason: "Contact Person may have been deleted by another process"
                    }
                );
            }
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                oldValues: existingContact,
                newValues: result,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return await this.contactRepository.getById(contactId, client);
        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error updating client contact:", error.stack);
            throw new AppError(
                "Failed to update client contact",
                500,
                "CLIENT_CONTACT_UPDATE_ERROR",
                { contactId, operation: "updateContact" }
            );
        } finally {
            client.release();
        }
    }

    async deleteContact(contactId, auditContext) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();
            const client = await this.contactRepository.getById(contactId, connection);
            if (!client) {
                throw new AppError(
                    `Contact Person with ID ${contactId} not found`,
                    404,
                    'CLIENT_CONTACT_NOT_FOUND'
                );
            }
            const deleted = await this.contactRepository.delete(contactId, connection);

            if (!deleted) {
                throw new AppError(
                    `Client Contact with ID ${contactId} not found`,
                    404,
                    "CLIENT_CONTACT_NOT_FOUND",
                    {
                        contactId,
                        suggestion: "Please verify the client contact ID and try again"
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

            return { deletedContact: deleted };
        } catch (error) {
            await connection.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error deleting client contact person:", error.stack);
            throw new AppError(
                "Failed to delete client contact person",
                500,
                "CLIENT_CONTACT_DELETION_ERROR",
                { contactId, operation: "deleteClient" }
            );
        } finally {
            connection.release();
        }
    }
}

module.exports = ContactService;