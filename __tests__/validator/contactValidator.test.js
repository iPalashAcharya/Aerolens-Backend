const request = require('supertest');
const express = require('express');
const ContactValidator = require('../../validators/contactValidator');
const AppError = require('../../utils/appError');

const createTestApp = () => {
    const app = express();
    app.use(express.json());

    // Test routes for each validator
    app.post('/contact', ContactValidator.validateCreate, (req, res) => {
        res.status(201).json({ success: true, data: req.body });
    });

    app.put('/contact/:contactId', ContactValidator.validateUpdate, (req, res) => {
        res.status(200).json({ success: true, data: req.body });
    });

    app.delete('/contact/:contactId', ContactValidator.validateDelete, (req, res) => {
        res.status(204).send();
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

describe('ContactValidator', () => {
    let app;

    beforeEach(() => {
        app = createTestApp();
    });

    describe('validateCreate', () => {
        describe('Valid requests', () => {
            it('should pass validation with minimal valid data', async () => {
                const validData = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(validData)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data).toEqual(validData);
            });

            it('should trim whitespace from fields', async () => {
                const dataWithWhitespace = {
                    clientId: 2,
                    contactPersonName: '   Jane Smith ',
                    designation: '   Director   ',
                    email: '   jane@example.com   ',
                    phone: '   12345678   '
                };
                const response = await request(app)
                    .post('/contact')
                    .send(dataWithWhitespace)
                    .expect(201);

                expect(response.body.success).toBe(true);
                expect(response.body.data.contactPersonName).toBe('Jane Smith');
                expect(response.body.data.designation).toBe('Director');
            });

            it('should accept maximum length values', async () => {
                const maxData = {
                    clientId: 10,
                    contactPersonName: 'a'.repeat(255),
                    designation: 'b'.repeat(100),
                    phone: '+'.concat('9'.repeat(24)),
                    email: (() => {
                        const localPart = 'a'.repeat(64);
                        const domain = `${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`;
                        return `${localPart}@${domain}`;
                    })()
                };

                const response = await request(app)
                    .post('/contact')
                    .send(maxData);

                console.log('Validation error response:', response.body);

                expect(response.statusCode).toBe(201);
                expect(response.body.success).toBe(true);
            });
        });

        describe('Invalid requests - contactPersonName field', () => {
            it('should fail when contactPersonName is missing', async () => {
                const data = {
                    clientId: 1,
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.errorCode).toBe('VALIDATION_ERROR');
                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactPersonName',
                    message: 'Name is required'
                });
            });

            it('should fail when contactPersonName is empty string', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: '',
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactPersonName',
                    message: 'Name cannot be empty'
                });
            });

            it('should fail when contactPersonName < 1 character', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: '',
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactPersonName',
                    message: 'Name cannot be empty'
                });
            });

            it('should fail when contactPersonName exceeds 255 characters', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'a'.repeat(256),
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactPersonName',
                    message: 'Name cannot exceed 255 characters'
                });
            });

            it('should fail when contactPersonName is not a string', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 1234,
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactPersonName',
                    message: 'Name must be a string'
                });
            });
        });

        describe('Invalid requests - designation field', () => {
            it('should fail when designation is missing', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'designation',
                    message: 'Designation is required'
                });
            });

            it('should fail when designation is empty string', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: ''
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'designation',
                    message: 'Designation cannot be empty'
                });
            });

            it('should fail when designation < 2 characters', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 'A'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'designation',
                    message: 'Designation must be atleast 2 characters long'
                });
            });

            it('should fail when designation exceeds 100 characters', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 'M'.repeat(101)
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'designation',
                    message: 'Designation cannot exceed 100 characters'
                });
            });

            it('should fail when designation is not a string', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 1234
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'designation',
                    message: 'Designation must be a string'
                });
            });
        });

        describe('Invalid requests - phone field', () => {
            it('should fail when phone is invalid', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 'Manager',
                    phone: 'abcdefg'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'phone',
                    message: 'Contact number must be a valid phone number (7-25 characters, numbers, spaces, +, -, () allowed)'
                });
            });
        });

        describe('Invalid requests - email field', () => {
            it('should fail when email is invalid', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 'Manager',
                    email: 'notanemail'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'email',
                    message: 'Email must be a valid email address'
                });
            });

            it('should fail when email exceeds 255 characters', async () => {
                const data = {
                    clientId: 1,
                    contactPersonName: 'John Doe',
                    designation: 'Manager',
                    email: 'a'.repeat(245) + '@example.com' // >255
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'email',
                    message: 'Email cannot exceed 255 characters'
                });
            });
        });

        describe('Invalid requests - clientId field', () => {
            it('should fail when clientId is missing', async () => {
                const data = {
                    contactPersonName: 'John Doe',
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'clientId',
                    message: 'Client ID is required'
                });
            });

            it('should fail when clientId is not a number', async () => {
                const data = {
                    clientId: 'abc',
                    contactPersonName: 'John Doe',
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'clientId',
                    message: 'Client ID must be a number'
                });
            });

            it('should fail when clientId is not positive', async () => {
                const data = {
                    clientId: -1,
                    contactPersonName: 'John Doe',
                    designation: 'Manager'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'clientId',
                    message: 'Client ID must be a positive number'
                });
            });
        });

        describe('Multiple validation errors', () => {
            it('should return all validation errors when multiple fields are invalid', async () => {
                const data = {
                    clientId: 'abc',
                    contactPersonName: '',
                    designation: '',
                    phone: 'ab',
                    email: 'notanemail'
                };
                const response = await request(app)
                    .post('/contact')
                    .send(data)
                    .expect(400);

                expect(response.body.validationErrors.length).toBeGreaterThan(1);
                expect(response.body.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ field: 'clientId' }),
                        expect.objectContaining({ field: 'contactPersonName' }),
                        expect.objectContaining({ field: 'designation' }),
                        expect.objectContaining({ field: 'phone' }),
                        expect.objectContaining({ field: 'email' })
                    ])
                );
            });
        });
    });
    describe('validateUpdate', () => {
        describe('Valid requests', () => {
            it('should pass validation with valid contactPersonName only', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ contactPersonName: 'Jane Doe' })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with valid designation only', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ designation: 'Director' })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with phone and email only', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ phone: '+1234567890', email: 'valid@example.com' })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });

            it('should pass validation with multiple valid fields', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({
                        contactPersonName: 'Jane Doe',
                        designation: 'Director',
                        phone: '+1234567890',
                        email: 'valid@example.com'
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
            });
        });

        describe('Invalid requests - params', () => {
            it('should fail when contactId is not a number', async () => {
                const response = await request(app)
                    .put('/contact/abc')
                    .send({ contactPersonName: 'Jane Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person Id must be a number'
                });
            });

            it('should fail when contactId is not an integer', async () => {
                const response = await request(app)
                    .put('/contact/1.5')
                    .send({ contactPersonName: 'Jane Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person ID must be an integer'
                });
            });

            it('should fail when contactId is not positive', async () => {
                const response = await request(app)
                    .put('/contact/-1')
                    .send({ contactPersonName: 'Jane Doe' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person ID must be positive'
                });
            });
        });

        describe('Invalid requests - body', () => {
            it('should fail when no fields are provided', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({})
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: undefined,
                    message: 'At least one field must be provided for update'
                });
            });

            it('should fail when contactPersonName is invalid', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ contactPersonName: '' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactPersonName',
                    message: 'Name cannot be empty'
                });
            });

            it('should fail when designation is too short', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ designation: 'A' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'designation',
                    message: 'Designation must be atleast 2 characters long'
                });
            });

            it('should fail when phone is invalid', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ phone: 'abc' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'phone',
                    message: 'Contact number must be a valid phone number (7-25 characters, numbers, spaces, +, -, () allowed)'
                });
            });

            it('should fail when email is invalid', async () => {
                const response = await request(app)
                    .put('/contact/1')
                    .send({ email: 'notanemail' })
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'email',
                    message: 'Email must be a valid email address'
                });
            });
        });

        describe('Multiple validation errors', () => {
            it('should return errors for both params and body', async () => {
                const response = await request(app)
                    .put('/contact/abc')
                    .send({ contactPersonName: '' })
                    .expect(400);

                expect(response.body.validationErrors.length).toBeGreaterThan(0);
                expect(response.body.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ field: 'contactId' }),
                        expect.objectContaining({ field: 'contactPersonName' })
                    ])
                );
            });
        });
    });

    describe('validateDelete', () => {
        describe('Valid requests', () => {
            it('should pass validation with valid positive integer contactId', async () => {
                await request(app)
                    .delete('/contact/1')
                    .expect(204);
            });

            it('should pass validation with large integer contactId', async () => {
                await request(app)
                    .delete('/contact/999999')
                    .expect(204);
            });
        });

        describe('Invalid requests', () => {
            it('should fail when contactId is not a number', async () => {
                const response = await request(app)
                    .delete('/contact/abc')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person Id must be a number'
                });
            });

            it('should fail when contactId is not an integer', async () => {
                const response = await request(app)
                    .delete('/contact/1.5')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person ID must be an integer'
                });
            });

            it('should fail when contactId is zero', async () => {
                const response = await request(app)
                    .delete('/contact/0')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person ID must be positive'
                });
            });

            it('should fail when contactId is negative', async () => {
                const response = await request(app)
                    .delete('/contact/-5')
                    .expect(400);

                expect(response.body.validationErrors).toContainEqual({
                    field: 'contactId',
                    message: 'Contact Person ID must be positive'
                });
            });
        });
    });
});