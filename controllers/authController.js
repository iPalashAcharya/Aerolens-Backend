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

            // Set refresh token in httpOnly cookie
            res.cookie('refreshToken', result.refreshToken, jwtConfig.cookieOptions);

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
                    accessToken: result.accessToken,
                    expiresIn: jwtConfig.access.expiresIn
                },
                'Login successful',
                200
            );
        } catch (error) {
            next(error);
        }
    }

    async refreshToken(req, res, next) {
        try {
            // Get refresh token from cookie or body
            const refreshToken =
                (req.cookies && req.cookies.refreshToken) ||
                (req.body && req.body.refreshToken);

            if (!refreshToken) {
                throw new AppError('Refresh token not provided', 401, 'TOKEN_MISSING');
            }

            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip || req.connection.remoteAddress;

            const result = await authService.refreshAccessToken(refreshToken, userAgent, ipAddress);

            // Set new refresh token in httpOnly cookie
            res.cookie('refreshToken', result.refreshToken, jwtConfig.cookieOptions);

            return ApiResponse.success(
                res,
                {
                    accessToken: result.accessToken,
                    expiresIn: jwtConfig.access.expiresIn
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
            const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (refreshToken) {
                await authService.logout(refreshToken);
            }

            // Clear refresh token cookie
            res.clearCookie('refreshToken', jwtConfig.cookieOptions);

            return ApiResponse.success(
                res,
                null,
                'Logout successful',
                200
            );
        } catch (error) {
            res.clearCookie('refreshToken', jwtConfig.cookieOptions);
            return ApiResponse.success(res, null, 'Logout successful', 200);
        }
    }

    async logoutAllDevices(req, res, next) {
        try {
            const memberId = req.user.memberId;

            await authService.logoutAllDevices(memberId);

            // Clear refresh token cookie
            res.clearCookie('refreshToken', jwtConfig.cookieOptions);

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
            // req.user is populated by passport authenticate middleware
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