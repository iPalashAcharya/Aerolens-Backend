const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const AuthValidator = require('../validators/authValidator');
const { authenticate, loginRateLimiter, refreshRateLimiter } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', AuthValidator.validateRegister, authController.register);
router.post('/login', loginRateLimiter, AuthValidator.validateLogin, authController.login);

// Optional: Token refresh endpoint (for clients that want to renew tokens before expiry)
router.post('/refresh', refreshRateLimiter, AuthValidator.validateToken, authController.refreshToken);

router.post('/logout', authController.logout);

// Protected routes
router.post('/logout-all', authenticate, authController.logoutAllDevices);
router.get('/sessions', authenticate, authController.getActiveSessions);
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;