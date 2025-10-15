const request = require('supertest');
const express = require('express');
const ClientValidator = require('../../validators/clientValidator');
const AppError = require('../../utils/appError');

// Create a test Express app
const createTestApp = () => {
    const app = express();
    app.use(express.json());

    // Test routes for each validator
    app.post('/clients', ClientValidator.validateCreate, (req, res) => {
        res.status(201).json({ success: true, data: req.body });
    });

    app.put('/clients/:id', ClientValidator.validateUpdate, (req, res) => {
        res.status(200).json({ success: true, data: req.body });
    });

    app.delete('/clients/:id', ClientValidator.validateDelete, (req, res) => {
        res.status(204).send();
    });

    app.get('/clients', ClientValidator.validatePagination, (req, res) => {
        res.status(200).json({ success: true, query: req.query });
    });

    // Error handler
    app.use((err, req, res, next) => {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({
                status: 'error',
                errorCode: err.errorCode,
                message: err.message,
                ...err.details
            });
        }
        res.status(500).json({ status: 'error', message: err.message });
    });

    return app;
};

describe('ClientValidator', () => {
    let app;

    beforeEach(() => {
        app = createTestApp();
    });

    describe('validateCreate', () => {
        describe('Valid requests', () => {
            it('should pass validation with valid name and address', async () => {
                const validData = {
                    name: 'John Doe',
                    address: '1600 Amphitheatre Parkway Mountain View, CA 94043, United States'
                };

                const response = await request(app)
                    .post('/clients')
                    .send(validData)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data).toEqual(validData);
            });

            it('should trim whitespace from name and address', async () => {
                const dataWithWhitespace = {
                    name: '  John Doe  ',
                    address: '  1600 Amphitheatre Parkway Mountain View, CA 94043, United States  '
                };

                const response = await request(app)
                    .post('/clients')
                    .send(dataWithWhitespace)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data.name).toBe('John Doe');
                expect(response.body.data.address).toBe('1600 Amphitheatre Parkway Mountain View, CA 94043, United States');
            });

            it('should accept maximum length values for realistic addresses', async () => {
                const maxData = {
                    name: 'a'.repeat(255),
                    // Use realistic content repeated up to the max length, not a single letter
                    address: ('1600 Amphitheatre Parkway, Mountain View, CA, United States. ').repeat(11).substring(0, 500)
                };
                const response = await request(app)
                    .post('/clients')
                    .send(maxData)
                    .expect(201);

                expect(response.body.success).toBe(true);
            });
        });

        describe('Invalid requests - name field', () => {
            it('should fail when name is missing', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ address: '1600 Amphitheatre Parkway Mountain View, CA 94043, United States' })
                    .expect(400);

                expect(response.body.errorCode).toBe('VALIDATION_ERROR');
                expect(response.body.validationErrors).toContainEqual({
                    field: 'name',
                    message: 'Name is required'
                });
            });

            it('should fail when name is empty string', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ name: '', address: '1600 Amphitheatre Parkway Mountain View, CA 94043, United States' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'name',
                    message: 'Name cannot be empty'
                });
            });

            it('should fail when name exceeds 255 characters', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({
                        name: 'a'.repeat(256),
                        address: '123 Main Street'
                    })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'name',
                    message: 'Name cannot exceed 255 characters'
                });
            });

            it('should fail when name is not a string', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ name: 123, address: '123 Main Street' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'name',
                    message: 'Name must be a string'
                });
            });
        });

        describe('Invalid requests - address field', () => {
            it('should fail when address is missing', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ name: 'John Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'address',
                    message: 'Address is required'
                });
            });

            it('should fail when address is too short', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ name: 'John Doe', address: 'abc' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'address',
                    message: 'Address must be at least 5 characters long'
                });
            });

            it('should fail when address exceeds 500 characters', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({
                        name: 'John Doe',
                        address: 'a'.repeat(501)
                    })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'address',
                    message: 'Address cannot exceed 500 characters'
                });
            });

            it('should fail when address is not a string', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ name: 'John Doe', address: 12345 })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'address',
                    message: 'Address must be a string'
                });
            });
        });

        describe('Multiple validation errors', () => {
            it('should return all validation errors when multiple fields are invalid', async () => {
                const response = await request(app)
                    .post('/clients')
                    .send({ name: '', address: 'abc' })
                    .expect(400);

                expect(response.body.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ field: 'name' }),
                        expect.objectContaining({ field: 'address' })
                    ])
                );
            });
        });
    });

    describe('validateUpdate', () => {
        describe('Valid requests', () => {
            it('should pass validation with valid name only', async () => {
                const response = await request(app)
                    .put('/clients/1')
                    .send({ name: 'Jane Doe' })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with valid address only', async () => {
                const response = await request(app)
                    .put('/clients/1')
                    .send({ address: '456 Oak Avenue, Springfield, IL' })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with both name and address', async () => {
                const response = await request(app)
                    .put('/clients/1')
                    .send({
                        name: 'Jane Doe',
                        address: '456 Oak Avenue, Springfield, IL'
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });
        });

        describe('Invalid requests - params', () => {
            it('should fail when ID is not a number', async () => {
                const response = await request(app)
                    .put('/clients/abc')
                    .send({ name: 'Jane Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be a number'
                });
            });

            it('should fail when ID is not an integer', async () => {
                const response = await request(app)
                    .put('/clients/1.5')
                    .send({ name: 'Jane Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be an integer'
                });
            });

            it('should fail when ID is not positive', async () => {
                const response = await request(app)
                    .put('/clients/-1')
                    .send({ name: 'Jane Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be positive'
                });
            });
        });

        describe('Invalid requests - body', () => {
            it('should fail when no fields are provided', async () => {
                const response = await request(app)
                    .put('/clients/1')
                    .send({})
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: undefined,
                    message: 'At least one field (name or address) must be provided for update'
                });
            });

            it('should fail when name is invalid', async () => {
                const response = await request(app)
                    .put('/clients/1')
                    .send({ name: 'a'.repeat(256) })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'name',
                    message: 'Name cannot exceed 255 characters'
                });
            });

            it('should fail when address is invalid', async () => {
                const response = await request(app)
                    .put('/clients/1')
                    .send({ address: 'abc' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'address',
                    message: 'Address must be at least 5 characters long'
                });
            });
        });

        describe('Multiple validation errors', () => {
            it('should return errors for both params and body', async () => {
                const response = await request(app)
                    .put('/clients/abc')
                    .send({ name: '' })
                    .expect(400);

                expect(response.body.validationErrors.length).toBeGreaterThan(0);
                expect(response.body.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ field: 'id' })
                    ])
                );
            });
        });
    });

    describe('validateDelete', () => {
        describe('Valid requests', () => {
            it('should pass validation with valid positive integer ID', async () => {
                const response = await request(app)
                    .delete('/clients/1')
                    .expect(204);
            });

            it('should pass validation with large integer ID', async () => {
                const response = await request(app)
                    .delete('/clients/999999')
                    .expect(204);
            });
        });

        describe('Invalid requests', () => {
            it('should fail when ID is not a number', async () => {
                const response = await request(app)
                    .delete('/clients/abc')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be a number'
                });
            });

            it('should fail when ID is not an integer', async () => {
                const response = await request(app)
                    .delete('/clients/1.5')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be an integer'
                });
            });

            it('should fail when ID is zero', async () => {
                const response = await request(app)
                    .delete('/clients/0')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be positive'
                });
            });

            it('should fail when ID is negative', async () => {
                const response = await request(app)
                    .delete('/clients/-5')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'id',
                    message: 'Client ID must be positive'
                });
            });
        });
    });

    describe('validatePagination', () => {
        describe('Valid requests', () => {
            it('should pass validation with default values when no query params provided', async () => {
                const response = await request(app)
                    .get('/clients')
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with valid page and limit', async () => {
                const response = await request(app)
                    .get('/clients?page=2&limit=20')
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with page only', async () => {
                const response = await request(app)
                    .get('/clients?page=3')
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with limit only', async () => {
                const response = await request(app)
                    .get('/clients?limit=50')
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with maximum limit value', async () => {
                const response = await request(app)
                    .get('/clients?limit=100')
                    .expect(200);

                expect(response.body.success).toBe(true);
            });
        });

        describe('Invalid requests - page', () => {
            it('should fail when page is not a number', async () => {
                const response = await request(app)
                    .get('/clients?page=abc')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'page',
                    message: 'Page must be a number'
                });
            });

            it('should fail when page is less than 1', async () => {
                const response = await request(app)
                    .get('/clients?page=0')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'page',
                    message: 'Page must be at least 1'
                });
            });

            it('should fail when page is negative', async () => {
                const response = await request(app)
                    .get('/clients?page=-1')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'page',
                    message: 'Page must be at least 1'
                });
            });

            it('should fail when page is not an integer', async () => {
                const response = await request(app)
                    .get('/clients?page=1.5')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'page',
                    message: 'Page must be an integer'
                });
            });
        });

        describe('Invalid requests - limit', () => {
            it('should fail when limit is not a number', async () => {
                const response = await request(app)
                    .get('/clients?limit=abc')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'limit',
                    message: 'Limit must be a number'
                });
            });

            it('should fail when limit is less than 1', async () => {
                const response = await request(app)
                    .get('/clients?limit=0')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'limit',
                    message: 'Limit must be at least 1'
                });
            });

            it('should fail when limit exceeds 100', async () => {
                const response = await request(app)
                    .get('/clients?limit=101')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'limit',
                    message: 'Limit cannot exceed 100'
                });
            });

            it('should fail when limit is not an integer', async () => {
                const response = await request(app)
                    .get('/clients?limit=10.5')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'limit',
                    message: 'Limit must be an integer'
                });
            });
        });

        describe('Multiple validation errors', () => {
            it('should return errors for both page and limit when both are invalid', async () => {
                const response = await request(app)
                    .get('/clients?page=-1&limit=200')
                    .expect(400);

                expect(response.body.validationErrors).toHaveLength(2);
                expect(response.body.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ field: 'page' }),
                        expect.objectContaining({ field: 'limit' })
                    ])
                );
            });
        });
    });
});