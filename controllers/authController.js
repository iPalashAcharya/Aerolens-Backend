const authService = require('../services/authServices');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');

class AuthController {
    async register(req, res, next) {
        try {
            console.log("BODY:", req.body);
            const memberData = req.body;
            const newMember = await authService.register(memberData);

            return ApiResponse.success(
                res,
                { member: newMember },
                'Registration successful',
                201
            );
        } catch (error) {
            next(error);
        }
    }

    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip || req.connection.remoteAddress;

            const result = await authService.login(email, password, userAgent, ipAddress);

            return ApiResponse.success(
                res,
                result,
                'Login successful',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    async refreshToken(req, res, next) {
        try {
            // ONLY extract token from Authorization header (best practice)
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw new AppError('Token not provided in Authorization header', 401, 'TOKEN_MISSING');
            }

            const token = authHeader.replace('Bearer ', '');

            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip || req.connection.remoteAddress;

            const result = await authService.refreshToken(token, userAgent, ipAddress);

            return ApiResponse.success(
                res,
                result,
                'Token refreshed successfully',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    async logout(req, res, next) {
        try {
            // ONLY extract token from Authorization header (best practice)
            const authHeader = req.headers.authorization;

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.replace('Bearer ', '');
                await authService.logout(token);
            }

            return ApiResponse.success(
                res,
                null,
                'Logout successful',
                200
            );
        } catch (error) {
            // Always return success for logout (even if token invalid)
            return ApiResponse.success(res, null, 'Logout successful', 200);
        }
    }

    async logoutAllDevices(req, res, next) {
        try {
            const memberId = req.user.memberId;
            await authService.logoutAllDevices(memberId);

            return ApiResponse.success(
                res,
                null,
                'Logged out from all devices successfully',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    async getActiveSessions(req, res, next) {
        try {
            const memberId = req.user.memberId;
            const sessions = await authService.getActiveSessions(memberId);

            return ApiResponse.success(
                res,
                { sessions },
                'Active sessions retrieved successfully',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    async getProfile(req, res, next) {
        try {
            return ApiResponse.success(
                res,
                { member: req.user },
                'Profile retrieved successfully',
                200
            );
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();