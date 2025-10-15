const ContactService = require('../../services/contactService');
const AppError = require('../../utils/appError');

describe('ContactService', () => {
    let contactService;
    let mockContactRepository;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        // Mock database client
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined)
        };

        // Mock database
        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        // Mock repository
        mockContactRepository = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            getById: jest.fn(),
            exists: jest.fn(),
            existsByName: jest.fn()
        };

        // Initialize service
        contactService = new ContactService(mockContactRepository, mockDb);

        // Reset console.error mock
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.clearAllMocks();
        console.error.mockRestore();
    });

    describe('createContact', () => {
        const validContactData = {
            contactPersonName: 'John Doe',
            designation: 'Manager',
            emailAddress: 'john@example.com',
            phone: '+1234567890'
        };

        describe('Success Cases', () => {
            it('should create a contact successfully with valid data', async () => {
                const expectedResult = { id: 1, ...validContactData };
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockResolvedValue(expectedResult);

                const result = await contactService.createContact(validContactData);

                expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
                expect(mockClient.beginTransaction).toHaveBeenCalledTimes(1);
                expect(mockContactRepository.existsByName).toHaveBeenCalledWith(
                    validContactData.contactPersonName,
                    null,
                    mockClient
                );
                expect(mockContactRepository.create).toHaveBeenCalledWith(validContactData);
                expect(mockClient.commit).toHaveBeenCalledTimes(1);
                expect(mockClient.rollback).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
                expect(result).toEqual(expectedResult);
            });

            it('should handle contact with special characters in name', async () => {
                const specialContactData = {
                    ...validContactData,
                    contactPersonName: "O'Brien-Smith"
                };
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockResolvedValue({ id: 1, ...specialContactData });

                const result = await contactService.createContact(specialContactData);

                expect(result.contactPersonName).toBe("O'Brien-Smith");
                expect(mockClient.commit).toHaveBeenCalled();
            });

            it('should create contact with minimal required fields', async () => {
                const minimalData = {
                    contactPersonName: 'Jane Doe'
                };
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockResolvedValue({ id: 2, ...minimalData });

                const result = await contactService.createContact(minimalData);

                expect(result).toHaveProperty('id');
                expect(mockClient.commit).toHaveBeenCalled();
            });
        });

        describe('Validation Errors', () => {
            it('should throw AppError when contact name already exists', async () => {
                mockContactRepository.existsByName.mockResolvedValue(true);

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toThrow(AppError);

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toMatchObject({
                        message: 'A contact person with this name already exists',
                        statusCode: 409,
                        errorCode: 'DUPLICATE_CONTACT_PERSON_NAME'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(2);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockContactRepository.create).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(2);
            });

            it('should rollback transaction on duplicate name error', async () => {
                mockContactRepository.existsByName.mockResolvedValue(true);

                try {
                    await contactService.createContact(validContactData);
                } catch (error) {
                    expect(mockClient.beginTransaction).toHaveBeenCalled();
                    expect(mockClient.rollback).toHaveBeenCalled();
                    expect(mockClient.commit).not.toHaveBeenCalled();
                }
            });
        });

        describe('Database Errors', () => {
            it('should handle database connection failure', async () => {
                mockDb.getConnection.mockRejectedValue(new Error('Connection failed'));

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toThrow('Connection failed');
            });

            it('should rollback and throw AppError on repository create failure', async () => {
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockRejectedValue(new Error('DB Insert Error'));

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toMatchObject({
                        message: 'Failed to create Contact Person',
                        statusCode: 500,
                        errorCode: 'CONTACT_PERSON_CREATION_ERROR'
                    });

                expect(mockClient.rollback).toHaveBeenCalledTimes(1);
                expect(mockClient.commit).not.toHaveBeenCalled();
                expect(mockClient.release).toHaveBeenCalledTimes(1);
                expect(console.error).toHaveBeenCalledWith(
                    'Error creating Contact Person',
                    expect.any(String)
                );
            });

            it('should handle transaction begin failure', async () => {
                mockClient.beginTransaction.mockRejectedValue(new Error('Transaction error'));

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toThrow();

                expect(mockClient.release).toHaveBeenCalled();
            });

            it('should handle transaction commit failure', async () => {
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockResolvedValue({ id: 1 });
                mockClient.commit.mockRejectedValue(new Error('Commit failed'));

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toMatchObject({
                        statusCode: 500,
                        errorCode: 'CONTACT_PERSON_CREATION_ERROR'
                    });

                expect(mockClient.rollback).toHaveBeenCalled();
            });
        });

        describe('Edge Cases', () => {
            it('should ensure client is released even when rollback fails', async () => {
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockRejectedValue(new Error('Create failed'));
                mockClient.rollback.mockRejectedValue(new Error('Rollback failed'));

                await expect(contactService.createContact(validContactData))
                    .rejects
                    .toThrow();

                expect(mockClient.release).toHaveBeenCalled();
            });

            it('should preserve error metadata in AppError', async () => {
                mockContactRepository.existsByName.mockResolvedValue(false);
                mockContactRepository.create.mockRejectedValue(new Error('DB Error'));

                try {
                    await contactService.createContact(validContactData);
                } catch (error) {
                    expect(error.details).toMatchObject({
                        operation: 'createContact',
                        contactData: { name: validContactData.contactPersonName }
                    });
                }
            });
        });
    });

    describe('updateContact', () => {
        const contactId = 1;
        const existingContact = {
            id: contactId,
            contactPersonName: 'John Doe',
            designation: 'Manager',
            emailAddress: 'john@example.com',
            phone: '+1234567890'
        };

        describe('Success Cases', () => {
            it('should update contact with all fields', async () => {
                const updateData = {
                    contactPersonName: 'John Updated',
                    designation: 'Senior Manager',
                    email: 'john.updated@example.com',
                    phone: '+9876543210'
                };
                const updatedContact = { id: contactId, ...updateData };

                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockResolvedValue(true);
                mockContactRepository.getById.mockResolvedValue(updatedContact);

                const result = await contactService.updateContact(contactId, updateData);

                expect(mockContactRepository.exists).toHaveBeenCalledWith(contactId);
                expect(mockContactRepository.update).toHaveBeenCalledWith(contactId, {
                    contactPersonName: updateData.contactPersonName,
                    designation: updateData.designation,
                    emailAddress: updateData.email,
                    phone: updateData.phone
                });
                expect(mockContactRepository.getById).toHaveBeenCalledWith(contactId);
                expect(result).toEqual(updatedContact);
            });

            it('should update contact with partial fields', async () => {
                const updateData = {
                    designation: 'Director'
                };

                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockResolvedValue(true);
                mockContactRepository.getById.mockResolvedValue({
                    ...existingContact,
                    designation: 'Director'
                });

                const result = await contactService.updateContact(contactId, updateData);

                expect(mockContactRepository.update).toHaveBeenCalledWith(contactId, {
                    contactPersonName: existingContact.contactPersonName,
                    designation: 'Director',
                    emailAddress: existingContact.emailAddress,
                    phone: existingContact.phone
                });
                expect(result.designation).toBe('Director');
            });

            it('should use existing values for unspecified fields', async () => {
                const updateData = {
                    email: 'newemail@example.com'
                };

                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockResolvedValue(true);
                mockContactRepository.getById.mockResolvedValue({
                    ...existingContact,
                    emailAddress: 'newemail@example.com'
                });

                await contactService.updateContact(contactId, updateData);

                expect(mockContactRepository.update).toHaveBeenCalledWith(contactId, {
                    contactPersonName: existingContact.contactPersonName,
                    designation: existingContact.designation,
                    emailAddress: 'newemail@example.com',
                    phone: existingContact.phone
                });
            });

            it('should handle empty update data object', async () => {
                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockResolvedValue(true);
                mockContactRepository.getById.mockResolvedValue(existingContact);

                const result = await contactService.updateContact(contactId, {});

                expect(mockContactRepository.update).toHaveBeenCalledWith(contactId, {
                    contactPersonName: existingContact.contactPersonName,
                    designation: existingContact.designation,
                    emailAddress: existingContact.emailAddress,
                    phone: existingContact.phone
                });
                expect(result).toEqual(existingContact);
            });
        });

        describe('Validation Errors', () => {
            it('should throw AppError when contact does not exist', async () => {
                mockContactRepository.exists.mockResolvedValue(null);

                await expect(contactService.updateContact(contactId, { designation: 'Manager' }))
                    .rejects
                    .toMatchObject({
                        message: `Contact Person with ID ${contactId} does not exist`,
                        statusCode: 404,
                        errorCode: 'CONTACT_PERSON_NOT_FOUND'
                    });

                expect(mockContactRepository.update).not.toHaveBeenCalled();
            });

            it('should include metadata in not found error', async () => {
                mockContactRepository.exists.mockResolvedValue(null);

                try {
                    await contactService.updateContact(contactId, {});
                } catch (error) {
                    expect(error.details).toMatchObject({
                        contactId,
                        suggestion: 'Please verify the contact person ID and try again'
                    });
                }
            });

            it('should throw AppError when update returns false', async () => {
                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockResolvedValue(false);

                await expect(contactService.updateContact(contactId, { designation: 'Manager' }))
                    .rejects
                    .toMatchObject({
                        message: 'No changes were made to the contact person record',
                        statusCode: 404,
                        errorCode: 'UPDATE_FAILED'
                    });

                expect(mockContactRepository.getById).not.toHaveBeenCalled();
            });
        });

        describe('Database Errors', () => {
            it('should handle repository exists check failure', async () => {
                mockContactRepository.exists.mockRejectedValue(new Error('DB Error'));

                await expect(contactService.updateContact(contactId, {}))
                    .rejects
                    .toMatchObject({
                        message: 'Failed to update client contact',
                        statusCode: 500,
                        errorCode: 'CLIENT_CONTACT_UPDATE_ERROR'
                    });

                expect(console.error).toHaveBeenCalledWith(
                    'Error updating client contact:',
                    expect.any(String)
                );
            });

            it('should handle repository update failure', async () => {
                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockRejectedValue(new Error('Update failed'));

                await expect(contactService.updateContact(contactId, {}))
                    .rejects
                    .toMatchObject({
                        statusCode: 500,
                        errorCode: 'CLIENT_CONTACT_UPDATE_ERROR'
                    });
            });

            it('should handle getById failure after successful update', async () => {
                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockResolvedValue(true);
                mockContactRepository.getById.mockRejectedValue(new Error('Fetch failed'));

                await expect(contactService.updateContact(contactId, {}))
                    .rejects
                    .toThrow();
            });
        });

        describe('Edge Cases', () => {
            it('should handle contact with null/undefined fields', async () => {
                const contactWithNulls = {
                    ...existingContact,
                    designation: null,
                    emailAddress: null
                };
                mockContactRepository.exists.mockResolvedValue(contactWithNulls);
                mockContactRepository.update.mockResolvedValue(true);
                mockContactRepository.getById.mockResolvedValue(contactWithNulls);

                const result = await contactService.updateContact(contactId, {});

                expect(result).toMatchObject(contactWithNulls);
            });

            it('should preserve error metadata on repository failures', async () => {
                mockContactRepository.exists.mockResolvedValue(existingContact);
                mockContactRepository.update.mockRejectedValue(new Error('DB Error'));

                try {
                    await contactService.updateContact(contactId, {});
                } catch (error) {
                    expect(error.details).toMatchObject({
                        contactId,
                        operation: 'updateContact'
                    });
                }
            });

            it('should handle very large contact ID', async () => {
                const largeId = Number.MAX_SAFE_INTEGER;
                mockContactRepository.exists.mockResolvedValue(null);

                await expect(contactService.updateContact(largeId, {}))
                    .rejects
                    .toMatchObject({
                        statusCode: 404,
                        errorCode: 'CONTACT_PERSON_NOT_FOUND'
                    });
            });
        });
    });

    describe('deleteContact', () => {
        const contactId = 1;
        const existingContact = {
            id: contactId,
            contactPersonName: 'John Doe',
            designation: 'Manager'
        };

        describe('Success Cases', () => {
            it('should delete contact successfully', async () => {
                mockContactRepository.getById.mockResolvedValue(existingContact);
                mockContactRepository.delete.mockResolvedValue(existingContact);

                const result = await contactService.deleteContact(contactId);

                expect(mockContactRepository.getById).toHaveBeenCalledWith(contactId);
                expect(mockContactRepository.delete).toHaveBeenCalledWith(contactId);
                expect(result).toEqual({ deletedContact: existingContact });
            });

            it('should return deleted contact information', async () => {
                const contactToDelete = {
                    id: 2,
                    contactPersonName: 'Jane Smith',
                    designation: 'Director'
                };
                mockContactRepository.getById.mockResolvedValue(contactToDelete);
                mockContactRepository.delete.mockResolvedValue(contactToDelete);

                const result = await contactService.deleteContact(2);

                expect(result.deletedContact).toEqual(contactToDelete);
            });
        });

        describe('Validation Errors', () => {
            it('should throw AppError when contact not found in getById', async () => {
                mockContactRepository.getById.mockResolvedValue(null);

                await expect(contactService.deleteContact(contactId))
                    .rejects
                    .toMatchObject({
                        message: `Contact Person with ID ${contactId} not found`,
                        statusCode: 404,
                        errorCode: 'CLIENT_CONTACT_NOT_FOUND'
                    });

                expect(mockContactRepository.delete).not.toHaveBeenCalled();
            });

            it('should throw AppError when delete returns falsy value', async () => {
                mockContactRepository.getById.mockResolvedValue(existingContact);
                mockContactRepository.delete.mockResolvedValue(null);

                await expect(contactService.deleteContact(contactId))
                    .rejects
                    .toMatchObject({
                        message: `Client Contact with ID ${contactId} not found`,
                        statusCode: 404,
                        errorCode: 'CLIENT_CONTACT_NOT_FOUND'
                    });
            });

            it('should include metadata in delete not found error', async () => {
                mockContactRepository.getById.mockResolvedValue(existingContact);
                mockContactRepository.delete.mockResolvedValue(false);

                try {
                    await contactService.deleteContact(contactId);
                } catch (error) {
                    expect(error.details).toMatchObject({
                        contactId,
                        suggestion: 'Please verify the client contact ID and try again'
                    });
                }
            });
        });

        describe('Database Errors', () => {
            it('should handle repository getById failure', async () => {
                mockContactRepository.getById.mockRejectedValue(new Error('DB Error'));

                await expect(contactService.deleteContact(contactId))
                    .rejects
                    .toMatchObject({
                        message: 'Failed to delete client contact person',
                        statusCode: 500,
                        errorCode: 'CLIENT_CONTACT_DELETION_ERROR'
                    });

                expect(console.error).toHaveBeenCalledWith(
                    'Error deleting client contact person:',
                    expect.any(String)
                );
            });

            it('should handle repository delete failure', async () => {
                mockContactRepository.getById.mockResolvedValue(existingContact);
                mockContactRepository.delete.mockRejectedValue(new Error('Delete failed'));

                await expect(contactService.deleteContact(contactId))
                    .rejects
                    .toMatchObject({
                        statusCode: 500,
                        errorCode: 'CLIENT_CONTACT_DELETION_ERROR'
                    });
            });

            it('should preserve error metadata on failures', async () => {
                mockContactRepository.getById.mockRejectedValue(new Error('DB Error'));

                try {
                    await contactService.deleteContact(contactId);
                } catch (error) {
                    expect(error.details).toMatchObject({
                        contactId,
                        operation: 'deleteClient'
                    });
                }
            });
        });

        describe('Edge Cases', () => {
            it('should handle zero as contact ID', async () => {
                mockContactRepository.getById.mockResolvedValue(null);

                await expect(contactService.deleteContact(0))
                    .rejects
                    .toMatchObject({
                        statusCode: 404,
                        errorCode: 'CLIENT_CONTACT_NOT_FOUND'
                    });
            });

            it('should handle negative contact ID', async () => {
                mockContactRepository.getById.mockResolvedValue(null);

                await expect(contactService.deleteContact(-1))
                    .rejects
                    .toMatchObject({
                        statusCode: 404,
                        errorCode: 'CLIENT_CONTACT_NOT_FOUND'
                    });
            });

            it('should handle string contact ID', async () => {
                mockContactRepository.getById.mockResolvedValue(null);

                await expect(contactService.deleteContact('abc'))
                    .rejects
                    .toThrow();
            });

            it('should handle concurrent deletion scenario', async () => {
                mockContactRepository.getById.mockResolvedValue(existingContact);
                mockContactRepository.delete.mockResolvedValue(null);

                await expect(contactService.deleteContact(contactId))
                    .rejects
                    .toMatchObject({
                        message: expect.stringContaining('not found'),
                        statusCode: 404
                    });
            });
        });
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with repository and database', () => {
            const service = new ContactService(mockContactRepository, mockDb);

            expect(service.contactRepository).toBe(mockContactRepository);
            expect(service.db).toBe(mockDb);
        });

        it('should work with different repository implementations', () => {
            const alternateRepo = { ...mockContactRepository };
            const service = new ContactService(alternateRepo, mockDb);

            expect(service.contactRepository).toBe(alternateRepo);
        });
    });

    describe('Error Handling Consistency', () => {
        it('should always log errors before throwing wrapped errors', async () => {
            mockContactRepository.existsByName.mockResolvedValue(false);
            mockContactRepository.create.mockRejectedValue(new Error('Test error'));

            try {
                await contactService.createContact({ contactPersonName: 'Test' });
            } catch (error) {
                expect(console.error).toHaveBeenCalled();
                expect(error).toBeInstanceOf(AppError);
            }
        });

        it('should preserve original AppError instances', async () => {
            const originalError = new AppError('Original', 400, 'ORIGINAL_CODE');
            mockContactRepository.existsByName.mockRejectedValue(originalError);

            try {
                await contactService.createContact({ contactPersonName: 'Test' });
            } catch (error) {
                expect(error).toBe(originalError);
            }
        });

        it('should include operation context in all error metadata', async () => {
            const operations = [
                {
                    method: () => contactService.createContact({ contactPersonName: 'Test' }),
                    setup: () => {
                        mockContactRepository.existsByName.mockResolvedValue(false);
                        mockContactRepository.create.mockRejectedValue(new Error('Error'));
                    },
                    operation: 'createContact'
                },
                {
                    method: () => contactService.updateContact(1, {}),
                    setup: () => {
                        mockContactRepository.exists.mockRejectedValue(new Error('Error'));
                    },
                    operation: 'updateContact'
                },
                {
                    method: () => contactService.deleteContact(1),
                    setup: () => {
                        mockContactRepository.getById.mockRejectedValue(new Error('Error'));
                    },
                    operation: 'deleteClient'
                }
            ];

            for (const { method, setup, operation } of operations) {
                jest.clearAllMocks();
                setup();

                try {
                    await method();
                } catch (error) {
                    expect(error.details.operation).toBe(operation);
                }
            }
        });
    });
});