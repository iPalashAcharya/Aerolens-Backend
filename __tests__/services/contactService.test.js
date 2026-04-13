const ContactService = require('../../services/contactService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('ContactService', () => {
    let contactService;
    let mockContactRepository;
    let mockDb;
    let mockClient;

    const auditContext = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient),
        };

        mockContactRepository = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            getById: jest.fn(),
            exists: jest.fn(),
        };

        contactService = new ContactService(mockContactRepository, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
        jest.clearAllMocks();
    });

    describe('createContact', () => {
        const data = {
            contactPersonName: 'Jane',
            designation: 'Lead',
            emailAddress: 'j@example.com',
            phone: '+1 234 567 8901',
        };

        it('should create contact', async () => {
            const created = { clientContactId: 1, ...data };
            mockContactRepository.create.mockResolvedValue(created);

            const result = await contactService.createContact(data, auditContext);

            expect(mockContactRepository.create).toHaveBeenCalledWith(data, mockClient);
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result).toEqual(created);
        });

        it('should wrap repository errors', async () => {
            mockContactRepository.create.mockRejectedValue(new Error('db'));

            await expect(contactService.createContact(data, auditContext)).rejects.toMatchObject({
                message: 'Failed to create Contact Person',
                statusCode: 500,
                errorCode: 'CONTACT_PERSON_CREATION_ERROR',
            });
            expect(mockClient.rollback).toHaveBeenCalled();
        });

        it('should rethrow AppError from repository', async () => {
            const err = new AppError('bad', 400, 'BAD');
            mockContactRepository.create.mockRejectedValue(err);

            await expect(contactService.createContact(data, auditContext)).rejects.toBe(err);
        });
    });

    describe('updateContact', () => {
        const id = 1;
        const existing = {
            contactPersonName: 'Old',
            designation: 'M',
            emailAddress: 'o@e.com',
            phone: '111',
        };

        beforeEach(() => {
            mockContactRepository.exists.mockResolvedValue(existing);
            mockContactRepository.update.mockResolvedValue({ ...existing, contactPersonName: 'New' });
            mockContactRepository.getById.mockResolvedValue({ clientContactId: id, contactPersonName: 'New' });
        });

        it('should update and return getById result', async () => {
            const result = await contactService.updateContact(
                id,
                { contactPersonName: 'New' },
                auditContext
            );

            expect(mockContactRepository.exists).toHaveBeenCalledWith(id, mockClient);
            expect(mockContactRepository.update).toHaveBeenCalled();
            expect(mockClient.commit).toHaveBeenCalled();
            expect(result.contactPersonName).toBe('New');
        });

        it('should 404 when contact missing', async () => {
            mockContactRepository.exists.mockResolvedValue(null);

            await expect(
                contactService.updateContact(id, { contactPersonName: 'X' }, auditContext)
            ).rejects.toMatchObject({ statusCode: 404, errorCode: 'CONTACT_PERSON_NOT_FOUND' });
        });

        it('should 404 when update affects no rows', async () => {
            mockContactRepository.update.mockResolvedValue(null);

            await expect(
                contactService.updateContact(id, { contactPersonName: 'New' }, auditContext)
            ).rejects.toMatchObject({ statusCode: 404, errorCode: 'UPDATE_FAILED' });
        });

        it('should wrap unexpected update errors', async () => {
            mockContactRepository.update.mockRejectedValue(new Error('db'));

            await expect(
                contactService.updateContact(id, { contactPersonName: 'New' }, auditContext)
            ).rejects.toMatchObject({ statusCode: 500, errorCode: 'CLIENT_CONTACT_UPDATE_ERROR' });
        });
    });

    describe('deleteContact', () => {
        const id = 1;
        const row = { clientContactId: id, contactPersonName: 'Z' };

        it('should delete', async () => {
            mockContactRepository.getById.mockResolvedValue(row);
            mockContactRepository.delete.mockResolvedValue(1);

            const result = await contactService.deleteContact(id, auditContext);

            expect(mockContactRepository.delete).toHaveBeenCalledWith(id, mockClient);
            expect(result).toEqual({ deletedContact: 1 });
        });

        it('should 404 when missing', async () => {
            mockContactRepository.getById.mockResolvedValue(null);

            await expect(contactService.deleteContact(id, auditContext)).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'CLIENT_CONTACT_NOT_FOUND',
            });
        });

        it('should 404 when delete affects no rows', async () => {
            mockContactRepository.getById.mockResolvedValue(row);
            mockContactRepository.delete.mockResolvedValue(false);

            await expect(contactService.deleteContact(id, auditContext)).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'CLIENT_CONTACT_NOT_FOUND',
            });
        });

        it('should wrap unexpected delete errors', async () => {
            mockContactRepository.getById.mockResolvedValue(row);
            mockContactRepository.delete.mockRejectedValue(new Error('db'));

            await expect(contactService.deleteContact(id, auditContext)).rejects.toMatchObject({
                statusCode: 500,
                errorCode: 'CLIENT_CONTACT_DELETION_ERROR',
            });
        });
    });
});
