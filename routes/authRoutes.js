const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const AuthValidator = require('../validators/authValidator');
const env = require('dotenv');
env.config();
const {
    authorize,
    authenticate,
    loginRateLimiter,
    refreshRateLimiter,
    registerRateLimiter
} = require('../middleware/authMiddleware');

router.post('/register',
    authenticate,
    authorize(process.env.ALLOWED_ROLES),
    registerRateLimiter,
    AuthValidator.validateRegister,
    authController.register
);

router.post('/login',
    loginRateLimiter,
    AuthValidator.validateLogin,
    authController.login
);

router.post('/refresh',
    refreshRateLimiter,
    authController.refreshToken
);

router.post('/logout',
    authController.logout
);

// Protected routes
router.post('/logout-all',
    authenticate,
    authController.logoutAllDevices
);

router.get('/sessions',
    authenticate,
    authController.getActiveSessions
);

router.get('/profile',
    authenticate,
    authController.getProfile
);

module.exports = router;