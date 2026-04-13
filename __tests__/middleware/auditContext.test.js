const auditContextMiddleware = require('../../middleware/auditContext');

describe('auditContextMiddleware', () => {
    it('attaches auditContext and calls next', () => {
        const req = {
            user: { memberId: 42 },
            ip: '192.168.0.1',
            connection: {},
            headers: { 'user-agent': 'jest' },
            method: 'POST',
            originalUrl: '/api/x',
        };
        const res = {};
        const next = jest.fn();

        jest.spyOn(console, 'log').mockImplementation(() => {});

        auditContextMiddleware(req, res, next);

        expect(req.auditContext).toMatchObject({
            userId: 42,
            ipAddress: '192.168.0.1',
            userAgent: 'jest',
            method: 'POST',
            path: '/api/x',
        });
        expect(req.auditContext.timestamp).toBeInstanceOf(Date);
        expect(next).toHaveBeenCalledWith();

        console.log.mockRestore();
    });

    it('uses connection.remoteAddress when req.ip is missing', () => {
        const req = {
            user: undefined,
            connection: { remoteAddress: '10.0.0.1' },
            headers: {},
            method: 'GET',
            originalUrl: '/',
        };
        const next = jest.fn();
        jest.spyOn(console, 'log').mockImplementation(() => {});

        auditContextMiddleware(req, {}, next);

        expect(req.auditContext.userId).toBeUndefined();
        expect(req.auditContext.ipAddress).toBe('10.0.0.1');
        console.log.mockRestore();
    });
});
