const AppError = require('../../utils/appError');

describe('AppError', () => {
    it('sets message, statusCode, errorCode, details', () => {
        const err = new AppError('msg', 422, 'CODE_X', { a: 1 });

        expect(err.message).toBe('msg');
        expect(err.statusCode).toBe(422);
        expect(err.errorCode).toBe('CODE_X');
        expect(err.details).toEqual({ a: 1 });
        expect(err.isOperational).toBe(true);
    });

    it('allows optional errorCode and details', () => {
        const err = new AppError('m', 500);

        expect(err.errorCode).toBeNull();
        expect(err.details).toBeNull();
    });
});
