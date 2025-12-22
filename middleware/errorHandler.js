const AppError = require('../utils/appError');
const ApiResponse = require('../utils/response');

const globalErrorHandler = (err, req, res, next) => {
    // Centralized logging (safe for prod)
    console.error('Error occurred:', {
        message: err.message,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });

    // Normalize non-AppError errors
    const error = err instanceof AppError
        ? err
        : new AppError(
            'Something went wrong',
            500,
            'INTERNAL_SERVER_ERROR'
        );

    return ApiResponse.error(res, error);
};

module.exports = globalErrorHandler;