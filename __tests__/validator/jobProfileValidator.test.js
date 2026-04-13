const request = require('supertest');
const express = require('express');
const JobProfileValidator = require('../../validators/jobProfileValidator');
const AppError = require('../../utils/appError');

const mockConnection = {
    execute: jest.fn(),
    release: jest.fn(),
};

const mockDb = {
    getConnection: jest.fn().mockResolvedValue(mockConnection),
};

const wrapAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const createApp = () => {
    const app = express();
    app.use(express.json());

    app.post(
        '/job-profiles',
        wrapAsync(JobProfileValidator.validateCreate),
        (req, res) => res.status(200).json(req.body)
    );

    app.put(
        '/job-profiles/:id',
        wrapAsync(JobProfileValidator.validateUpdate),
        (req, res) => res.status(200).json(req.body)
    );

    app.get(
        '/job-profiles/search',
        wrapAsync(JobProfileValidator.validateSearch),
        (req, res) => res.status(200).json(req.validatedSearch)
    );

    app.delete(
        '/job-profiles/:id',
        wrapAsync(JobProfileValidator.validateDelete),
        (req, res) => res.status(204).send()
    );

    app.get(
        '/job-profiles/:id/detail',
        wrapAsync(JobProfileValidator.validateGetById),
        (req, res) => res.status(200).json(req.params)
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
        next(err);
    });

    return app;
};

describe('JobProfileValidator', () => {
    let app;

    beforeAll(() => {
        JobProfileValidator.init(mockDb);
    });

    beforeEach(() => {
        JobProfileValidator.helper.clearCache();
        jest.clearAllMocks();
        mockDb.getConnection.mockResolvedValue(mockConnection);
        mockConnection.execute.mockResolvedValue([[{ lookupKey: 10 }], []]);
        app = createApp();
    });

    describe('validateCreate', () => {
        it('should transform position to jobRole and pass', async () => {
            const res = await request(app)
                .post('/job-profiles')
                .send({ position: 'Senior Software Engineer' });

            expect(res.status).toBe(200);
            expect(res.body.jobRole).toBe('Senior Software Engineer');
            expect(res.body).toHaveProperty('experienceText');
        });

        it('should reject when position missing', async () => {
            const res = await request(app).post('/job-profiles').send({ experience: '5 yrs' });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION_ERROR');
        });

        it('should validate techSpecifications when provided', async () => {
            const spy = jest
                .spyOn(JobProfileValidator.helper, 'validateTechSpecifications')
                .mockResolvedValue([10]);

            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Developer',
                    techSpecifications: [10],
                });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([10]);
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should parse comma-separated techSpecifications string', async () => {
            mockConnection.execute
                .mockResolvedValueOnce([[{ lookupKey: 10 }], []])
                .mockResolvedValueOnce([[{ lookupKey: 11 }], []]);

            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Developer',
                    techSpecifications: '10, 11',
                });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([10, 11]);
        });

        it('should reject when min experience exceeds max', async () => {
            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Developer',
                    experienceMinYears: 5,
                    experienceMaxYears: 2,
                });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION_ERROR');
        });

        it('should convert structured bullets overview to text', async () => {
            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Role',
                    overview: {
                        type: 'bullets',
                        content: [{ text: '• Point one\n• Point two' }],
                    },
                });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('Point');
        });

        it('should convert paragraph overview to text', async () => {
            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Role',
                    overview: {
                        type: 'paragraph',
                        content: [{ text: 'First line\nSecond line' }],
                    },
                });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('First line');
        });

        it('should parse JSON string overview', async () => {
            const payload = JSON.stringify({
                type: 'paragraph',
                content: [{ text: 'Hello' }],
            });

            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: payload,
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('Hello');
        });

        it('should normalize invalid JSON-like string overview without throwing', async () => {
            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: '{"not": "closed json',
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toBeTruthy();
        });

        it('should split newline-only structured text into jobOverview via fallback path', async () => {
            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: {
                    type: 'bullets',
                    content: [{ text: '   \n   \n   ' }],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toBeNull();
        });

        it('should split heuristic multi-line bullets without marker characters', async () => {
            const text = [
                'This is a long first line that definitely has more than five words in it total.',
                'Second line starts with capital after previous content.',
            ].join('\n');

            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: {
                    type: 'bullets',
                    content: [{ text }],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('Second line');
        });

        it('should convert mixed array structured overview (paragraph + bullets)', async () => {
            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: [
                    {
                        type: 'paragraph',
                        content: [{ text: 'Para block\nLine two' }],
                    },
                    {
                        type: 'bullets',
                        content: [{ text: 'Single bullet line' }],
                    },
                ],
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('Para block');
            expect(res.body.jobOverview).toContain('Single bullet');
        });

        it('should strip quoted comma-separated techSpecifications string', async () => {
            mockConnection.execute
                .mockResolvedValueOnce([[{ lookupKey: 10 }], []])
                .mockResolvedValueOnce([[{ lookupKey: 11 }], []]);

            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Developer',
                    techSpecifications: '"10, 11"',
                });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([10, 11]);
        });

        it('should strip single-quoted comma-separated techSpecifications string', async () => {
            mockConnection.execute
                .mockResolvedValueOnce([[{ lookupKey: 10 }], []])
                .mockResolvedValueOnce([[{ lookupKey: 11 }], []]);

            const res = await request(app)
                .post('/job-profiles')
                .send({
                    position: 'Developer',
                    techSpecifications: '\'10, 11\'',
                });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([10, 11]);
        });

        it('should normalize plain string overview (non-JSON)', async () => {
            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: '  hello   world  ',
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toBe('hello world');
        });

        it('should split bullets on empty line between paragraphs in marker-less text', async () => {
            const text = ['First sentence is complete.', '', 'Second block starts here.'].join('\n');

            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: {
                    type: 'bullets',
                    content: [{ text }],
                },
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('First sentence');
            expect(res.body.jobOverview).toContain('Second block');
        });

        it('should split array-form bullets with embedded newlines per item', async () => {
            const res = await request(app).post('/job-profiles').send({
                position: 'Role',
                overview: [
                    {
                        type: 'bullets',
                        content: [{ text: 'line a\nline b' }],
                    },
                ],
            });

            expect(res.status).toBe(200);
            expect(res.body.jobOverview).toContain('line a');
        });
    });

    describe('validateUpdate', () => {
        it('should transform partial update', async () => {
            const res = await request(app)
                .put('/job-profiles/3')
                .send({ position: 'Lead' });

            expect(res.status).toBe(200);
            expect(res.body.jobRole).toBe('Lead');
        });

        it('should reject invalid id param', async () => {
            const res = await request(app).put('/job-profiles/abc').send({ position: 'X' });

            expect(res.status).toBe(400);
        });

        it('should merge param and body validation errors', async () => {
            const res = await request(app).put('/job-profiles/abc').send({});

            expect(res.status).toBe(400);
            expect(res.body.details.validationErrors.length).toBeGreaterThan(0);
        });

        it('should parse techSpecifications string on update', async () => {
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 10 }]]);

            const res = await request(app)
                .put('/job-profiles/5')
                .send({ techSpecifications: '10' });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([10]);
        });

        it('should strip quoted techSpecifications string on update', async () => {
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 10 }], []]);

            const res = await request(app).put('/job-profiles/5').send({ techSpecifications: '"10"' });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([10]);
        });

        it('should clear tech specs when empty array on update', async () => {
            const res = await request(app).put('/job-profiles/5').send({ techSpecifications: [] });

            expect(res.status).toBe(200);
            expect(res.body.techSpecLookupIds).toEqual([]);
        });

        it('should transform structured fields on update', async () => {
            const res = await request(app)
                .put('/job-profiles/5')
                .send({
                    responsibilities: {
                        type: 'bullets',
                        content: [{ text: '• Do work' }],
                    },
                });

            expect(res.status).toBe(200);
            expect(res.body.keyResponsibilities).toBeTruthy();
        });
    });

    describe('validateDelete', () => {
        it('should reject invalid id', async () => {
            const res = await request(app).delete('/job-profiles/x');

            expect(res.status).toBe(400);
        });

        it('should pass for numeric id', async () => {
            const res = await request(app).delete('/job-profiles/12');

            expect(res.status).toBe(204);
        });
    });

    describe('validateGetById', () => {
        it('should reject invalid id', async () => {
            const res = await request(app).get('/job-profiles/bad/detail');

            expect(res.status).toBe(400);
        });

        it('should pass for valid id', async () => {
            const res = await request(app).get('/job-profiles/99/detail');

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('99');
        });
    });

    describe('validateSearch', () => {
        it('should attach validatedSearch with defaults', async () => {
            const res = await request(app).get('/job-profiles/search').query({ position: 'Dev' });

            expect(res.status).toBe(200);
            expect(res.body.position).toBe('Dev');
            expect(res.body.limit).toBe(50);
            expect(res.body.offset).toBe(0);
        });

        it('should reject when minExperience exceeds maxExperience', async () => {
            const res = await request(app)
                .get('/job-profiles/search')
                .query({ minExperience: 10, maxExperience: 2 });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe('SEARCH_VALIDATION_ERROR');
        });
    });

    describe('JobProfileValidatorHelper', () => {
        it('validateTechSpecifications should use cache on repeat', async () => {
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 10 }]]);

            const first = await JobProfileValidator.helper.validateTechSpecifications([10], mockConnection);
            const second = await JobProfileValidator.helper.validateTechSpecifications([10], mockConnection);

            expect(first).toEqual([10]);
            expect(second).toEqual([10]);
            expect(mockConnection.execute).toHaveBeenCalledTimes(1);
        });

        it('validateTechSpecifications should throw when lookup missing', async () => {
            mockConnection.execute.mockResolvedValue([[], []]);

            await expect(
                JobProfileValidator.helper.validateTechSpecifications([999], mockConnection)
            ).rejects.toMatchObject({ errorCode: 'INVALID_TECH_SPEC' });
        });

        it('validateJobProfileExists should return boolean', async () => {
            mockConnection.execute.mockResolvedValueOnce([[{ x: 1 }], []]).mockResolvedValueOnce([[], []]);

            await expect(JobProfileValidator.helper.validateJobProfileExists(1, mockConnection)).resolves.toBe(true);

            await expect(JobProfileValidator.helper.validateJobProfileExists(404, mockConnection)).resolves.toBe(false);
        });

        it('validateTechSpecifications skips falsy ids and clears cache after TTL', async () => {
            mockConnection.execute.mockResolvedValue([[{ lookupKey: 10 }], []]);
            const helper = JobProfileValidator.helper;
            helper.clearCache();
            helper.cacheInitializedAt = 1_000_000;
            const dateSpy = jest.spyOn(Date, 'now');
            dateSpy.mockReturnValue(1_000_000);
            await helper.validateTechSpecifications([0, null, 10], mockConnection);
            expect(mockConnection.execute).toHaveBeenCalledTimes(1);
            dateSpy.mockReturnValue(1_000_000 + 6 * 60 * 1000);
            await helper.validateTechSpecifications([10], mockConnection);
            expect(mockConnection.execute).toHaveBeenCalledTimes(2);
            dateSpy.mockRestore();
        });
    });
});
