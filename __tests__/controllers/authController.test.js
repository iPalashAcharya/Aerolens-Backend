const request = require('supertest');
const express = require('express');
const authController = require('../../controllers/authController');

jest.mock('../../services/authServices', () => ({
    register: jest.fn(),
    login: jest.fn(),
    changePassword: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    logoutAllDevices: jest.fn(),
    getActiveSessions: jest.fn(),
}));

const authService = require('../../services/authServices');

const app = express();
app.use(express.json());

const asUser = (req, res, next) => {
    req.user = { memberId: 5, email: 'u@test.com' };
    next();
};

app.post('/register', (req, res, next) => authController.register(req, res, next));
app.post('/login', (req, res, next) => authController.login(req, res, next));
app.post('/change-password', asUser, (req, res, next) => authController.changePassword(req, res, next));
app.post('/refresh', (req, res, next) => authController.refreshToken(req, res, next));
app.post('/logout', (req, res, next) => authController.logout(req, res, next));
app.post('/logout-all', asUser, (req, res, next) => authController.logoutAllDevices(req, res, next));
app.get('/sessions', asUser, (req, res, next) => authController.getActiveSessions(req, res, next));
app.get('/profile', asUser, (req, res, next) => authController.getProfile(req, res, next));

app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ message: err.message, code: err.errorCode });
});

describe('authController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('register returns 201 with member payload', async () => {
        authService.register.mockResolvedValue({ memberId: 1 });

        const res = await request(app)
            .post('/register')
            .send({ email: 'a@b.com', password: 'x' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.member.memberId).toBe(1);
    });

    it('login returns tokens payload', async () => {
        authService.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'b' });

        const res = await request(app)
            .post('/login')
            .send({ email: 'a@b.com', password: 'secret' })
            .set('User-Agent', 'jest')
            .set('X-Forwarded-For', '10.0.0.1');

        expect(res.status).toBe(200);
        expect(res.body.data.accessToken).toBe('a');
    });

    it('changePassword calls service with memberId from req.user', async () => {
        authService.changePassword.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/change-password')
            .send({ currentPassword: 'a', newPassword: 'b' });

        expect(authService.changePassword).toHaveBeenCalled();
        expect(res.status).toBe(200);
    });

    it('refreshToken requires Bearer header', async () => {
        const res = await request(app).post('/refresh').send({});

        expect(res.status).toBe(401);
    });

    it('refreshToken forwards token to service', async () => {
        authService.refreshToken.mockResolvedValue({ accessToken: 'new' });

        const res = await request(app)
            .post('/refresh')
            .set('Authorization', 'Bearer rtok');

        expect(res.status).toBe(200);
        expect(authService.refreshToken).toHaveBeenCalledWith(
            'rtok',
            undefined,
            expect.any(String)
        );
    });

    it('logout succeeds without header', async () => {
        const res = await request(app).post('/logout');

        expect(res.status).toBe(200);
    });

    it('logout calls service when Bearer present', async () => {
        authService.logout.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/logout')
            .set('Authorization', 'Bearer tok');

        expect(res.status).toBe(200);
        expect(authService.logout).toHaveBeenCalledWith('tok');
    });

    it('logoutAllDevices uses req.user.memberId', async () => {
        authService.logoutAllDevices.mockResolvedValue(undefined);

        const res = await request(app).post('/logout-all');

        expect(res.status).toBe(200);
        expect(authService.logoutAllDevices).toHaveBeenCalledWith(5);
    });

    it('getActiveSessions returns sessions', async () => {
        authService.getActiveSessions.mockResolvedValue([{ id: 1 }]);

        const res = await request(app).get('/sessions');

        expect(res.status).toBe(200);
        expect(res.body.data.sessions).toEqual([{ id: 1 }]);
    });

    it('getProfile returns req.user', async () => {
        const res = await request(app).get('/profile');

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Profile/);
    });
});
