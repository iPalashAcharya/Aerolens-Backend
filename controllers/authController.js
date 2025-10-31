const authService = require('../services/authServices');
const ApiResponse = require('../utils/response');
const AppError = require('../utils/appError');
const jwtConfig = require('../config/jwt');

class AuthController {
    async register(req, res, next) {
        try {
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
                {
                    member: {
                        memberId: result.member.memberId,
                        memberName: result.member.memberName,
                        email: result.member.email,
                        designation: result.member.designation,
                        isRecruiter: result.member.isRecruiter
                    },
                    token: result.token,
                    expiresIn: result.expiresIn
                },
                'Login successful',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    // Optional: Refresh/renew token endpoint
    async refreshToken(req, res, next) {
        try {
            const token = req.body.token || req.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                throw new AppError('Token not provided', 401, 'TOKEN_MISSING');
            }

            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip || req.connection.remoteAddress;

            const result = await authService.refreshToken(token, userAgent, ipAddress);

            return ApiResponse.success(
                res,
                {
                    token: result.token,
                    expiresIn: result.expiresIn
                },
                'Token refreshed successfully',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    async logout(req, res, next) {
        try {
            const token = req.headers.authorization?.replace('Bearer ', '') || req.body.token;

            if (token) {
                await authService.logout(token);
            }

            return ApiResponse.success(
                res,
                null,
                'Logout successful',
                200
            );
        } catch (error) {
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