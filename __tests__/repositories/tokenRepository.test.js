jest.mock('../../db');

const db = require('../../db');
const tokenRepository = require('../../repositories/tokenRepository');

describe('tokenRepository', () => {
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            execute: jest.fn(),
            release: jest.fn(),
        };
        db.getConnection.mockResolvedValue(mockConn);
    });

    describe('storeToken', () => {
        it('returns insertId on success', async () => {
            mockConn.execute.mockResolvedValue([{ insertId: 42 }]);

            const id = await tokenRepository.storeToken({
                memberId: 1,
                jti: 'jti',
                tokenFamily: 'fam',
                userAgent: 'ua',
                ipAddress: '1.1.1.1',
                expiresAt: new Date(),
            });

            expect(id).toBe(42);
            expect(mockConn.release).toHaveBeenCalled();
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(
                tokenRepository.storeToken({
                    memberId: 1,
                    jti: 'j',
                    tokenFamily: 'f',
                    userAgent: 'u',
                    ipAddress: '0.0.0.0',
                    expiresAt: new Date(),
                })
            ).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('isTokenRevoked', () => {
        it('returns false when row missing', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            await expect(tokenRepository.isTokenRevoked('x')).resolves.toBe(false);
        });

        it('returns true when isRevoked is 1', async () => {
            mockConn.execute.mockResolvedValue([[{ isRevoked: 1 }]]);

            await expect(tokenRepository.isTokenRevoked('x')).resolves.toBe(true);
        });

        it('returns false when isRevoked is 0', async () => {
            mockConn.execute.mockResolvedValue([[{ isRevoked: 0 }]]);

            await expect(tokenRepository.isTokenRevoked('x')).resolves.toBe(false);
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(tokenRepository.isTokenRevoked('x')).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('revokeToken', () => {
        it('executes update and releases', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await tokenRepository.revokeToken('jti');

            expect(mockConn.execute).toHaveBeenCalled();
            expect(mockConn.release).toHaveBeenCalled();
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(tokenRepository.revokeToken('j')).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('revokeTokenFamily', () => {
        it('executes batch revoke', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 2 }]);

            await tokenRepository.revokeTokenFamily(1, 'fam');

            expect(mockConn.release).toHaveBeenCalled();
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(tokenRepository.revokeTokenFamily(1, 'f')).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('revokeAllTokensByMember', () => {
        it('executes update for member', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 3 }]);

            await tokenRepository.revokeAllTokensByMember(9);

            expect(mockConn.release).toHaveBeenCalled();
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(tokenRepository.revokeAllTokensByMember(1)).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('findActiveByMember', () => {
        it('returns rows', async () => {
            const rows = [{ id: 1, jti: 'a' }];
            mockConn.execute.mockResolvedValue([rows]);

            await expect(tokenRepository.findActiveByMember(1)).resolves.toEqual(rows);
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(tokenRepository.findActiveByMember(1)).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('cleanupExpiredTokens', () => {
        it('returns affectedRows', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 5 }]);

            await expect(tokenRepository.cleanupExpiredTokens()).resolves.toBe(5);
        });

        it('wraps DB errors in AppError', async () => {
            const AppError = require('../../utils/appError');
            mockConn.execute.mockRejectedValue(new Error('db fail'));

            await expect(tokenRepository.cleanupExpiredTokens()).rejects.toBeInstanceOf(AppError);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });
});
