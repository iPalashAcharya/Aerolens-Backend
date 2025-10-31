require('dotenv').config();

module.exports = {
    token: {
        secret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_EXPIRY || '2h', // Single token with moderate lifetime
        algorithm: 'HS256'
    },
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    // Optional: Keep for backward compatibility with existing cookies
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 2 * 60 * 60 * 1000 // 2 hours to match token expiry
    }
};