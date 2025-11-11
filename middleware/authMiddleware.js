const authService = require('../services/authServices');
const memberRepository = require('../repositories/memberRepository');
const AppError = require('../utils/appError');
const rateLimit = require('express-rate-limit');

// JWT Authentication Middleware
const authenticate = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('Authentication token required', 401, 'TOKEN_MISSING');
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify token (checks signature, expiration, and revocation)
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
            memberName: member.memberName,
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

const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED'));
        }

        const allowed = allowedRoles
            .map(role => role.toLowerCase())
            .includes(req.user.designation.toLowerCase());

        if (allowed) {
            return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
        }

        next();
    };
};

// Rate limiting for login
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts
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
            retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
        });
    }
});

// Rate limiting for refresh token
const refreshRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 refresh attempts
    message: {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many token refresh attempts. Please login again.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting for registration
const registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many registration attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    authenticate,
    authorize,
    loginRateLimiter,
    refreshRateLimiter,
    registerRateLimiter
};