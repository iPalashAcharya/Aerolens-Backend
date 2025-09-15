const AppError = require('../utils/appError');
const ApiResponse = require('../utils/response');

const globalErrorHandler = (err, req, res, next) => {
    // Log error for debugging
    console.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });

    // Operational errors (known errors)
    if (err.isOperational) {
        return ApiResponse.error(res, err, err.statusCode);
    }

    // Programming errors (unknown errors)
    // Don't leak error details in production
    const error = process.env.NODE_ENV === 'production'
        ? new AppError('Something went wrong!', 500, 'INTERNAL_SERVER_ERROR')
        : err;

    return ApiResponse.error(res, error, 500);
};

module.exports = globalErrorHandler;