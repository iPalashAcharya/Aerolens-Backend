const request = require('supertest');
const express = require('express');
const ContactValidator = require('../../validators/contactValidator');
const AppError = require('../../utils/appError');

const wrap = (fn) => (req, res, next) => {
    try {
        fn(req, res, next);
    } catch (e) {
        next(e);
    }
};

const app = express();
app.use(express.json());

app.post(
    '/contacts',
    wrap(ContactValidator.validateCreate),
    (req, res) => res.status(200).json(req.body)
);

app.put(
    '/contacts/:contactId',
    wrap(ContactValidator.validateUpdate),
    (req, res) => res.status(200).json(req.body)
);

app.delete(
    '/contacts/:contactId',
    wrap(ContactValidator.validateDelete),
    (req, res) => res.status(204).send()
);

app.use((err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            code: err.errorCode,
            message: err.message,
            details: err.details,
        });
    }
    res.status(500).json({ message: err.message });
});

describe('ContactValidator', () => {
    describe('validateCreate', () => {
        it('should pass with required fields', async () => {
            const res = await request(app)
                .post('/contacts')
                .send({
                    clientId: 1,
                    contactPersonName: 'Jane Doe',
                    designation: 'Manager',
                });

            expect(res.status).toBe(200);
        });

        it('should fail when clientId missing', async () => {
            const res = await request(app)
                .post('/contacts')
                .send({
                    contactPersonName: 'Jane Doe',
                    designation: 'Manager',
                });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION_ERROR');
        });

        it('should fail when designation too short', async () => {
            const res = await request(app)
                .post('/contacts')
                .send({
                    clientId: 1,
                    contactPersonName: 'Jane Doe',
                    designation: 'M',
                });

            expect(res.status).toBe(400);
        });
    });

    describe('validateUpdate', () => {
        it('should pass with valid body and params', async () => {
            const res = await request(app)
                .put('/contacts/5')
                .send({ contactPersonName: 'Updated Name' });

            expect(res.status).toBe(200);
        });

        it('should fail on invalid contactId param', async () => {
            const res = await request(app).put('/contacts/abc').send({ contactPersonName: 'X' });

            expect(res.status).toBe(400);
        });

        it('should merge body and param validation errors', async () => {
            const res = await request(app).put('/contacts/abc').send({});

            expect(res.status).toBe(400);
            expect(res.body.details.validationErrors.length).toBeGreaterThan(0);
        });
    });

    describe('validateDelete', () => {
        it('should pass for numeric contactId', async () => {
            const res = await request(app).delete('/contacts/12');

            expect(res.status).toBe(204);
        });

        it('should fail for invalid contactId', async () => {
            const res = await request(app).delete('/contacts/not-a-number');

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION_ERROR');
        });
    });
});
