const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = require('../../../appForTest');
const db = require('../../../db');
const jwtConfig = require('../../../config/jwt');
const memberRepository = require('../../../repositories/memberRepository');
const refreshTokenRepository = require('../../../repositories/refreshTokenRepository');
const authService = require('../../../services/authServices');

jest.mock('../../../db');
jest.mock('../../../repositories/memberRepository');
jest.mock('../../../repositories/refreshTokenRepository');

describe('Authentication Flow', () => {
    let mockConnection;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConnection = {
            execute: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(mockConnection);
    });

    afterAll(async () => {
        await db.end?.();
    });

    describe('POST /auth/register', () => {
        const validRegistration = {
            memberName: 'John Doe',
            memberContact: '+1234567890',
            email: 'john@example.com',
            password: 'Test@1234',
            designation: 'developer',
            isRecruiter: false
        };

        it('should register a new user successfully', async () => {
            mockConnection.execute
                .mockResolvedValueOnce([[{ lookupKey: 'DEV' }]]) // designation lookup
                .mockResolvedValueOnce([{ insertId: 1 }]) // insert member
                .mockResolvedValueOnce([[{
                    memberId: 1,
                    memberName: 'John Doe',
                    email: 'john@example.com',
                    designation: 'DEV',
                    isRecruiter: false,
                    isActive: true
                }]]); // find by id

            memberRepository.findByEmail.mockResolvedValue(null);
            memberRepository.create.mockResolvedValue({
                memberId: 1,
                memberName: 'John Doe',
                email: 'john@example.com',
                designation: 'DEV',
                isRecruiter: false
            });

            const res = await request(app)
                .post('/auth/register')
                .send(validRegistration);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.member).toHaveProperty('memberId');
            expect(res.body.data.member).not.toHaveProperty('password');
        });

        it('should reject registration with existing email', async () => {
            mockConnection.execute.mockResolvedValueOnce([[{ lookupKey: 'DEV' }]]);
            memberRepository.findByEmail.mockResolvedValue({ memberId: 1 });

            const res = await request(app)
                .post('/auth/register')
                .send(validRegistration);

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('EMAIL_EXISTS');
        });

        it('should validate required fields', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({ email: 'test@example.com' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('VALIDATION_ERROR');
            expect(res.body.details).toBeInstanceOf(Array);
        });

        it('should validate email format', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({ ...validRegistration, email: 'invalid-email' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('VALIDATION_ERROR');
        });

        it('should validate password strength', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({ ...validRegistration, password: 'weak' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('VALIDATION_ERROR');
        });

        it('should validate contact format', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({ ...validRegistration, memberContact: 'invalid@#$' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('VALIDATION_ERROR');
        });

        it('should reject invalid designation', async () => {
            mockConnection.execute.mockResolvedValueOnce([[]]);

            const res = await request(app)
                .post('/auth/register')
                .send({ ...validRegistration, designation: 'invalid' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('INVALID_DESIGNATION');
        });
    });

    describe('POST /auth/login', () => {
        const validLogin = {
            email: 'john@example.com',
            password: 'Test@1234'
        };

        const mockMember = {
            memberId: 1,
            memberName: 'John Doe',
            email: 'john@example.com',
            password: '$2b$12$hashedpassword',
            designation: 'DEV',
            isRecruiter: false,
            isActive: true
        };

        beforeEach(() => {
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
        });

        it('should login successfully and return tokens', async () => {
            memberRepository.findByEmail.mockResolvedValue(mockMember);
            memberRepository.updateLastLogin.mockResolvedValue();
            refreshTokenRepository.create.mockResolvedValue(1);

            const res = await request(app)
                .post('/auth/login')
                .send(validLogin);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.body.data).toHaveProperty('member');
            expect(res.body.data.member).not.toHaveProperty('password');
            expect(res.headers['set-cookie']).toBeDefined();
        });

        it('should reject login with invalid email', async () => {
            memberRepository.findByEmail.mockResolvedValue(null);

            const res = await request(app)
                .post('/auth/login')
                .send(validLogin);

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('INVALID_CREDENTIALS');
        });

        it('should reject login with invalid password', async () => {
            memberRepository.findByEmail.mockResolvedValue(mockMember);
            jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

            const res = await request(app)
                .post('/auth/login')
                .send(validLogin);

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('INVALID_CREDENTIALS');
        });

        it('should reject login for inactive account', async () => {
            memberRepository.findByEmail.mockResolvedValue({
                ...mockMember,
                isActive: false
            });

            const res = await request(app)
                .post('/auth/login')
                .send(validLogin);

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('ACCOUNT_INACTIVE');
        });

        it('should validate required fields', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ email: 'test@example.com' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('VALIDATION_ERROR');
        });

        it('should enforce rate limiting', async () => {
            memberRepository.findByEmail.mockResolvedValue(null);

            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post('/auth/login')
                    .send(validLogin);
            }

            const res = await request(app)
                .post('/auth/login')
                .send(validLogin);

            expect(res.status).toBe(429);
            expect(res.body.error).toBe('RATE_LIMIT_EXCEEDED');
        });
    });

    describe('POST /auth/refresh', () => {
        const mockMember = {
            memberId: 1,
            email: 'john@example.com',
            isActive: true,
            designation: 'DEV',
            isRecruiter: false
        };

        let validRefreshToken;
        let tokenFamily;

        beforeEach(() => {
            tokenFamily = 'test-family-123';
            validRefreshToken = jwt.sign(
                { memberId: 1, tokenFamily, type: 'refresh' },
                jwtConfig.refresh.secret,
                {
                    expiresIn: '7d',
                    algorithm: 'HS256',
                    issuer: 'hr-management-system',
                    audience: 'hr-app-users'
                }
            );
        });

        it('should refresh access token successfully', async () => {
            const tokenHash = authService.hashRefreshToken(validRefreshToken);

            refreshTokenRepository.findByMemberAndHash.mockResolvedValue({
                id: 1,
                memberId: 1,
                tokenHash,
                tokenFamily,
                isRevoked: false,
                expiresAt: new Date(Date.now() + 86400000)
            });
            refreshTokenRepository.revokeToken.mockResolvedValue();
            refreshTokenRepository.create.mockResolvedValue(2);
            memberRepository.findById.mockResolvedValue(mockMember);

            const res = await request(app)
                .post('/auth/refresh')
                .set('Cookie', [`refreshToken=${validRefreshToken}`]);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.headers['set-cookie']).toBeDefined();
        });

        it('should reject missing refresh token', async () => {
            const res = await request(app)
                .post('/auth/refresh')

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('TOKEN_MISSING');
        });

        it('should reject invalid refresh token', async () => {
            const res = await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: 'invalid-token' });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('INVALID_TOKEN');
        });

        it('should reject expired refresh token', async () => {
            const expiredToken = jwt.sign(
                { memberId: 1, tokenFamily, type: 'refresh' },
                jwtConfig.refresh.secret,
                {
                    expiresIn: '-1d',
                    algorithm: 'HS256',
                    issuer: 'hr-management-system',
                    audience: 'hr-app-users'
                }
            );

            const res = await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: expiredToken });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('TOKEN_EXPIRED');
        });

        it('should reject revoked refresh token', async () => {
            const tokenHash = authService.hashRefreshToken(validRefreshToken);

            refreshTokenRepository.findByMemberAndHash.mockResolvedValue({
                id: 1,
                memberId: 1,
                tokenHash,
                tokenFamily,
                isRevoked: true,
                expiresAt: new Date(Date.now() + 86400000)
            });

            const res = await request(app)
                .post('/auth/refresh')
                .set('Cookie', [`refreshToken=${validRefreshToken}`]);

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('TOKEN_REVOKED');
        });

        it('should detect token reuse and revoke family', async () => {
            refreshTokenRepository.findByMemberAndHash.mockResolvedValue(null);
            refreshTokenRepository.findByTokenFamily.mockResolvedValue(true);
            refreshTokenRepository.revokeTokenFamily.mockResolvedValue();

            const res = await request(app)
                .post('/auth/refresh')
                .set('Cookie', [`refreshToken=${validRefreshToken}`]);

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('TOKEN_REUSE_DETECTED');
            expect(refreshTokenRepository.revokeTokenFamily).toHaveBeenCalledWith(1, tokenFamily);
        });

        it('should reject for inactive member', async () => {
            const tokenHash = authService.hashRefreshToken(validRefreshToken);

            refreshTokenRepository.findByMemberAndHash.mockResolvedValue({
                id: 1,
                memberId: 1,
                tokenHash,
                tokenFamily,
                isRevoked: false,
                expiresAt: new Date(Date.now() + 86400000)
            });
            memberRepository.findById.mockResolvedValue({
                ...mockMember,
                isActive: false
            });

            const res = await request(app)
                .post('/auth/refresh')
                .set('Cookie', [`refreshToken=${validRefreshToken}`]);

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('INVALID_MEMBER');
        });
    });

    describe('POST /auth/logout', () => {
        let validRefreshToken;

        beforeEach(() => {
            validRefreshToken = jwt.sign(
                { memberId: 1, tokenFamily: 'test-family', type: 'refresh' },
                jwtConfig.refresh.secret,
                {
                    expiresIn: '7d',
                    issuer: 'hr-management-system',
                    audience: 'hr-app-users'
                }
            );
        });

        it('should logout successfully with refresh token', async () => {
            const tokenHash = authService.hashRefreshToken(validRefreshToken);

            refreshTokenRepository.findByHash.mockResolvedValue({
                id: 1,
                tokenHash
            });
            refreshTokenRepository.revokeToken.mockResolvedValue();

            const res = await request(app)
                .post('/auth/logout')
                .set('Cookie', [`refreshToken=${validRefreshToken}`]);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.headers['set-cookie']).toBeDefined();
        });

        it('should handle logout without refresh token gracefully', async () => {
            const res = await request(app)
                .post('/auth/logout');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should handle logout errors gracefully', async () => {
            refreshTokenRepository.findByHash.mockRejectedValue(new Error('DB Error'));

            const res = await request(app)
                .post('/auth/logout')
                .send({ refreshToken: validRefreshToken });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /auth/logout-all', () => {
        let validAccessToken;

        beforeEach(() => {
            validAccessToken = jwt.sign(
                { memberId: 1, email: 'john@example.com', tokenFamily: 'test', type: 'access' },
                jwtConfig.access.secret,
                {
                    expiresIn: '15m',
                    algorithm: 'HS256',
                    issuer: 'hr-management-system',
                    audience: 'hr-app-users'
                }
            );

            memberRepository.findById.mockResolvedValue({
                memberId: 1,
                email: 'john@example.com',
                designation: 'DEV',
                isRecruiter: false,
                isActive: true
            });
        });

        it('should logout from all devices successfully', async () => {
            refreshTokenRepository.revokeAllTokensByMember.mockResolvedValue();

            const res = await request(app)
                .post('/auth/logout-all')
                .set('Authorization', `Bearer ${validAccessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(refreshTokenRepository.revokeAllTokensByMember).toHaveBeenCalledWith(1);
        });

        it('should reject without authentication', async () => {
            const res = await request(app)
                .post('/auth/logout-all');

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('AUTHENTICATION_FAILED');
        });

        it('should reject with invalid token', async () => {
            const res = await request(app)
                .post('/auth/logout-all')
                .set('Authorization', 'Bearer invalid-token');

            expect(res.status).toBe(401);
        });
    });

    describe('GET /auth/sessions', () => {
        let validAccessToken;

        beforeEach(() => {
            validAccessToken = jwt.sign(
                { memberId: 1, email: 'john@example.com', tokenFamily: 'test', type: 'access' },
                jwtConfig.access.secret,
                {
                    expiresIn: '15m',
                    algorithm: 'HS256',
                    issuer: 'hr-management-system',
                    audience: 'hr-app-users'
                }
            );

            memberRepository.findById.mockResolvedValue({
                memberId: 1,
                email: 'john@example.com',
                designation: 'DEV',
                isRecruiter: false,
                isActive: true
            });
        });

        it('should retrieve active sessions successfully', async () => {
            const now = new Date();
            const tomorrow = new Date(Date.now() + 86400000);

            const mockSessions = [
                {
                    id: 1,
                    userAgent: 'Mozilla/5.0',
                    ipAddress: '192.168.1.1',
                    issuedAt: now,
                    expiresAt: tomorrow,
                    tokenFamily: 'test-family'
                }
            ];
            refreshTokenRepository.findActiveByMember.mockResolvedValue(mockSessions);

            const res = await request(app)
                .get('/auth/sessions')
                .set('Authorization', `Bearer ${validAccessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.sessions).toHaveLength(1);
            expect(res.body.data.sessions[0]).toMatchObject({
                id: 1,
                userAgent: 'Mozilla/5.0',
                ipAddress: '192.168.1.1'
            });
        });

        it('should reject without authentication', async () => {
            const res = await request(app)
                .get('/auth/sessions');

            expect(res.status).toBe(401);
        });
    });

    describe('GET /auth/profile', () => {
        let validAccessToken;

        beforeEach(() => {
            validAccessToken = jwt.sign(
                { memberId: 1, email: 'john@example.com', tokenFamily: 'test', type: 'access' },
                jwtConfig.access.secret,
                {
                    expiresIn: '15m',
                    algorithm: 'HS256',
                    issuer: 'hr-management-system',
                    audience: 'hr-app-users'
                }
            );

            memberRepository.findById.mockResolvedValue({
                memberId: 1,
                memberName: 'John Doe',
                email: 'john@example.com',
                designation: 'DEV',
                isRecruiter: false,
                isActive: true
            });
        });

        it('should retrieve user profile successfully', async () => {
            const res = await request(app)
                .get('/auth/profile')
                .set('Authorization', `Bearer ${validAccessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.member).toHaveProperty('memberId');
            expect(res.body.data.member).toHaveProperty('email');
        });

        it('should reject without authentication', async () => {
            const res = await request(app)
                .get('/auth/profile');

            expect(res.status).toBe(401);
        });

        it('should reject for inactive user', async () => {
            memberRepository.findById.mockResolvedValue({
                memberId: 1,
                email: 'john@example.com',
                isActive: false
            });

            const res = await request(app)
                .get('/auth/profile')
                .set('Authorization', `Bearer ${validAccessToken}`);

            expect(res.status).toBe(401);
        });
    });

    describe('AuthService Unit Tests', () => {
        it('should hash password correctly', async () => {
            const password = 'Test@1234';
            const hashed = await authService.hashPassword(password);
            expect(hashed).toBeDefined();
            expect(hashed).not.toBe(password);
        });

        it('should compare passwords correctly', async () => {
            const password = 'Test@1234';
            const hashed = await authService.hashPassword(password);
            const isValid = await authService.comparePassword(password, hashed);
            expect(isValid).toBe(true);
        });

        it('should generate valid access token', () => {
            const token = authService.generateAccessToken(1, 'test@example.com', 'family-123');
            expect(token).toBeDefined();
            const decoded = jwt.verify(token, jwtConfig.access.secret);
            expect(decoded.memberId).toBe(1);
            expect(decoded.type).toBe('access');
        });

        it('should generate valid refresh token', () => {
            const token = authService.generateRefreshToken(1, 'family-123');
            expect(token).toBeDefined();
            const decoded = jwt.verify(token, jwtConfig.refresh.secret);
            expect(decoded.memberId).toBe(1);
            expect(decoded.type).toBe('refresh');
        });

        it('should generate unique token families', () => {
            const family1 = authService.generateTokenFamily();
            const family2 = authService.generateTokenFamily();
            expect(family1).not.toBe(family2);
            expect(family1).toMatch(/^[0-9a-f-]{36}$/);
        });

        it('should hash refresh token consistently', () => {
            const token = 'test-token-123';
            const hash1 = authService.hashRefreshToken(token);
            const hash2 = authService.hashRefreshToken(token);
            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64);
        });

        it('should verify valid access token', () => {
            const token = authService.generateAccessToken(1, 'test@example.com', 'family');
            const decoded = authService.verifyAccessToken(token);
            expect(decoded.memberId).toBe(1);
        });

        it('should throw error for invalid access token', () => {
            expect(() => {
                authService.verifyAccessToken('invalid-token');
            }).toThrow();
        });
    });
});