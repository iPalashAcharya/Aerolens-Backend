const passport = require('../config/passport');
const AppError = require('../utils/appError');
const rateLimit = require('express-rate-limit');

// JWT Authentication Middleware
const authenticate = (req, res, next) => {
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
        if (err) {
            return next(err);
        }

        if (!user) {
            const message = info?.message || 'Authentication failed';
            return next(new AppError(message, 401, 'AUTHENTICATION_FAILED'));
        }

        // Attach user to request object
        req.user = user;
        next();
    })(req, res, next);
};

// Optional: Role-based authorization middleware
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED'));
        }

        if (!allowedRoles.includes(req.user.designation)) {
            return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
        }

        next();
    };
};

// Rate limiting for authentication endpoints
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts. Please try again after 15 minutes.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

const refreshRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many token refresh attempts. Please login again.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    authenticate,
    authorize,
    loginRateLimiter,
    refreshRateLimiter
};