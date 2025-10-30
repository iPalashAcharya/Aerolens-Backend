const ContactRepository = require('../../repositories/contactRepository');
const AppError = require('../../utils/appError');

describe('ContactRepository', () => {
    let contactRepository;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        // Mock database client
        mockClient = {
            execute: jest.fn(),
            release: jest.fn()
        };

        // Mock database connection
        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        contactRepository = new ContactRepository(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getById', () => {
        const mockContactId = 1;
        const mockContact = {
            clientContactId: 1,
            contactPersonName: 'John Doe',
            designation: 'Manager',
            emailAddress: 'john@example.com',
            phone: '1234567890'
        };

        it('should retrieve contact by ID successfully', async () => {
            mockClient.execute.mockResolvedValue([[mockContact]]);

            const result = await contactRepository.getById(mockContactId, mockClient);

            expect(result).toEqual(mockContact);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT clientContactId'),
                [mockContactId]
            );
        });

        it('should return null when contact is not found', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            const result = await contactRepository.getById(999, mockClient);

            expect(result).toBeNull();
        });

        it('should handle database errors properly', async () => {
            const dbError = new Error('Database error');
            dbError.code = 'ER_BAD_FIELD_ERROR';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(contactRepository.getById(mockContactId, mockClient))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when error occurs', async () => {
            mockClient.execute.mockRejectedValue(new Error('Connection lost'));

            await expect(contactRepository.getById(mockContactId, mockClient)).rejects.toThrow();
        });
    });

    describe('create', () => {
        const mockContactData = {
            contactPersonName: 'Jane Smith',
            designation: 'Director',
            phone: '9876543210',
            email: 'jane@example.com',
            clientId: 5
        };

        const mockInsertResult = {
            insertId: 42,
            affectedRows: 1
        };

        it('should create contact successfully', async () => {
            mockClient.execute.mockResolvedValue([mockInsertResult]);

            const result = await contactRepository.create(mockContactData, mockClient);

            expect(result).toEqual({
                contactId: 42,
                contactPersonName: mockContactData.contactPersonName,
                designation: mockContactData.designation,
                phone: mockContactData.phone,
                email: mockContactData.email
            });
        });

        it('should throw error on database error', async () => {
            const dbError = new Error('Insert failed');
            dbError.code = 'ER_DUP_ENTRY';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(contactRepository.create(mockContactData, mockClient))
                .rejects
                .toThrow(AppError);
        });

        it('should pass correct parameters to INSERT query', async () => {
            mockClient.execute.mockResolvedValue([mockInsertResult]);

            await contactRepository.create(mockContactData, mockClient);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO clientContact'),
                [
                    mockContactData.contactPersonName,
                    mockContactData.designation,
                    mockContactData.phone,
                    mockContactData.email,
                    mockContactData.clientId
                ]
            );
        });

        it('should handle duplicate entry error', async () => {
            const dupError = new Error('Duplicate entry');
            dupError.code = 'ER_DUP_ENTRY';
            mockClient.execute.mockRejectedValue(dupError);

            await expect(contactRepository.create(mockContactData, mockClient))
                .rejects
                .toMatchObject({
                    statusCode: 409,
                    errorCode: 'DUPLICATE_ENTRY'
                });
        });
    });

    describe('update', () => {
        const mockContactId = 1;
        const mockUpdateData = {
            contactPersonName: 'John Updated',
            designation: 'Senior Manager',
            phone: '1111111111',
            emailAddress: 'john.updated@example.com'
        };

        it('should update contact successfully', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await contactRepository.update(mockContactId, mockUpdateData, mockClient);

            expect(result).toEqual({
                contactId: mockContactId,
                ...mockUpdateData
            });
        });

        it('should return null when contact not found', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 0 }]);

            const result = await contactRepository.update(999, mockUpdateData, mockClient);

            expect(result).toBeNull();
        });

        it('should throw error on database error', async () => {
            const dbError = new Error('Update failed');
            dbError.code = 'ER_DATA_TOO_LONG';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(contactRepository.update(mockContactId, mockUpdateData, mockClient))
                .rejects
                .toThrow(AppError);
        });

        it('should pass correct parameters to UPDATE query', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await contactRepository.update(mockContactId, mockUpdateData, mockClient);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE clientContact SET'),
                [
                    mockUpdateData.contactPersonName,
                    mockUpdateData.designation,
                    mockUpdateData.phone,
                    mockUpdateData.emailAddress,
                    mockContactId
                ]
            );
        });
    });

    describe('delete', () => {
        const mockContactId = 1;

        it('should delete contact successfully', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await contactRepository.delete(mockContactId, mockClient);

            expect(result).toBe(1);
        });

        it('should return false when contact not found', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 0 }]);

            const result = await contactRepository.delete(999, mockClient);

            expect(result).toBe(false);
        });

        it('should throw error on database error', async () => {
            const dbError = new Error('Delete failed');
            dbError.code = 'ER_ACCESS_DENIED_ERROR';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(contactRepository.delete(mockContactId, mockClient))
                .rejects
                .toThrow(AppError);
        });

        it('should pass correct parameters to DELETE query', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await contactRepository.delete(mockContactId, mockClient);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM clientContact'),
                [mockContactId]
            );
        });
    });

    describe('exists', () => {
        const mockContactId = 1;
        const mockContact = {
            clientContactId: 1,
            contactPersonName: 'John Doe',
            designation: 'Manager',
            phone: '1234567890',
            emailAddress: 'john@example.com'
        };

        it('should return contact when exists', async () => {
            mockClient.execute.mockResolvedValue([[mockContact]]);

            const result = await contactRepository.exists(mockContactId, mockClient);

            expect(result).toEqual(mockContact);
        });

        it('should return null when contact does not exist', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            const result = await contactRepository.exists(999, mockClient);

            expect(result).toBeNull();
        });

        it('should use provided client connection', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[mockContact]])
            };

            await contactRepository.exists(mockContactId, externalClient);

            expect(externalClient.execute).toHaveBeenCalledTimes(1);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Query failed');
            dbError.code = 'ETIMEDOUT';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(contactRepository.exists(mockContactId, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('existsByName', () => {
        const mockContactName = 'John Doe';

        it('should return true when contact name exists', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 1 }]]);

            const result = await contactRepository.existsByName(mockContactName, null, mockClient);

            expect(result).toBe(true);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*) as count'),
                [mockContactName]
            );
        });

        it('should return false when contact name does not exist', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 0 }]]);

            const result = await contactRepository.existsByName('Non Existent', null, mockClient);

            expect(result).toBe(false);
        });

        it('should exclude specific ID when provided', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 0 }]]);
            const excludeId = 5;

            await contactRepository.existsByName(mockContactName, excludeId, mockClient);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND clientContactId != ?'),
                [mockContactName, excludeId]
            );
        });

        it('should not exclude ID when excludeId is null', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 1 }]]);

            await contactRepository.existsByName(mockContactName, null, mockClient);

            const callArgs = mockClient.execute.mock.calls[0];
            expect(callArgs[0]).not.toContain('AND clientContactId != ?');
            expect(callArgs[1]).toEqual([mockContactName]);
        });

        it('should use provided client connection when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[{ count: 1 }]])
            };

            await contactRepository.existsByName(mockContactName, null, externalClient);

            expect(externalClient.execute).toHaveBeenCalledTimes(1);
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Query failed');
            dbError.code = 'ER_NO_SUCH_TABLE';
            mockClient.execute.mockRejectedValue(dbError);

            await expect(contactRepository.existsByName(mockContactName, null, mockClient))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('_handleDatabaseError', () => {
        it('should throw AppError for ER_BAD_FIELD_ERROR', () => {
            const error = new Error('Bad field');
            error.code = 'ER_BAD_FIELD_ERROR';

            expect(() => contactRepository._handleDatabaseError(error, 'testOp'))
                .toThrow(AppError);

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(500);
                expect(err.errorCode).toBe('DATABASE_SCHEMA_ERROR');
                expect(err.message).toContain('Database schema error');
            }
        });

        it('should throw AppError for ER_NO_SUCH_TABLE', () => {
            const error = new Error('No such table');
            error.code = 'ER_NO_SUCH_TABLE';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(500);
                expect(err.errorCode).toBe('DATABASE_SCHEMA_ERROR');
                expect(err.message).toContain('Required database table not found');
            }
        });

        it('should throw AppError for ER_ACCESS_DENIED_ERROR', () => {
            const error = new Error('Access denied');
            error.code = 'ER_ACCESS_DENIED_ERROR';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(500);
                expect(err.errorCode).toBe('DATABASE_ACCESS_ERROR');
            }
        });

        it('should throw AppError for ETIMEDOUT', () => {
            const error = new Error('Timeout');
            error.code = 'ETIMEDOUT';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(503);
                expect(err.errorCode).toBe('DATABASE_CONNECTION_ERROR');
            }
        });

        it('should throw AppError for ECONNRESET', () => {
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(503);
                expect(err.errorCode).toBe('DATABASE_CONNECTION_ERROR');
            }
        });

        it('should throw AppError for ER_DUP_ENTRY', () => {
            const error = new Error('Duplicate entry for clientName');
            error.code = 'ER_DUP_ENTRY';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(409);
                expect(err.errorCode).toBe('DUPLICATE_ENTRY');
                expect(err.details.duplicateField).toBe('name');
            }
        });

        it('should throw AppError for ER_DATA_TOO_LONG', () => {
            const error = new Error('Data too long for column');
            error.code = 'ER_DATA_TOO_LONG';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(400);
                expect(err.errorCode).toBe('DATA_TOO_LONG');
            }
        });

        it('should throw generic AppError for unknown error codes', () => {
            const error = new Error('Unknown error');
            error.code = 'UNKNOWN_ERROR';
            error.sqlState = '42000';

            try {
                contactRepository._handleDatabaseError(error, 'testOp');
            } catch (err) {
                expect(err.statusCode).toBe(500);
                expect(err.errorCode).toBe('DATABASE_ERROR');
                expect(err.details.operation).toBe('testOp');
                expect(err.details.code).toBe('UNKNOWN_ERROR');
                expect(err.details.sqlState).toBe('42000');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty string contact name in existsByName', async () => {
            mockClient.execute.mockResolvedValue([[{ count: 0 }]]);

            const result = await contactRepository.existsByName('', null, mockClient);

            expect(result).toBe(false);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['']
            );
        });

        it('should handle null values in update data', async () => {
            mockClient.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const updateData = {
                contactPersonName: 'Test',
                designation: null,
                phone: null,
                emailAddress: 'test@example.com'
            };

            await contactRepository.update(1, updateData, mockClient);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['Test', null, null, 'test@example.com', 1]
            );
        });

        it('should handle concurrent operations with separate clients', async () => {
            const client1 = { execute: jest.fn().mockResolvedValue([[]]) };
            const client2 = { execute: jest.fn().mockResolvedValue([[]]) };

            await Promise.all([
                contactRepository.getById(1, client1),
                contactRepository.getById(2, client2)
            ]);

            expect(client1.execute).toHaveBeenCalledTimes(1);
            expect(client2.execute).toHaveBeenCalledTimes(1);
        });
    });
});