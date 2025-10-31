const authService = require('../services/authServices');
const memberRepository = require('../repositories/memberRepository');
const AppError = require('../utils/appError');
const rateLimit = require('express-rate-limit');

// JWT Authentication Middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('Authentication token required', 401, 'TOKEN_MISSING');
        }

        const token = authHeader.replace('Bearer ', '');
        const decoded = await authService.verifyToken(token);

        // Fetch full member details
        const member = await memberRepository.findById(decoded.memberId);

        if (!member) {
            throw new AppError('Member not found', 401, 'MEMBER_NOT_FOUND');
        }

        if (!member.isActive) {
            throw new AppError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
        }

        // Attach user to request
        req.user = {
            memberId: member.memberId,
            email: member.email,
            designation: member.designation,
            isRecruiter: member.isRecruiter,
            tokenFamily: decoded.family,
            jti: decoded.jti
        };

        next();
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError('Authentication failed', 401, 'AUTHENTICATION_FAILED'));
    }
};

// Role-based authorization middleware
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

// Rate limiting
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