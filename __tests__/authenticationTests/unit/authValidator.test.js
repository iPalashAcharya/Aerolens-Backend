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

    describe('Designation Transformation', () => {
        it('should transform valid designation', async () => {
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 'DEV' }]]);

            const result = await AuthValidator.helper.transformDesignation('developer');

            expect(result).toBe('DEV');
        });

        it('should throw error for invalid designation', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await expect(
                AuthValidator.helper.transformDesignation('invalid')
            ).rejects.toThrow('Invalid designation specified');
        });

        it('should return null for empty designation', async () => {
            const result = await AuthValidator.helper.transformDesignation('');

            expect(result).toBeNull();
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
        const validRegistration = {
            memberName: 'John Doe',
            memberContact: '+1234567890',
            email: 'john@example.com',
            password: 'Test@1234',
            designation: 'developer'
        };

        it('should pass valid registration data', async () => {
            req.body = validRegistration;
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 'DEV' }]]);

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.designation).toBe('DEV');
        });

        it('should reject short name', async () => {
            req.body = { ...validRegistration, memberName: 'A' };

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });

        it('should reject invalid contact format', async () => {
            req.body = {
                ...validRegistration, memberContact: 'invalid@#'
            };

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });

        it('should reject weak password', async () => {
            req.body = { ...validRegistration, password: 'weak' };

            await AuthValidator.validateRegister(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });
    });

    describe('Refresh Token Validation', () => {
        it('should pass valid refresh token', async () => {
            req.body = { refreshToken: 'valid-token' };

            await AuthValidator.validateRefreshToken(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject missing refresh token', async () => {
            req.body = {};

            await AuthValidator.validateRefreshToken(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                errorCode: 'VALIDATION_ERROR'
            }));
        });
    });
});