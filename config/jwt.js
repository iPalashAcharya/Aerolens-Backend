require('dotenv').config();

module.exports = {
    access: {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        algorithm: 'HS256'
    },
    refresh: {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
        algorithm: 'HS256'
    },
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only over HTTPS in production
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
};