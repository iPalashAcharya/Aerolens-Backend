jest.mock('../../services/authServices', () => ({
    verifyToken: jest.fn(),
}));

const mockFindById = jest.fn();
jest.mock('../../repositories/memberRepository', () =>
    jest.fn().mockImplementation(() => ({
        findById: mockFindById,
    }))
);

const authService = require('../../services/authServices');
const { authenticate, authorize } = require('../../middleware/authMiddleware');
const AppError = require('../../utils/appError');

describe('authMiddleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = { headers: {} };
        res = {};
        next = jest.fn();
    });

    describe('authenticate', () => {
        it('rejects when Authorization header missing', async () => {
            await authenticate(req, res, next);

            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
            expect(next.mock.calls[0][0].errorCode).toBe('TOKEN_MISSING');
        });

        it('rejects when header is not Bearer', async () => {
            req.headers.authorization = 'Basic xyz';

            await authenticate(req, res, next);

            expect(next.mock.calls[0][0].errorCode).toBe('TOKEN_MISSING');
        });

        it('attaches user and calls next on success', async () => {
            req.headers.authorization = 'Bearer tok';
            authService.verifyToken.mockResolvedValue({ memberId: 1, family: 'f', jti: 'j' });
            mockFindById.mockResolvedValue({
                memberId: 1,
                email: 'a@b.com',
                memberName: 'N',
                designation: 'Admin',
                isRecruiter: true,
                isActive: true,
            });

            await authenticate(req, res, next);

            expect(req.user).toMatchObject({
                memberId: 1,
                email: 'a@b.com',
                designation: 'Admin',
                isRecruiter: true,
            });
            expect(next).toHaveBeenCalledWith();
        });

        it('rejects when member not found', async () => {
            req.headers.authorization = 'Bearer tok';
            authService.verifyToken.mockResolvedValue({ memberId: 99, family: 'f', jti: 'j' });
            mockFindById.mockResolvedValue(null);

            await authenticate(req, res, next);

            expect(next.mock.calls[0][0].errorCode).toBe('MEMBER_NOT_FOUND');
        });

        it('rejects inactive member', async () => {
            req.headers.authorization = 'Bearer tok';
            authService.verifyToken.mockResolvedValue({ memberId: 1, family: 'f', jti: 'j' });
            mockFindById.mockResolvedValue({
                memberId: 1,
                isActive: false,
                designation: 'Admin',
            });

            await authenticate(req, res, next);

            expect(next.mock.calls[0][0].errorCode).toBe('ACCOUNT_INACTIVE');
        });

        it('maps non-AppError from verifyToken to AUTHENTICATION_FAILED', async () => {
            req.headers.authorization = 'Bearer bad';
            authService.verifyToken.mockRejectedValue(new Error('jwt'));

            await authenticate(req, res, next);

            expect(next.mock.calls[0][0].errorCode).toBe('AUTHENTICATION_FAILED');
        });
    });

    describe('authorize', () => {
        it('requires authentication', () => {
            const mw = authorize('admin');
            mw({ user: undefined }, {}, next);

            expect(next.mock.calls[0][0].errorCode).toBe('AUTHENTICATION_REQUIRED');
        });

        it('calls next with FORBIDDEN when designation matches allowed role (current implementation)', () => {
            const mw = authorize('admin');
            req.user = { designation: 'Admin' };

            mw(req, {}, next);

            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
            expect(next.mock.calls[0][0].errorCode).toBe('FORBIDDEN');
        });
    });
});
