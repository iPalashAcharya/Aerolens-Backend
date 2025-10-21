const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const jwtConfig = require('./jwt');
const memberRepository = require('../repositories/memberRepository');
//const AppError = require('../utils/appError');

// JWT Strategy Configuration
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: jwtConfig.access.secret,
    algorithms: [jwtConfig.access.algorithm],
    ignoreExpiration: false,
    passReqToCallback: false
};

// JWT Strategy
passport.use('jwt', new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
        // Validate token structure
        if (!jwtPayload.memberId || !jwtPayload.tokenFamily) {
            return done(null, false, { message: 'Invalid token structure' });
        }

        // Check token expiration explicitly
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (jwtPayload.exp && jwtPayload.exp < currentTimestamp) {
            return done(null, false, { message: 'Token expired' });
        }

        // Find member by ID
        const member = await memberRepository.findById(jwtPayload.memberId);

        if (!member) {
            return done(null, false, { message: 'Member not found' });
        }

        // Check if member is active
        if (!member.isActive) {
            return done(null, false, { message: 'Account is inactive' });
        }

        // Attach member to request
        return done(null, {
            memberId: member.memberId,
            email: member.email,
            designation: member.designation,
            isRecruiter: member.isRecruiter,
            tokenFamily: jwtPayload.tokenFamily
        });

    } catch (error) {
        return done(error, false);
    }
}));

// Optional: Cookie extraction strategy for additional security
const cookieExtractor = (req) => {
    let token = null;
    if (req && req.cookies) {
        token = req.cookies['refreshToken'];
    }
    return token;
};

const refreshJwtOptions = {
    jwtFromRequest: cookieExtractor,
    secretOrKey: jwtConfig.refresh.secret,
    algorithms: [jwtConfig.refresh.algorithm],
    ignoreExpiration: false,
    passReqToCallback: true
};

// Refresh Token Strategy
passport.use('jwt-refresh', new JwtStrategy(refreshJwtOptions, async (req, jwtPayload, done) => {
    try {
        if (!jwtPayload.memberId || !jwtPayload.tokenFamily) {
            return done(null, false, { message: 'Invalid refresh token structure' });
        }

        const member = await memberRepository.findById(jwtPayload.memberId);

        if (!member || !member.isActive) {
            return done(null, false, { message: 'Invalid member or inactive account' });
        }

        return done(null, {
            memberId: member.memberId,
            tokenFamily: jwtPayload.tokenFamily
        });

    } catch (error) {
        return done(error, false);
    }
}));

module.exports = passport;