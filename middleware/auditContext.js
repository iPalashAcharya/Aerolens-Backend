const auditContextMiddleware = (req, res, next) => {
    console.log('req.user:', req.user);
    req.auditContext = {
        userId: req.user?.memberId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        timestamp: new Date(),
        method: req.method,
        path: req.originalUrl
    };

    next();
};

module.exports = auditContextMiddleware;