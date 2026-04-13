let jwtStrategyVerify;

jest.mock('passport-jwt', () => ({
    Strategy: function JwtStrategy(opts, verify) {
        jwtStrategyVerify = verify;
    },
    ExtractJwt: {
        fromAuthHeaderAsBearerToken: jest.fn(() => 'extractor'),
    },
}));

jest.mock('passport', () => ({
    use: jest.fn(),
}));

jest.mock('../../config/jwt', () => ({
    token: {
        secret: 'unit-test-secret',
        algorithm: 'HS256',
    },
}));

const mockIsTokenRevoked = jest.fn();
const mockFindById = jest.fn();

jest.mock('../../repositories/tokenRepository', () => ({
    isTokenRevoked: (...args) => mockIsTokenRevoked(...args),
}));

jest.mock('../../repositories/memberRepository', () => ({
    findById: (...args) => mockFindById(...args),
}));

require('../../config/passport');

describe('passport JWT strategy', () => {
    const basePayload = () => ({
        memberId: 42,
        jti: 'jti-1',
        family: 'fam-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects when token structure is incomplete', async () => {
        const done = jest.fn();
        await jwtStrategyVerify({ memberId: 1 }, done);

        expect(done).toHaveBeenCalledWith(null, false, { message: 'Invalid token structure' });
    });

    it('rejects revoked token', async () => {
        mockIsTokenRevoked.mockResolvedValue(true);
        const done = jest.fn();

        await jwtStrategyVerify(basePayload(), done);

        expect(done).toHaveBeenCalledWith(null, false, { message: 'Token has been revoked' });
    });

    it('rejects expired token', async () => {
        mockIsTokenRevoked.mockResolvedValue(false);
        const done = jest.fn();
        const payload = {
            ...basePayload(),
            exp: Math.floor(Date.now() / 1000) - 10,
        };

        await jwtStrategyVerify(payload, done);

        expect(done).toHaveBeenCalledWith(null, false, { message: 'Token expired' });
    });

    it('rejects when member missing', async () => {
        mockIsTokenRevoked.mockResolvedValue(false);
        mockFindById.mockResolvedValue(null);
        const done = jest.fn();

        await jwtStrategyVerify(basePayload(), done);

        expect(done).toHaveBeenCalledWith(null, false, { message: 'Member not found' });
    });

    it('rejects inactive member', async () => {
        mockIsTokenRevoked.mockResolvedValue(false);
        mockFindById.mockResolvedValue({ memberId: 42, isActive: 0 });
        const done = jest.fn();

        await jwtStrategyVerify(basePayload(), done);

        expect(done).toHaveBeenCalledWith(null, false, { message: 'Account is inactive' });
    });

    it('returns user object for valid token', async () => {
        mockIsTokenRevoked.mockResolvedValue(false);
        mockFindById.mockResolvedValue({
            memberId: 42,
            email: 'a@b.com',
            designation: 'HR',
            isRecruiter: true,
            isActive: 1,
        });
        const done = jest.fn();

        await jwtStrategyVerify(basePayload(), done);

        expect(done).toHaveBeenCalledWith(null, {
            memberId: 42,
            email: 'a@b.com',
            designation: 'HR',
            isRecruiter: true,
            tokenFamily: 'fam-1',
            jti: 'jti-1',
        });
    });

    it('passes errors to done', async () => {
        mockIsTokenRevoked.mockRejectedValue(new Error('db down'));
        const done = jest.fn();

        await jwtStrategyVerify(basePayload(), done);

        expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });
});
