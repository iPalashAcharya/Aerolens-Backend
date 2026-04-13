const AuthValidator = require('../../../validators/authValidator');
const db = require('../../../db');

jest.mock('../../../db');

describe('AuthValidator Unit Tests', () => {
    let mockConnection;
    let req, res, next;

    beforeEach(() => {
        mockConnection = {
            execute: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(mockConnection);

        req = { body: {} };
        res = {};
        next = jest.fn();

        AuthValidator.init(db);
    });

    describe('validateDesignationExists', () => {
        it('should return designation id when lookup exists', async () => {
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 5 }], []]);

            const result = await AuthValidator.helper.validateDesignationExists(5);

            expect(result).toBe(5);
        });

        it('should throw when designation id missing from lookup', async () => {
            mockConnection.execute.mockResolvedValue([[], []]);

            await expect(AuthValidator.helper.validateDesignationExists(999))
                .rejects
                .toMatchObject({ errorCode: 'INVALID_DESIGNATION_ID' });
        });
    });

    describe('validateVendorExists', () => {
        it('should return true when vendor row exists', async () => {
            mockConnection.execute.mockResolvedValue([[{ vendorId: 1 }], []]);

            await expect(AuthValidator.helper.validateVendorExists(1)).resolves.toBe(true);
        });

        it('should throw when vendor missing', async () => {
            mockConnection.execute.mockResolvedValue([[], []]);

            await expect(AuthValidator.helper.validateVendorExists(99)).rejects.toMatchObject({
                errorCode: 'INVALID_VENDOR_ID',
            });
        });
    });

    describe('Login Validation', () => {
        it('should pass valid login data', async () => {
            req.body = {
                email: 'test@example.com',
                password: 'Test@1234'
            };

            await AuthValidator.validateLogin(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject missing email', async () => {
            req.body = { password: 'Test@1234' };

            await AuthValidator.validateLogin(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 400,
                errorCode: 'VALIDATION_ERROR'
            }));
        });

        it('should reject invalid email format', async () => {
            req.body = {
                email: 'invalid-email',
                password: 'Test@1234'
            };

            await AuthValidator.validateLogin(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });

        it('should reject missing password', async () => {
            req.body = { email: 'test@example.com' };

            await AuthValidator.validateLogin(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });
    });

    describe('Register Validation', () => {
        const validRegistration = () => ({
            memberName: 'John Doe',
            memberContact: '+919876543210',
            email: 'john@example.com',
            password: 'Test@1234',
            designationId: 1,
            isRecruiter: false,
        });

        it('should pass valid registration data', async () => {
            req.body = validRegistration();
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 1 }], []]);

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.designation).toBe(1);
        });

        it('should validate vendor when recruiter with vendorId', async () => {
            req.body = {
                ...validRegistration(),
                isRecruiter: true,
                vendorId: 7,
            };
            mockConnection.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }], []])
                .mockResolvedValueOnce([[{ vendorId: 7 }], []]);

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.vendorId).toBe(7);
        });

        it('should reject short name', async () => {
            req.body = { ...validRegistration(), memberName: 'A' };

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });

        it('should reject invalid contact format', async () => {
            req.body = {
                ...validRegistration(),
                memberContact: 'invalid@#'
            };

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });

        it('should reject weak password', async () => {
            req.body = { ...validRegistration(), password: 'weak' };

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });
    });

    describe('validateResetPassword', () => {
        it('should pass valid payload', async () => {
            req.body = {
                currentPassword: 'Old@1234',
                newPassword: 'New@5678',
            };

            await AuthValidator.validateResetPassword(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.newPassword).toBe('New@5678');
        });

        it('should reject when new password matches current', async () => {
            req.body = {
                currentPassword: 'Same@1234',
                newPassword: 'Same@1234',
            };

            await AuthValidator.validateResetPassword(req, res, next);

            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({ errorCode: 'VALIDATION_ERROR' })
            );
        });

        it('should reject invalid new password pattern', async () => {
            req.body = {
                currentPassword: 'Old@1234',
                newPassword: 'alllowercase1@',
            };

            await AuthValidator.validateResetPassword(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'VALIDATION_ERROR' }));
        });
    });
});
