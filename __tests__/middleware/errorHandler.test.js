const globalErrorHandler = require('../../middleware/errorHandler');
const AppError = require('../../utils/appError');
const ApiResponse = require('../../utils/response');

jest.mock('../../utils/response', () => ({
    error: jest.fn((res, err, code) => {
        res.status(code).json({ mocked: true, err });
    }),
}));

describe('globalErrorHandler', () => {
    const req = { url: '/x', method: 'GET', headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.NODE_ENV;
    });

    it('uses ApiResponse.error for operational AppError', () => {
        const err = new AppError('op', 422, 'X');
        err.isOperational = true;
        err.statusCode = 422;

        globalErrorHandler(err, req, res, next);

        expect(ApiResponse.error).toHaveBeenCalledWith(res, err, 422);
    });

    it('maps to generic AppError in production for non-operational errors', () => {
        process.env.NODE_ENV = 'production';
        const err = new Error('secret');

        globalErrorHandler(err, req, res, next);

        expect(ApiResponse.error).toHaveBeenCalled();
        const passed = ApiResponse.error.mock.calls[0][1];
        expect(passed.message).toBe('Something went wrong!');
        expect(passed.errorCode).toBe('INTERNAL_SERVER_ERROR');
    });

    it('passes through original error in non-production', () => {
        process.env.NODE_ENV = 'development';
        const err = new Error('dev');

        globalErrorHandler(err, req, res, next);

        expect(ApiResponse.error.mock.calls[0][1]).toBe(err);
    });
});
