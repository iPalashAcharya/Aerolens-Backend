const auditContextMiddleware = (req, res, next) => {
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