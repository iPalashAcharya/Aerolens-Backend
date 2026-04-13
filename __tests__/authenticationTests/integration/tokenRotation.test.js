const request = require('supertest');
const express = require('express');
const authController = require('../../../controllers/authController');
const globalErrorHandler = require('../../../middleware/errorHandler');

function buildAuthApp() {
    const app = express();
    app.use(express.json());
    app.post('/auth/refresh', authController.refreshToken);
    app.use(globalErrorHandler);
    return app;
}

describe('Token refresh controller', () => {
    const app = buildAuthApp();

    it('should reject refresh without Authorization header', async () => {
        const res = await request(app).post('/auth/refresh').send({});

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('TOKEN_MISSING');
    });
});
