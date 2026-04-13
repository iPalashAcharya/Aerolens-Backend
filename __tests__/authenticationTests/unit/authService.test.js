const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../../../config/jwt');

jest.mock('../../../db', () => ({
    getConnection: jest.fn(),
}));

jest.mock('../../../repositories/memberRepository', () => {
    const impl = {
        findByEmail: jest.fn(),
        updateLastLogin: jest.fn(),
        findById: jest.fn(),
        updatePassword: jest.fn(),
        create: jest.fn(),
    };
    const Ctor = jest.fn(() => impl);
    Ctor.__instance = impl;
    return Ctor;
});
jest.mock('../../../repositories/tokenRepository');

const db = require('../../../db');

const MemberRepository = require('../../../repositories/memberRepository');
const mockMemberRepo = MemberRepository.__instance;
const tokenRepository = require('../../../repositories/tokenRepository');
const authService = require('../../../services/authServices');

describe('AuthService Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Password Hashing', () => {
        it('should hash password with bcrypt', async () => {
            const password = 'TestPassword123!';
            const hash = await authService.hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.startsWith('$2')).toBe(true);
        });

        it('should compare password correctly', async () => {
            const password = 'TestPassword123!';
            const hash = await bcrypt.hash(password, 10);

            expect(await authService.comparePassword(password, hash)).toBe(true);
            expect(await authService.comparePassword('WrongPassword', hash)).toBe(false);
        });
    });

    describe('Token helpers', () => {
        it('should generate JWT with expected claims', () => {
            const token = authService.generateToken(1, 'a@b.com', 'fam', 'jti-1');
            const decoded = jwt.verify(token, jwtConfig.token.secret, {
                algorithms: [jwtConfig.token.algorithm],
                issuer: jwtConfig.token.issuer,
                audience: jwtConfig.token.audience,
            });

            expect(decoded.memberId).toBe(1);
            expect(decoded.email).toBe('a@b.com');
            expect(decoded.family).toBe('fam');
            expect(decoded.jti).toBe('jti-1');
        });

        it('should generate unique token families', () => {
            const families = new Set();
            for (let i = 0; i < 50; i++) {
                families.add(authService.generateTokenFamily());
            }
            expect(families.size).toBe(50);
        });

        it('calculateExpiresAt should advance seconds, minutes, hours, and days', () => {
            const base = Date.now();
            const s = authService.calculateExpiresAt('30s');
            const m = authService.calculateExpiresAt('15m');
            const h = authService.calculateExpiresAt('2h');
            const d = authService.calculateExpiresAt('3d');

            expect(s.getTime() - base).toBeGreaterThanOrEqual(29000);
            expect(m.getMinutes()).not.toBe(new Date(base).getMinutes());
            expect(h.getHours()).not.toBe(new Date(base).getHours());
            expect(d.getDate()).not.toBe(new Date(base).getDate());
        });

        it('calculateExpiresAt returns date when pattern does not match', () => {
            const out = authService.calculateExpiresAt('not-a-duration');
            expect(out).toBeInstanceOf(Date);
        });
    });

    describe('verifyToken', () => {
        it('should verify valid token when not revoked', async () => {
            tokenRepository.isTokenRevoked.mockResolvedValue(false);
            const token = authService.generateToken(2, 'u@u.com', 'f', authService.generateJTI());

            const decoded = await authService.verifyToken(token);

            expect(decoded.memberId).toBe(2);
        });

        it('should reject revoked token', async () => {
            tokenRepository.isTokenRevoked.mockResolvedValue(true);
            const token = authService.generateToken(2, 'u@u.com', 'f', authService.generateJTI());

            await expect(authService.verifyToken(token)).rejects.toMatchObject({
                errorCode: 'TOKEN_REVOKED',
            });
        });

        it('should map TokenExpiredError from jwt.verify', async () => {
            const err = new Error('expired');
            err.name = 'TokenExpiredError';
            jest.spyOn(jwt, 'verify').mockImplementation(() => {
                throw err;
            });

            await expect(authService.verifyToken('bad')).rejects.toMatchObject({
                errorCode: 'TOKEN_EXPIRED',
            });

            jwt.verify.mockRestore();
        });

        it('should wrap generic jwt errors as INVALID_TOKEN', async () => {
            jest.spyOn(jwt, 'verify').mockImplementation(() => {
                throw new Error('sig');
            });

            await expect(authService.verifyToken('bad')).rejects.toMatchObject({
                errorCode: 'INVALID_TOKEN',
            });

            jwt.verify.mockRestore();
        });
    });

    describe('Login', () => {
        const mockMember = {
            memberId: 1,
            memberName: 'John',
            email: 'john@example.com',
            password: '$2b$12$hashed',
            isActive: true,
        };

        it('should login and return token', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue(mockMember);
            mockMemberRepo.updateLastLogin.mockResolvedValue();
            tokenRepository.storeToken.mockResolvedValue(1);
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);

            const result = await authService.login('john@example.com', 'pw', 'ua', '127.0.0.1');

            expect(result.token).toBeDefined();
            expect(result.expiresIn).toBe(jwtConfig.token.expiresIn);
            expect(result.member.email).toBe('john@example.com');
            expect(tokenRepository.storeToken).toHaveBeenCalled();
        });

        it('should reject invalid credentials', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue(null);

            await expect(
                authService.login('x@y.com', 'pw', 'ua', 'ip')
            ).rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
        });

        it('should reject inactive account', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue({ ...mockMember, isActive: false });

            await expect(authService.login('john@example.com', 'pw', 'ua', 'ip')).rejects.toMatchObject({
                errorCode: 'ACCOUNT_INACTIVE',
            });
        });

        it('should reject wrong password', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue(mockMember);
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

            await expect(authService.login('john@example.com', 'bad', 'ua', 'ip')).rejects.toMatchObject({
                errorCode: 'INVALID_CREDENTIALS',
            });
        });

        it('should pass null userAgent and ip to storeToken when omitted', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue(mockMember);
            mockMemberRepo.updateLastLogin.mockResolvedValue();
            tokenRepository.storeToken.mockResolvedValue(1);
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);

            await authService.login('john@example.com', 'pw');

            expect(tokenRepository.storeToken).toHaveBeenCalledWith(
                expect.objectContaining({
                    userAgent: null,
                    ipAddress: null,
                })
            );
        });
    });

    describe('register', () => {
        let client;

        beforeEach(() => {
            client = {
                beginTransaction: jest.fn().mockResolvedValue(),
                commit: jest.fn().mockResolvedValue(),
                rollback: jest.fn().mockResolvedValue(),
                release: jest.fn(),
            };
            db.getConnection.mockResolvedValue(client);
        });

        it('should create member when email is new', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue(null);
            mockMemberRepo.create.mockResolvedValue({
                memberId: 9,
                email: 'n@n.com',
                memberName: 'N',
                password: 'hidden',
            });

            const out = await authService.register({
                email: 'n@n.com',
                password: 'Secret1!',
                memberName: 'N',
            });

            expect(out.memberId).toBe(9);
            expect(out.password).toBeUndefined();
            expect(client.commit).toHaveBeenCalled();
            expect(client.release).toHaveBeenCalled();
        });

        it('should throw when email exists', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue({ memberId: 1 });

            await expect(
                authService.register({ email: 'e@e.com', password: 'p' })
            ).rejects.toMatchObject({ errorCode: 'EMAIL_EXISTS' });
        });

        it('should rollback when create fails', async () => {
            mockMemberRepo.findByEmail.mockResolvedValue(null);
            mockMemberRepo.create.mockRejectedValue(new Error('db'));

            await expect(
                authService.register({ email: 'a@a.com', password: 'p', memberName: 'A' })
            ).rejects.toThrow('db');

            expect(client.rollback).toHaveBeenCalled();
        });
    });

    describe('changePassword', () => {
        it('should reject when current password wrong', async () => {
            mockMemberRepo.findById.mockResolvedValue({ memberId: 1, password: 'h' });
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

            await expect(authService.changePassword(1, 'old', 'new')).rejects.toMatchObject({
                errorCode: 'INVALID_CURRENT_PASSWORD',
            });
        });

        it('should update password and revoke tokens on success', async () => {
            mockMemberRepo.findById.mockResolvedValue({ memberId: 1, password: 'h' });
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);
            mockMemberRepo.updatePassword.mockResolvedValue();
            tokenRepository.revokeAllTokensByMember.mockResolvedValue();

            const out = await authService.changePassword(1, 'old', 'newPass1!');

            expect(out.success).toBe(true);
            expect(mockMemberRepo.updatePassword).toHaveBeenCalled();
            expect(tokenRepository.revokeAllTokensByMember).toHaveBeenCalledWith(1);
        });
    });

    describe('refreshToken', () => {
        afterEach(() => {
            if (jwt.verify.mockRestore) {
                jwt.verify.mockRestore();
            }
        });

        it('should reject when jwt.verify fails', async () => {
            jest.spyOn(jwt, 'verify').mockImplementation(() => {
                throw new Error('bad sig');
            });

            await expect(authService.refreshToken('t')).rejects.toMatchObject({
                errorCode: 'INVALID_TOKEN',
            });
        });

        it('should reject when token age exceeds grace period', async () => {
            jest.spyOn(jwt, 'verify').mockReturnValue({
                memberId: 1,
                jti: 'j',
                family: 'f',
                iat: Math.floor(Date.now() / 1000) - 999999999,
            });

            await expect(authService.refreshToken('t')).rejects.toMatchObject({
                errorCode: 'TOKEN_TOO_OLD',
            });
        });

        it('should revoke family when token revoked in DB', async () => {
            jest.spyOn(jwt, 'verify').mockReturnValue({
                memberId: 1,
                jti: 'j',
                family: 'fam',
                iat: Math.floor(Date.now() / 1000),
            });
            tokenRepository.isTokenRevoked.mockResolvedValue(true);
            tokenRepository.revokeTokenFamily.mockResolvedValue();

            await expect(authService.refreshToken('t')).rejects.toMatchObject({
                errorCode: 'TOKEN_REVOKED',
            });

            expect(tokenRepository.revokeTokenFamily).toHaveBeenCalledWith(1, 'fam');
        });

        it('should reject when member missing or inactive', async () => {
            jest.spyOn(jwt, 'verify').mockReturnValue({
                memberId: 1,
                jti: 'j',
                family: 'f',
                iat: Math.floor(Date.now() / 1000),
            });
            tokenRepository.isTokenRevoked.mockResolvedValue(false);
            mockMemberRepo.findById.mockResolvedValue(null);

            await expect(authService.refreshToken('t')).rejects.toMatchObject({
                errorCode: 'INVALID_MEMBER',
            });

            mockMemberRepo.findById.mockResolvedValue({ isActive: false });
            await expect(authService.refreshToken('t')).rejects.toMatchObject({
                errorCode: 'INVALID_MEMBER',
            });
        });

        it('should issue new token when refresh succeeds', async () => {
            jest.spyOn(jwt, 'verify').mockReturnValue({
                memberId: 2,
                jti: 'old',
                family: 'fam',
                iat: Math.floor(Date.now() / 1000),
            });
            tokenRepository.isTokenRevoked.mockResolvedValue(false);
            mockMemberRepo.findById.mockResolvedValue({
                memberId: 2,
                email: 'e@e.com',
                isActive: true,
            });
            tokenRepository.revokeToken.mockResolvedValue();
            tokenRepository.storeToken.mockResolvedValue(1);

            const out = await authService.refreshToken('t', 'ua', '9.9.9.9');

            expect(out.token).toBeDefined();
            expect(out.expiresIn).toBe(jwtConfig.token.expiresIn);
            expect(tokenRepository.revokeToken).toHaveBeenCalledWith('old');
            expect(tokenRepository.storeToken).toHaveBeenCalled();
        });
    });

    describe('logout', () => {
        it('should revoke token when jti present', async () => {
            const token = authService.generateToken(1, 'a@b.com', 'f', authService.generateJTI());
            tokenRepository.revokeToken.mockResolvedValue();

            const result = await authService.logout(token);

            expect(result.success).toBe(true);
            expect(tokenRepository.revokeToken).toHaveBeenCalled();
        });

        it('should succeed without revoking when decode has no jti', async () => {
            jest.spyOn(jwt, 'decode').mockReturnValue({ sub: 1 });

            const result = await authService.logout('not-a-real-jwt');

            expect(result.success).toBe(true);
            expect(tokenRepository.revokeToken).not.toHaveBeenCalled();

            jwt.decode.mockRestore();
        });

        it('should still succeed when revoke throws', async () => {
            const token = authService.generateToken(1, 'a@b.com', 'f', authService.generateJTI());
            tokenRepository.revokeToken.mockRejectedValue(new Error('db'));

            await expect(authService.logout(token)).resolves.toEqual({ success: true });
        });
    });

    describe('logoutAllDevices', () => {
        it('should revoke all tokens for member', async () => {
            tokenRepository.revokeAllTokensByMember.mockResolvedValue();

            const result = await authService.logoutAllDevices(3);

            expect(result.success).toBe(true);
            expect(tokenRepository.revokeAllTokensByMember).toHaveBeenCalledWith(3);
        });
    });

    describe('getActiveSessions', () => {
        it('should delegate to token repository', async () => {
            const rows = [{ id: 1 }];
            tokenRepository.findActiveByMember.mockResolvedValue(rows);

            await expect(authService.getActiveSessions(1)).resolves.toEqual(rows);
        });
    });
});
