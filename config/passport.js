const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const jwtConfig = require('./jwt');
const memberRepository = require('../repositories/memberRepository');
const tokenRepository = require('../repositories/tokenRepository');

// JWT Strategy Configuration - Single Token
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Extract from Authorization header
    secretOrKey: jwtConfig.token.secret, // Changed from jwtConfig.access.secret
    algorithms: [jwtConfig.token.algorithm], // Changed from jwtConfig.access.algorithm
    ignoreExpiration: false,
    passReqToCallback: false
};

// Single JWT Strategy (replaces both 'jwt' and 'jwt-refresh' strategies)
passport.use('jwt', new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
        // Validate token structure - now includes JTI
        if (!jwtPayload.memberId || !jwtPayload.jti || !jwtPayload.family) {
            return done(null, false, { message: 'Invalid token structure' });
        }

        // Check if token is revoked (important for logout functionality)
        const isRevoked = await tokenRepository.isTokenRevoked(jwtPayload.jti);
        if (isRevoked) {
            return done(null, false, { message: 'Token has been revoked' });
        }

        // Expiration check (passport-jwt handles this, but keeping for explicitness)
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (jwtPayload.exp && jwtPayload.exp < currentTimestamp) {
            return done(null, false, { message: 'Token expired' });
        }

        // Fetch member details
        const member = await memberRepository.findById(jwtPayload.memberId);
        if (!member) {
            return done(null, false, { message: 'Member not found' });
        }

        if (!member.isActive) {
            return done(null, false, { message: 'Account is inactive' });
        }

        // Return user object (attached to req.user)
        return done(null, {
            memberId: member.memberId,
            email: member.email,
            designation: member.designation,
            isRecruiter: member.isRecruiter,
            tokenFamily: jwtPayload.family, // Changed from jwtPayload.tokenFamily
            jti: jwtPayload.jti // Include JTI for potential use in controllers
        });
    } catch (error) {
        return done(error, false);
    }
}));

module.exports = passport;