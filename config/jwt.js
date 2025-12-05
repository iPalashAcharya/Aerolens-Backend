require('dotenv').config();

module.exports = {
    token: {
        secret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_EXPIRY || '15m',
        algorithm: 'HS256',
        issuer: 'aerolens-hr-management-system',
        audience: 'hr-app-users',
        refreshGracePeriod: 7 * 24 * 60 * 60
    },
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
};