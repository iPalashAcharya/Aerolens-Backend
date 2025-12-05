const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const jwtConfig = require('./jwt');
const memberRepository = require('../repositories/memberRepository');
const tokenRepository = require('../repositories/tokenRepository');

const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: jwtConfig.token.secret,
    algorithms: [jwtConfig.token.algorithm],
    ignoreExpiration: false,
    passReqToCallback: false
};

passport.use('jwt', new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
        if (!jwtPayload.memberId || !jwtPayload.jti || !jwtPayload.family) {
            return done(null, false, { message: 'Invalid token structure' });
        }

        const isRevoked = await tokenRepository.isTokenRevoked(jwtPayload.jti);
        if (isRevoked) {
            return done(null, false, { message: 'Token has been revoked' });
        }

        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (jwtPayload.exp && jwtPayload.exp < currentTimestamp) {
            return done(null, false, { message: 'Token expired' });
        }

        const member = await memberRepository.findById(jwtPayload.memberId);
        if (!member) {
            return done(null, false, { message: 'Member not found' });
        }

        if (!member.isActive) {
            return done(null, false, { message: 'Account is inactive' });
        }

        return done(null, {
            memberId: member.memberId,
            email: member.email,
            designation: member.designation,
            isRecruiter: member.isRecruiter,
            tokenFamily: jwtPayload.family,
            jti: jwtPayload.jti
        });
    } catch (error) {
        return done(error, false);
    }
}));

module.exports = passport;