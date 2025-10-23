const jwt = require('jsonwebtoken');
const jwtConfig = require('../../config/jwt');

class TestHelpers {
    static generateAccessToken(memberId = 1, email = 'test@example.com', tokenFamily = 'test-family') {
        return jwt.sign(
            { memberId, email, tokenFamily, type: 'access' },
            jwtConfig.access.secret,
            {
                expiresIn: jwtConfig.access.expiresIn,
                algorithm: jwtConfig.access.algorithm,
                issuer: 'hr-management-system',
                audience: 'hr-app-users'
            }
        );
    }

    static generateRefreshToken(memberId = 1, tokenFamily = 'test-family') {
        return jwt.sign(
            { memberId, tokenFamily, type: 'refresh' },
            jwtConfig.refresh.secret,
            {
                expiresIn: jwtConfig.refresh.expiresIn,
                algorithm: jwtConfig.refresh.algorithm,
                issuer: 'hr-management-system',
                audience: 'hr-app-users'
            }
        );
    }

    static generateExpiredToken(memberId = 1, type = 'access') {
        const secret = type === 'access' ? jwtConfig.access.secret : jwtConfig.refresh.secret;
        const algorithm = type === 'access' ? jwtConfig.access.algorithm : jwtConfig.refresh.algorithm;

        return jwt.sign(
            { memberId, tokenFamily: 'test-family', type },
            secret,
            {
                expiresIn: '-1d',
                algorithm,
                issuer: 'hr-management-system',
                audience: 'hr-app-users'
            }
        );
    }

    static createMockMember(overrides = {}) {
        return {
            memberId: 1,
            memberName: 'Test User',
            memberContact: '+1234567890',
            email: 'test@example.com',
            password: '$2b$12$mockedhashedpassword',
            designation: 'DEV',
            isRecruiter: false,
            isActive: true,
            lastLogin: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        };
    }

    static createMockConnection() {
        return {
            execute: jest.fn(),
            release: jest.fn()
        };
    }

    static createMockRefreshToken(overrides = {}) {
        return {
            id: 1,
            memberId: 1,
            tokenHash: 'mockedtokenhash',
            tokenFamily: 'test-family',
            userAgent: 'Mozilla/5.0',
            ipAddress: '192.168.1.1',
            issuedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            isRevoked: false,
            ...overrides
        };
    }
}

module.exports = TestHelpers;