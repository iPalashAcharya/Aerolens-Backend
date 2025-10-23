const request = require('supertest');
const app = require('../../../appForTest');
const memberRepository = require('../../../repositories/memberRepository');
const refreshTokenRepository = require('../../../repositories/refreshTokenRepository');
const authService = require('../../../services/authServices');

jest.mock('../../../repositories/memberRepository');
jest.mock('../../../repositories/refreshTokenRepository');

describe('Token Rotation Integration Tests', () => {
    const mockMember = {
        memberId: 1,
        email: 'test@example.com',
        isActive: true
    };

    beforeEach(() => {
        jest.clearAllMocks();
        memberRepository.findById.mockResolvedValue(mockMember);
    });

    it('should rotate tokens on refresh', async () => {
        const tokenFamily = authService.generateTokenFamily();
        const refreshToken = authService.generateRefreshToken(1, tokenFamily);
        const tokenHash = authService.hashRefreshToken(refreshToken);

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

        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken });

        expect(res.status).toBe(200);
        expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith(1);
        expect(refreshTokenRepository.create).toHaveBeenCalled();
    });

    it('should detect and prevent token reuse', async () => {
        const tokenFamily = authService.generateTokenFamily();
        const oldToken = authService.generateRefreshToken(1, tokenFamily);

        refreshTokenRepository.findByMemberAndHash.mockResolvedValue(null);
        refreshTokenRepository.findByTokenFamily.mockResolvedValue(true);
        refreshTokenRepository.revokeTokenFamily.mockResolvedValue();

        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken: oldToken });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('TOKEN_REUSE_DETECTED');
        expect(refreshTokenRepository.revokeTokenFamily).toHaveBeenCalledWith(1, tokenFamily);
    });
});