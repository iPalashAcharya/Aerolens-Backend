const request = require('supertest');
const express = require('express');
const JobProfileValidator = require('../../validators/jobProfileValidator');
const AppError = require('../../utils/appError');

const mockDb = {
    getConnection: jest.fn(),
    execute: jest.fn(),
    release: jest.fn()
};

const mockConnection = {
    execute: jest.fn(),
    release: jest.fn()
};

const createTestApp = () => {
    const app = express();
    app.use(express.json());

    app.post('/job-profiles', JobProfileValidator.validateCreate, (req, res) => {
        res.status(200).json({ success: true, data: req.body });
    });

    app.put('/job-profiles/:id', JobProfileValidator.validateUpdate, (req, res) => {
        res.status(200).json({ success: true, data: req.body });
    });

    app.delete('/job-profiles/:id', JobProfileValidator.validateDelete, (req, res) => {
        res.status(200).json({ success: true });
    });

    app.get('/job-profiles/:id', JobProfileValidator.validateGetById, (req, res) => {
        res.status(200).json({ success: true });
    });

    app.get('/job-profiles', JobProfileValidator.validateSearch, (req, res) => {
        res.status(200).json({ success: true, data: req.validatedSearch });
    });

    app.use((err, req, res, next) => {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({
                status: 'error',
                code: err.errorCode,
                message: err.message,
                details: err.details
            });
        }
        res.status(500).json({ status: 'error', message: err.message });
    });

    return app;
};

describe('JobProfileValidator Test Suite', () => {
    let app;

    beforeAll(() => {
        JobProfileValidator.init(mockDb);
        app = createTestApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockDb.getConnection.mockResolvedValue(mockConnection);
        JobProfileValidator.helper.clearCache();
    });

    describe('CREATE Validation', () => {
        const validPayload = {
            clientId: 1,
            departmentId: 5,
            jobProfileDescription: 'Senior developer role with expertise in backend systems',
            jobRole: 'Senior Backend Developer',
            techSpecification: 'Node.js, PostgreSQL, Redis',
            positions: 3,
            estimatedCloseDate: new Date(Date.now() + 86400000).toISOString(),
            location: 'idc'
        };

        beforeEach(() => {
            mockConnection.execute.mockImplementation((query, params) => {
                if (query.includes('jobProfileLocation')) {
                    return Promise.resolve([[{ lookupKey: 1 }]]);
                }
                if (query.includes('profileStatus')) {
                    return Promise.resolve([[{ lookupKey: 2 }]]);
                }
                if (query.includes('SELECT jobProfileId FROM jobProfile')) {
                    return Promise.resolve([[]]);
                }
                return Promise.resolve([[]]);
            });
        });

        describe('Success Cases', () => {
            it('should validate and transform valid payload with all fields', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, status: 'in progress' });

                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('locationId', 1);
                expect(response.body.data).toHaveProperty('statusId', 2);
                expect(response.body.data).not.toHaveProperty('location');
                expect(response.body.data).not.toHaveProperty('status');
            });

            it('should apply default statusId when status is not provided', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send(validPayload);

                expect(response.status).toBe(200);
                expect(response.body.data.statusId).toBe(4);
            });

            it('should accept estimatedCloseDate as optional', async () => {
                const payload = { ...validPayload };
                delete payload.estimatedCloseDate;

                const response = await request(app)
                    .post('/job-profiles')
                    .send(payload);

                expect(response.status).toBe(200);
            });
        });

        describe('Required Field Validation', () => {
            const requiredFields = [
                'clientId',
                'departmentId',
                'jobProfileDescription',
                'jobRole',
                'techSpecification',
                'positions',
                'location'
            ];

            requiredFields.forEach(field => {
                it(`should fail when ${field} is missing`, async () => {
                    const payload = { ...validPayload };
                    delete payload[field];

                    const response = await request(app)
                        .post('/job-profiles')
                        .send(payload);

                    expect(response.status).toBe(400);
                    expect(response.body.code).toBe('VALIDATION_ERROR');
                });
            });
        });

        describe('Field Type Validation', () => {
            it('should fail when clientId is not a number', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, clientId: 'not-a-number' });

                expect(response.status).toBe(400);
                expect(response.body.details.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ field: 'clientId' })
                    ])
                );
            });

            it('should fail when clientId is negative', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, clientId: -1 });

                expect(response.status).toBe(400);
            });

            it('should fail when positions is not an integer', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, positions: 3.5 });

                expect(response.status).toBe(400);
            });

            it('should fail when positions is zero', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, positions: 0 });

                expect(response.status).toBe(400);
            });
        });

        describe('String Length Validation', () => {
            it('should fail when jobProfileDescription is too short', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, jobProfileDescription: 'Short' });

                expect(response.status).toBe(400);
            });

            it('should fail when jobProfileDescription exceeds 500 characters', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, jobProfileDescription: 'a'.repeat(501) });

                expect(response.status).toBe(400);
            });

            it('should fail when jobRole is too short', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, jobRole: 'A' });

                expect(response.status).toBe(400);
            });

            it('should fail when jobRole exceeds 100 characters', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, jobRole: 'a'.repeat(101) });

                expect(response.status).toBe(400);
            });
        });

        describe('Custom Validation Rules', () => {
            it('should fail for invalid location value', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, location: 'invalid-location' });

                expect(response.status).toBe(400);
            });

            it('should accept valid location "us"', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, location: 'us' });

                expect(response.status).toBe(200);
            });

            it('should fail for invalid status value', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, status: 'invalid-status' });

                expect(response.status).toBe(400);
            });

            it('should accept all valid status values', async () => {
                const validStatuses = ['cancelled', 'closed', 'in progress', 'pending'];

                for (const status of validStatuses) {
                    const response = await request(app)
                        .post('/job-profiles')
                        .send({ ...validPayload, status });

                    expect(response.status).toBe(200);
                }
            });

            it('should fail when techSpecification has values less than 2 characters', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, techSpecification: 'Node.js, A, React' });

                expect(response.status).toBe(400);
            });

            it('should accept valid comma-separated techSpecification', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, techSpecification: 'Node, React, AWS' });

                expect(response.status).toBe(200);
            });
        });

        describe('Date Validation', () => {
            it('should fail when estimatedCloseDate is in the past', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({
                        ...validPayload,
                        estimatedCloseDate: new Date(Date.now() - 86400000).toISOString()
                    });

                expect(response.status).toBe(400);
            });

            it('should fail when estimatedCloseDate is invalid', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, estimatedCloseDate: 'invalid-date' });

                expect(response.status).toBe(400);
            });
        });

        describe('Database Lookup Validation', () => {
            it('should fail when location does not exist in database', async () => {
                mockConnection.execute.mockImplementation((query) => {
                    if (query.includes('jobProfileLocation')) {
                        return Promise.resolve([[]]);
                    }
                    return Promise.resolve([[]]);
                });

                const response = await request(app)
                    .post('/job-profiles')
                    .send(validPayload);

                expect(response.status).toBe(400);
                expect(response.body.code).toBe('INVALID_LOCATION');
            });

            it('should fail when status does not exist in database', async () => {
                mockConnection.execute.mockImplementation((query) => {
                    if (query.includes('jobProfileLocation')) {
                        return Promise.resolve([[{ lookupKey: 1 }]]);
                    }
                    if (query.includes('profileStatus')) {
                        return Promise.resolve([[]]);
                    }
                    return Promise.resolve([[]]);
                });

                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, status: 'pending' });

                expect(response.status).toBe(400);
                expect(response.body.code).toBe('INVALID_STATUS');
            });

            it('should fail when duplicate jobRole exists for same client', async () => {
                mockConnection.execute.mockImplementation((query) => {
                    if (query.includes('jobProfileLocation')) {
                        return Promise.resolve([[{ lookupKey: 1 }]]);
                    }
                    if (query.includes('SELECT jobProfileId FROM jobProfile')) {
                        return Promise.resolve([[{ jobProfileId: 1 }]]);
                    }
                    return Promise.resolve([[]]);
                });

                const response = await request(app)
                    .post('/job-profiles')
                    .send(validPayload);

                expect(response.status).toBe(409);
                expect(response.body.code).toBe('DUPLICATE_JOB_ROLE');
            });
        });

        describe('Caching Behavior', () => {
            it('should use cached location value on subsequent calls', async () => {
                await request(app).post('/job-profiles').send(validPayload);
                await request(app).post('/job-profiles').send(validPayload);

                const locationCalls = mockConnection.execute.mock.calls.filter(
                    call => call[0].includes('jobProfileLocation')
                );
                expect(locationCalls.length).toBe(1);
            });
        });

        describe('Unknown Fields', () => {
            it('should strip unknown fields from payload', async () => {
                const response = await request(app)
                    .post('/job-profiles')
                    .send({ ...validPayload, unknownField: 'test', anotherField: 123 });

                expect(response.status).toBe(200);
                expect(response.body.data).not.toHaveProperty('unknownField');
                expect(response.body.data).not.toHaveProperty('anotherField');
            });
        });
    });

    describe('UPDATE Validation', () => {
        const validUpdatePayload = {
            jobProfileDescription: 'Updated description for the role',
            positions: 5
        };

        beforeEach(() => {
            mockConnection.execute.mockImplementation((query, params) => {
                if (query.includes('SELECT clientId FROM jobProfile')) {
                    return Promise.resolve([[{ clientId: 1 }]]);
                }
                if (query.includes('jobProfileLocation')) {
                    return Promise.resolve([[{ lookupKey: 1 }]]);
                }
                if (query.includes('profileStatus')) {
                    return Promise.resolve([[{ lookupKey: 2 }]]);
                }
                if (query.includes('SELECT jobProfileId FROM jobProfile')) {
                    return Promise.resolve([[]]);
                }
                return Promise.resolve([[]]);
            });
        });

        describe('Success Cases', () => {
            it('should validate valid update payload', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send(validUpdatePayload);

                expect(response.status).toBe(200);
            });

            it('should allow updating single field', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({ positions: 10 });

                expect(response.status).toBe(200);
                expect(response.body.data.positions).toBe(10);
            });

            it('should transform location and status in update', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({ location: 'us', status: 'closed' });

                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('locationId');
                expect(response.body.data).toHaveProperty('statusId');
            });
        });

        describe('Parameter Validation', () => {
            it('should fail when id parameter is not a number', async () => {
                const response = await request(app)
                    .put('/job-profiles/abc')
                    .send(validUpdatePayload);

                expect(response.status).toBe(400);
            });

            it('should fail when id parameter is negative', async () => {
                const response = await request(app)
                    .put('/job-profiles/-1')
                    .send(validUpdatePayload);

                expect(response.status).toBe(400);
            });

            it('should fail when id parameter is zero', async () => {
                const response = await request(app)
                    .put('/job-profiles/0')
                    .send(validUpdatePayload);

                expect(response.status).toBe(400);
            });
        });

        describe('Empty Update Validation', () => {
            it('should fail when no fields are provided', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({});

                expect(response.status).toBe(400);
                expect(response.body.details.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            message: 'At least one field must be provided for update'
                        })
                    ])
                );
            });
        });

        describe('Field Validation in Update', () => {
            it('should fail when jobProfileDescription is too short', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({ jobProfileDescription: 'Short' });

                expect(response.status).toBe(400);
            });

            it('should fail when techSpecification has invalid format', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({ techSpecification: 'Valid, X' });

                expect(response.status).toBe(400);
            });

            it('should fail when estimatedCloseDate is in past', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({
                        estimatedCloseDate: new Date(Date.now() - 86400000).toISOString()
                    });

                expect(response.status).toBe(400);
            });
        });

        describe('Duplicate JobRole Check', () => {
            it('should fail when updating to duplicate jobRole for same client', async () => {
                mockConnection.execute.mockImplementation((query, params) => {
                    if (query.includes('SELECT clientId FROM jobProfile')) {
                        return Promise.resolve([[{ clientId: 1 }]]);
                    }
                    if (query.includes('SELECT jobProfileId FROM jobProfile')) {
                        return Promise.resolve([[{ jobProfileId: 2 }]]);
                    }
                    return Promise.resolve([[]]);
                });

                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({ jobRole: 'Existing Role' });

                expect(response.status).toBe(409);
                expect(response.body.code).toBe('DUPLICATE_JOB_ROLE');
            });

            it('should succeed when jobRole is unique for client', async () => {
                const response = await request(app)
                    .put('/job-profiles/1')
                    .send({ jobRole: 'New Unique Role' });

                expect(response.status).toBe(200);
            });

            it('should fail when job profile does not exist', async () => {
                mockConnection.execute.mockImplementation((query) => {
                    if (query.includes('SELECT clientId FROM jobProfile')) {
                        return Promise.resolve([[]]);
                    }
                    return Promise.resolve([[]]);
                });

                const response = await request(app)
                    .put('/job-profiles/999')
                    .send({ jobRole: 'Test Role' });

                expect(response.status).toBe(404);
                expect(response.body.code).toBe('JOB_PROFILE_NOT_FOUND');
            });
        });
    });

    describe('DELETE Validation', () => {
        it('should validate valid id parameter', async () => {
            const response = await request(app).delete('/job-profiles/1');
            expect(response.status).toBe(200);
        });

        it('should fail when id is not a number', async () => {
            const response = await request(app).delete('/job-profiles/abc');
            expect(response.status).toBe(400);
        });

        it('should fail when id is negative', async () => {
            const response = await request(app).delete('/job-profiles/-5');
            expect(response.status).toBe(400);
        });
    });

    describe('GET BY ID Validation', () => {
        it('should validate valid id parameter', async () => {
            const response = await request(app).get('/job-profiles/1');
            expect(response.status).toBe(200);
        });

        it('should fail when id is not a number', async () => {
            const response = await request(app).get('/job-profiles/xyz');
            expect(response.status).toBe(400);
        });

        it('should fail when id is zero', async () => {
            const response = await request(app).get('/job-profiles/0');
            expect(response.status).toBe(400);
        });
    });

    describe('SEARCH Validation', () => {
        beforeEach(() => {
            mockConnection.execute.mockImplementation((query) => {
                if (query.includes('jobProfileLocation')) {
                    return Promise.resolve([[{ lookupKey: 1 }]]);
                }
                if (query.includes('profileStatus')) {
                    return Promise.resolve([[{ lookupKey: 2 }]]);
                }
                return Promise.resolve([[]]);
            });
        });

        describe('Success Cases', () => {
            it('should validate search with all parameters', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({
                        clientId: 1,
                        departmentId: 5,
                        jobRole: 'Developer',
                        location: 'idc',
                        status: 'in progress',
                        minPositions: 1,
                        maxPositions: 10,
                        fromDate: new Date().toISOString(),
                        toDate: new Date(Date.now() + 86400000).toISOString(),
                        limit: 100,
                        offset: 0
                    });

                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('locationId');
                expect(response.body.data).toHaveProperty('statusId');
            });

            it('should apply default values for limit and offset', async () => {
                const response = await request(app).get('/job-profiles').query({});

                expect(response.status).toBe(200);
                expect(response.body.data.limit).toBe(50);
                expect(response.body.data.offset).toBe(0);
            });

            it('should accept search without any parameters', async () => {
                const response = await request(app).get('/job-profiles');
                expect(response.status).toBe(200);
            });
        });

        describe('Range Validation', () => {
            it('should fail when minPositions > maxPositions', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ minPositions: 10, maxPositions: 5 });

                expect(response.status).toBe(400);
                expect(response.body.details.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            message: 'Minimum positions cannot be greater than maximum positions'
                        })
                    ])
                );
            });

            it('should fail when fromDate > toDate', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({
                        fromDate: new Date(Date.now() + 86400000).toISOString(),
                        toDate: new Date().toISOString()
                    });

                expect(response.status).toBe(400);
                expect(response.body.details.validationErrors).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            message: 'From date cannot be greater than to date'
                        })
                    ])
                );
            });

            it('should succeed when position range is valid', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ minPositions: 1, maxPositions: 10 });

                expect(response.status).toBe(200);
            });

            it('should succeed when date range is valid', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({
                        fromDate: new Date().toISOString(),
                        toDate: new Date(Date.now() + 86400000).toISOString()
                    });

                expect(response.status).toBe(200);
            });
        });

        describe('Limit and Offset Validation', () => {
            it('should fail when limit exceeds 1000', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ limit: 1001 });

                expect(response.status).toBe(400);
            });

            it('should fail when limit is less than 1', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ limit: 0 });

                expect(response.status).toBe(400);
            });

            it('should fail when offset is negative', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ offset: -1 });

                expect(response.status).toBe(400);
            });

            it('should accept maximum valid limit', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ limit: 1000 });

                expect(response.status).toBe(200);
            });
        });

        describe('Type Conversion', () => {
            it('should convert string numbers to integers', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ clientId: '5', limit: '25', offset: '10' });

                expect(response.status).toBe(200);
                expect(response.body.data.clientId).toBe(5);
                expect(response.body.data.limit).toBe(25);
                expect(response.body.data.offset).toBe(10);
            });
        });

        describe('Unknown Parameters', () => {
            it('should strip unknown query parameters', async () => {
                const response = await request(app)
                    .get('/job-profiles')
                    .query({ clientId: 1, unknownParam: 'test', invalidField: 123 });

                expect(response.status).toBe(200);
                expect(response.body.data).not.toHaveProperty('unknownParam');
                expect(response.body.data).not.toHaveProperty('invalidField');
            });
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            mockConnection.execute.mockRejectedValueOnce(
                new Error('Database connection failed')
            );

            const payload = {
                clientId: 1,
                departmentId: 5,
                jobProfileDescription: 'Test description for role',
                jobRole: 'Test Role',
                techSpecification: 'Node, React',
                positions: 3,
                location: 'idc'
            };

            const response = await request(app).post('/job-profiles').send(payload);

            expect(response.status).toBe(500);
        });

        it('should handle null values appropriately', async () => {
            const response = await request(app)
                .post('/job-profiles')
                .send({
                    clientId: 1,
                    departmentId: 5,
                    jobProfileDescription: 'Valid description',
                    jobRole: 'Developer',
                    techSpecification: 'Node, React',
                    positions: 3,
                    location: 'idc',
                    estimatedCloseDate: null
                });

            expect(response.status).toBe(400);
        });

        it('should trim whitespace from string inputs', async () => {
            mockConnection.execute.mockImplementation((query) => {
                if (query.includes('jobProfileLocation')) {
                    return Promise.resolve([[{ lookupKey: 1 }]]);
                }
                return Promise.resolve([[]]);
            });

            const response = await request(app)
                .post('/job-profiles')
                .send({
                    clientId: 1,
                    departmentId: 5,
                    jobProfileDescription: '  Valid description with spaces  ',
                    jobRole: '  Developer  ',
                    techSpecification: ' Node, React ',
                    positions: 3,
                    location: ' idc '
                });

            expect(response.status).toBe(200);
        });
    });
});