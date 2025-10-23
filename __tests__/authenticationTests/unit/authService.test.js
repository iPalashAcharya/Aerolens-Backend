const authService = require('../../../services/authServices');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const jwtConfig = require('../../../config/jwt');
const memberRepository = require('../../../repositories/memberRepository');
const refreshTokenRepository = require('../../../repositories/refreshTokenRepository');

jest.mock('../../../repositories/memberRepository');
jest.mock('../../../repositories/refreshTokenRepository');

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
            expect(hash.startsWith('$2b$')).toBe(true);
        });

        it('should compare password correctly', async () => {
            const password = 'TestPassword123!';
            const hash = await bcrypt.hash(password, 10);

            const isValid = await authService.comparePassword(password, hash);
            expect(isValid).toBe(true);

            const isInvalid = await authService.comparePassword('WrongPassword', hash);
            expect(isInvalid).toBe(false);
        });
    });

    describe('Token Generation', () => {
        it('should generate valid access token with correct payload', () => {
            const token = authService.generateAccessToken(1, 'test@example.com', 'family-123');
            const decoded = jwt.verify(token, jwtConfig.access.secret);

            expect(decoded.memberId).toBe(1);
            expect(decoded.email).toBe('test@example.com');
            expect(decoded.tokenFamily).toBe('family-123');
            expect(decoded.type).toBe('access');
        });

        it('should generate valid refresh token with correct payload', () => {
            const token = authService.generateRefreshToken(1, 'family-123');
            const decoded = jwt.verify(token, jwtConfig.refresh.secret);

            expect(decoded.memberId).toBe(1);
            expect(decoded.tokenFamily).toBe('family-123');
            expect(decoded.type).toBe('refresh');
        });

        it('should generate unique token families', () => {
            const families = new Set();
            for (let i = 0; i < 100; i++) {
                families.add(authService.generateTokenFamily());
            }
            expect(families.size).toBe(100);
        });
    });

    describe('Token Verification', () => {
        it('should verify valid access token', () => {
            const token = authService.generateAccessToken(1, 'test@example.com', 'family');
            const decoded = authService.verifyAccessToken(token);

            expect(decoded).toBeDefined();
            expect(decoded.memberId).toBe(1);
        });

        it('should reject invalid access token', () => {
            expect(() => {
                authService.verifyAccessToken('invalid.token.here');
            }).toThrow();
        });

        it('should reject expired access token', () => {
            const expiredToken = jwt.sign(
                { memberId: 1, email: 'test@example.com', tokenFamily: 'family', type: 'access' },
                jwtConfig.access.secret,
                { expiresIn: '-1h', algorithm: 'HS256' }
            );

            expect(() => {
                authService.verifyAccessToken(expiredToken);
            }).toThrow();
        });
    });

    describe('Token Hashing', () => {
        it('should hash refresh token consistently', () => {
            const token = 'test-refresh-token';
            const hash1 = authService.hashRefreshToken(token);
            const hash2 = authService.hashRefreshToken(token);

            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64);
        });

        it('should produce different hashes for different tokens', () => {
            const hash1 = authService.hashRefreshToken('token1');
            const hash2 = authService.hashRefreshToken('token2');

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('Registration', () => {
        it('should register new member successfully', async () => {
            memberRepository.findByEmail.mockResolvedValue(null);
            memberRepository.create.mockResolvedValue({
                memberId: 1,
                memberName: 'John Doe',
                email: 'john@example.com',
                designation: 'DEV'
            });

            const result = await authService.register({
                memberName: 'John Doe',
                email: 'john@example.com',
                password: 'Test@1234',
                designation: 'DEV'
            });

            expect(result).toBeDefined();
            expect(result.password).toBeUndefined();
            expect(memberRepository.create).toHaveBeenCalled();
        });

        it('should throw error if email exists', async () => {
            memberRepository.findByEmail.mockResolvedValue({ memberId: 1 });

            await expect(authService.register({
                email: 'existing@example.com',
                password: 'Test@1234'
            })).rejects.toThrow('Email already registered');
        });
    });

    describe('Login', () => {
        const mockMember = {
            memberId: 1,
            memberName: 'John Doe',
            email: 'john@example.com',
            password: '$2b$12$hashedpassword',
            isActive: true
        };

        it('should login successfully', async () => {
            memberRepository.findByEmail.mockResolvedValue(mockMember);
            memberRepository.updateLastLogin.mockResolvedValue();
            refreshTokenRepository.create.mockResolvedValue(1);
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);

            const result = await authService.login('john@example.com', 'Test@1234', 'Mozilla', '127.0.0.1');

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result).toHaveProperty('member');
            expect(result.member.password).toBeUndefined();
        });

        it('should throw error for non-existent member', async () => {
            memberRepository.findByEmail.mockResolvedValue(null);

            await expect(
                authService.login('notfound@example.com', 'password', 'Mozilla', '127.0.0.1')
            ).rejects.toThrow('Invalid credentials');
        });

        it('should throw error for inactive account', async () => {
            memberRepository.findByEmail.mockResolvedValue({
                ...mockMember,
                isActive: false
            });

            await expect(
                authService.login('john@example.com', 'password', 'Mozilla', '127.0.0.1')
            ).rejects.toThrow('Account is inactive');
        });

        it('should throw error for invalid password', async () => {
            memberRepository.findByEmail.mockResolvedValue(mockMember);
            jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

            await expect(
                authService.login('john@example.com', 'wrongpassword', 'Mozilla', '127.0.0.1')
            ).rejects.toThrow('Invalid credentials');
        });
    });

    describe('Logout', () => {
        it('should logout successfully', async () => {
            const token = 'test-refresh-token';
            const tokenHash = authService.hashRefreshToken(token);

            refreshTokenRepository.findByHash.mockResolvedValue({
                id: 1,
                tokenHash
            });
            refreshTokenRepository.revokeToken.mockResolvedValue();

            const result = await authService.logout(token);

            expect(result.success).toBe(true);
            expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith(1);
        });

        it('should handle logout gracefully when token not found', async () => {
            refreshTokenRepository.findByHash.mockResolvedValue(null);

            const result = await authService.logout('non-existent-token');

            expect(result.success).toBe(true);
        });

        it('should handle logout errors gracefully', async () => {
            refreshTokenRepository.findByHash.mockRejectedValue(new Error('DB Error'));

            const result = await authService.logout('token');

            expect(result.success).toBe(true);
        });
    });

    describe('Logout All Devices', () => {
        it('should revoke all tokens for member', async () => {
            refreshTokenRepository.revokeAllTokensByMember.mockResolvedValue();

            const result = await authService.logoutAllDevices(1);

            expect(result.success).toBe(true);
            expect(refreshTokenRepository.revokeAllTokensByMember).toHaveBeenCalledWith(1);
        });
    });

    describe('Get Active Sessions', () => {
        it('should retrieve active sessions', async () => {
            const mockSessions = [
                { id: 1, userAgent: 'Mozilla', ipAddress: '127.0.0.1' },
                { id: 2, userAgent: 'Chrome', ipAddress: '192.168.1.1' }
            ];
            refreshTokenRepository.findActiveByMember.mockResolvedValue(mockSessions);

            const result = await authService.getActiveSessions(1);

            expect(result).toEqual(mockSessions);
            expect(result).toHaveLength(2);
        });
    });
});