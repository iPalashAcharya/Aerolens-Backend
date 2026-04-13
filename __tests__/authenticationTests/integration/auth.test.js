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

describe('Authentication controller HTTP', () => {
    const app = buildAuthApp();

    it('should reject refresh without bearer token', async () => {
        const res = await request(app).post('/auth/refresh').send({});

        expect(res.status).toBe(401);
    });
});
