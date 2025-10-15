const CandidateValidator = require('../../validators/candidateValidator');
const AppError = require('../../utils/appError');
const fs = require('fs');
const path = require('path');

jest.mock('fs', () => ({
    unlink: jest.fn((path, callback) => callback && callback())
}));

describe('CandidateValidatorHelper', () => {
    let helper;
    let mockDb;
    let mockClient;

    beforeEach(() => {
        mockClient = {
            execute: jest.fn(),
            release: jest.fn(),
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        CandidateValidator.init(mockDb);
        helper = CandidateValidator.helper;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getStatusIdByName', () => {
        it('should return cached status ID if exists', async () => {
            helper.statusCache.set('selected', 1);

            const result = await helper.getStatusIdByName('selected');

            expect(result).toBe(1);
            expect(mockDb.getConnection).not.toHaveBeenCalled();
        });

        it('should fetch and cache status ID from database', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 2 }]]);

            const result = await helper.getStatusIdByName('rejected');

            expect(result).toBe(2);
            expect(helper.statusCache.get('rejected')).toBe(2);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT lookupKey FROM lookup'),
                ['rejected']
            );
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should handle case-insensitive status names', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 3 }]]);

            await helper.getStatusIdByName('SELECTED');

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['SELECTED']
            );
            expect(helper.statusCache.get('selected')).toBe(3);
        });

        it('should trim whitespace from status names', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 4 }]]);

            await helper.getStatusIdByName('  selected  ');

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['selected']
            );
        });

        it('should return null for null status name', async () => {
            const result = await helper.getStatusIdByName(null);

            expect(result).toBeNull();
            expect(mockDb.getConnection).not.toHaveBeenCalled();
        });

        it('should return null for undefined status name', async () => {
            const result = await helper.getStatusIdByName(undefined);

            expect(result).toBeNull();
        });

        it('should throw AppError when status does not exist', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await expect(helper.getStatusIdByName('invalid'))
                .rejects
                .toMatchObject({
                    message: "Invalid status: 'invalid'. Status does not exist.",
                    statusCode: 400,
                    errorCode: 'INVALID_STATUS'
                });

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should use provided client when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[{ lookupKey: 5 }]]),
                release: jest.fn()
            };

            await helper.getStatusIdByName('pending', externalClient);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(externalClient.execute).toHaveBeenCalledTimes(1);
            expect(externalClient.release).not.toHaveBeenCalled();
        });

        it('should release connection when no client provided', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 6 }]]);

            await helper.getStatusIdByName('active');

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('transformLocation', () => {
        it('should transform and return location ID for Bangalore', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 1 }]]);

            const result = await helper.transformLocation('Bangalore');

            expect(result).toBe(1);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT lookupKey FROM lookup'),
                ['bangalore']
            );
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should normalize Bengaluru to Bangalore', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 1 }]]);

            await helper.transformLocation('Bengaluru');

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['bangalore']
            );
        });

        it('should handle Ahmedabad location', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 2 }]]);

            const result = await helper.transformLocation('Ahmedabad');

            expect(result).toBe(2);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['ahmedabad']
            );
        });

        it('should handle San Francisco location', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 3 }]]);

            const result = await helper.transformLocation('San Francisco');

            expect(result).toBe(3);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['san francisco']
            );
        });

        it('should return null for null location', async () => {
            const result = await helper.transformLocation(null);

            expect(result).toBeNull();
            expect(mockDb.getConnection).not.toHaveBeenCalled();
        });

        it('should return null for undefined location', async () => {
            const result = await helper.transformLocation(undefined);

            expect(result).toBeNull();
        });

        it('should throw AppError for invalid location', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await expect(helper.transformLocation('Invalid City'))
                .rejects
                .toMatchObject({
                    message: "Invalid location: 'Invalid City'. Must be either Ahmedabad, Bangalore or San Francisco.",
                    statusCode: 400,
                    errorCode: 'INVALID_LOCATION'
                });

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should handle case-insensitive location names', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 1 }]]);

            await helper.transformLocation('BANGALORE');

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['bangalore']
            );
        });

        it('should trim whitespace from location names', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 1 }]]);

            await helper.transformLocation('  bangalore  ');

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['bangalore']
            );
        });

        it('should use provided client when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[{ lookupKey: 1 }]]),
                release: jest.fn()
            };

            await helper.transformLocation('Bangalore', externalClient);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(externalClient.execute).toHaveBeenCalledTimes(1);
            expect(externalClient.release).not.toHaveBeenCalled();
        });

        it('should handle empty result set', async () => {
            mockClient.execute.mockResolvedValue([null]);

            await expect(helper.transformLocation('Unknown'))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('checkEmailExists', () => {
        const testEmail = 'test@example.com';

        it('should return true when email exists', async () => {
            mockClient.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            const result = await helper.checkEmailExists(testEmail);

            expect(result).toBe(true);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT candidateId FROM candidate WHERE email = ?'),
                [testEmail]
            );
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should return false when email does not exist', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            const result = await helper.checkEmailExists('nonexistent@example.com');

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should exclude specific candidate ID when provided', async () => {
            mockClient.execute.mockResolvedValue([[]]);
            const excludeId = 5;

            await helper.checkEmailExists(testEmail, excludeId);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                [testEmail, excludeId]
            );
        });

        it('should not exclude ID when excludeCandidateId is null', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await helper.checkEmailExists(testEmail, null);

            const callArgs = mockClient.execute.mock.calls[0];
            expect(callArgs[0]).not.toContain('AND candidateId != ?');
            expect(callArgs[1]).toEqual([testEmail]);
        });

        it('should use provided client when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[]]),
                release: jest.fn()
            };

            await helper.checkEmailExists(testEmail, null, externalClient);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(externalClient.execute).toHaveBeenCalledTimes(1);
            expect(externalClient.release).not.toHaveBeenCalled();
        });

        it('should release connection when no client provided', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await helper.checkEmailExists(testEmail);

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple matching emails', async () => {
            mockClient.execute.mockResolvedValue([
                [{ candidateId: 1 }, { candidateId: 2 }]
            ]);

            const result = await helper.checkEmailExists(testEmail);

            expect(result).toBe(true);
        });
    });

    describe('checkContactExists', () => {
        const testContact = '1234567890';

        it('should return true when contact exists', async () => {
            mockClient.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            const result = await helper.checkContactExists(testContact);

            expect(result).toBe(true);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT candidateId FROM candidate WHERE contactNumber = ?'),
                [testContact]
            );
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should return false when contact does not exist', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            const result = await helper.checkContactExists('9999999999');

            expect(result).toBe(false);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should exclude specific candidate ID when provided', async () => {
            mockClient.execute.mockResolvedValue([[]]);
            const excludeId = 5;

            await helper.checkContactExists(testContact, excludeId);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                [testContact, excludeId]
            );
        });

        it('should not exclude ID when excludeCandidateId is null', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await helper.checkContactExists(testContact, null);

            const callArgs = mockClient.execute.mock.calls[0];
            expect(callArgs[0]).not.toContain('AND candidateId != ?');
            expect(callArgs[1]).toEqual([testContact]);
        });

        it('should use provided client when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[]]),
                release: jest.fn()
            };

            await helper.checkContactExists(testContact, null, externalClient);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(externalClient.execute).toHaveBeenCalledTimes(1);
            expect(externalClient.release).not.toHaveBeenCalled();
        });

        it('should release connection when no client provided', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await helper.checkContactExists(testContact);

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });
});

describe('CandidateValidator', () => {
    let mockDb;
    let mockClient;
    let req;
    let res;
    let next;

    beforeEach(() => {
        mockClient = {
            execute: jest.fn(),
            release: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };

        CandidateValidator.init(mockDb);

        req = {
            body: {},
            params: {},
            query: {},
            file: null
        };

        res = {};
        next = jest.fn();

        // Clear fs.unlink mock
        fs.unlink.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('validateCreate', () => {
        const validCreateData = {
            candidateName: 'John Doe',
            contactNumber: '+91-9876543210',
            email: 'john@example.com',
            recruiterName: 'Jayraj',
            jobRole: 'Software Engineer',
            preferredJobLocation: 'bangalore',
            currentCTC: 500000,
            expectedCTC: 600000,
            noticePeriod: 30,
            experienceYears: 5,
            linkedinProfileUrl: 'https://linkedin.com/in/johndoe',
            status: 'interview pending'
        };

        beforeEach(() => {
            // Mock location transformation
            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[{ lookupKey: 3 }]]) // status
                .mockResolvedValueOnce([[]]) // email check
                .mockResolvedValueOnce([[]]); // contact check
        });

        it('should validate and transform valid create data', async () => {
            req.body = { ...validCreateData };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.preferredJobLocation).toBe(1);
            expect(req.body.statusId).toBe(3);
            expect(req.body.status).toBeUndefined();
        });

        it('should fail validation when required fields are missing', async () => {
            req.body = { candidateName: 'John' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.errorCode).toBe('VALIDATION_ERROR');
            expect(error.details.validationErrors).toBeDefined();
        });

        it('should reject invalid candidate name with numbers', async () => {
            req.body = { ...validCreateData, candidateName: 'John123' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors.some(e =>
                e.field === 'candidateName'
            )).toBe(true);
        });

        it('should reject candidate name shorter than 2 characters', async () => {
            req.body = { ...validCreateData, candidateName: 'J' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject invalid email format', async () => {
            req.body = { ...validCreateData, email: 'invalid-email' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject invalid contact number format', async () => {
            req.body = { ...validCreateData, contactNumber: '123' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should validate recruiter name against allowed list', async () => {
            req.body = { ...validCreateData, recruiterName: 'Invalid Recruiter' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should accept valid recruiter names (case-insensitive)', async () => {
            req.body = { ...validCreateData, recruiterName: 'JAYRAJ' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject invalid job location', async () => {
            req.body = { ...validCreateData, preferredJobLocation: 'invalid city' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject negative CTC values', async () => {
            req.body = { ...validCreateData, currentCTC: -1000 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject expectedCTC less than currentCTC', async () => {
            req.body = { ...validCreateData, currentCTC: 600000, expectedCTC: 500000 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject notice period exceeding 365 days', async () => {
            req.body = { ...validCreateData, noticePeriod: 400 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject experience years exceeding 50', async () => {
            req.body = { ...validCreateData, experienceYears: 51 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should validate LinkedIn URL format', async () => {
            req.body = { ...validCreateData, linkedinProfileUrl: 'https://facebook.com/john' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should accept valid LinkedIn URL', async () => {
            req.body = { ...validCreateData, linkedinProfileUrl: 'https://linkedin.com/in/john-doe' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should accept empty LinkedIn URL', async () => {
            req.body = { ...validCreateData, linkedinProfileUrl: '' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should validate status against allowed values', async () => {
            req.body = { ...validCreateData, status: 'invalid status' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should throw error when email already exists', async () => {
            // Arrange
            req.body = { ...validCreateData, email: 'existing@example.com' };
            next = jest.fn();
            res = {};

            // Mock database connection to return mock client
            mockClient = {
                execute: jest.fn(),
                release: jest.fn()
            };
            mockDb = {
                getConnection: jest.fn().mockResolvedValue(mockClient)
            };

            CandidateValidator.init(mockDb);

            // Mock sequential execute calls in order to simulate db queries
            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]])  // location transform
                .mockResolvedValueOnce([[{ lookupKey: 3 }]])  // status transform
                .mockResolvedValueOnce([[{ candidateId: 99 }]]); // email duplication found

            // Act
            await CandidateValidator.validateCreate(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
            expect(next.mock.calls[0][0].errorCode).toBe('DUPLICATE_EMAIL');
        });

        it('should throw error when contact number already exists', async () => {
            // Arrange
            req.body = { ...validCreateData };

            next = jest.fn();
            res = {};

            mockClient = {
                execute: jest.fn(),
                release: jest.fn()
            };
            mockDb = {
                getConnection: jest.fn().mockResolvedValue(mockClient)
            };

            CandidateValidator.init(mockDb);

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]])  // transformLocation call
                .mockResolvedValueOnce([[{ lookupKey: 3 }]])  // getStatusIdByName call
                .mockResolvedValueOnce([[]])                    // email does not exist
                .mockResolvedValueOnce([[{ candidateId: 1 }]]); // contact number exists

            // Act
            await CandidateValidator.validateCreate(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
            expect(next.mock.calls[0][0].errorCode).toBe('DUPLICATE_CONTACT');
        });

        it('should validate resume file type', async () => {
            req.body = { ...validCreateData };
            req.file = {
                mimetype: 'image/jpeg',
                path: '/tmp/test.jpg',
                size: 1024
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(fs.unlink).toHaveBeenCalledWith('/tmp/test.jpg', expect.any(Function));
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.message).toContain('Invalid resume file format');
        });

        it('should accept valid resume file types', async () => {
            req.body = { ...validCreateData };
            req.file = {
                mimetype: 'application/pdf',
                path: '/tmp/test.pdf',
                size: 1024 * 1024
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(fs.unlink).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith();
        });

        it('should reject resume file exceeding 5MB', async () => {
            req.body = { ...validCreateData };
            req.file = {
                mimetype: 'application/pdf',
                path: '/tmp/test.pdf',
                size: 6 * 1024 * 1024
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(fs.unlink).toHaveBeenCalledWith('/tmp/test.pdf', expect.any(Function));
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.message).toContain('Resume file size cannot exceed 5MB');
        });

        it('should clean up uploaded file on validation error', async () => {
            req.body = { candidateName: 'J' }; // Invalid candidate name triggers error
            req.file = {
                mimetype: 'application/pdf',
                path: '/tmp/test.pdf',
                size: 1024
            };

            // Patch promise-based unlink for this test
            fs.promises = fs.promises || {};
            fs.promises.unlink = jest.fn(() => Promise.resolve());

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            await CandidateValidator.validateCreate(req, res, next);

            expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/test.pdf');
        });

        it('should strip unknown fields from request body', async () => {
            req.body = { ...validCreateData, unknownField: 'should be removed' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.unknownField).toBeUndefined();
        });

        it('should convert and trim string fields', async () => {
            req.body = { ...validCreateData, candidateName: '  John Doe  ' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.candidateName).toBe('John Doe');
        });
    });

    describe('validateUpdate', () => {
        const validUpdateData = {
            candidateName: 'Jane Doe',
            email: 'jane@example.com'
        };

        beforeEach(() => {
            req.params = { id: '1' };
            mockClient.execute.mockResolvedValue([[]]);
        });

        it('should validate and transform valid update data', async () => {
            req.body = { ...validUpdateData };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.candidateName).toBe('Jane Doe');
        });

        it('should require at least one field for update', async () => {
            req.body = {};

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors[0].message).toContain('At least one field must be provided');
        });

        it('should allow update with only file upload', async () => {
            req.body = {};
            req.file = {
                mimetype: 'application/pdf',
                path: '/tmp/resume.pdf',
                size: 1024,
                originalname: 'resume.pdf'
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.resumeOriginalName).toBe('resume.pdf');
        });

        it('should validate candidate ID in params', async () => {
            req.params = { id: 'invalid' };
            req.body = { ...validUpdateData };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject negative candidate ID', async () => {
            req.params = { id: '-1' };
            req.body = { ...validUpdateData };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should transform location when provided', async () => {
            req.body = { preferredJobLocation: 'bangalore' };
            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 1 }]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(req.body.preferredJobLocation).toBe(1);
        });

        it('should transform status when provided', async () => {
            req.body = { status: 'selected' };
            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 2 }]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(req.body.statusId).toBe(2);
            expect(req.body.status).toBeUndefined();
        });

        it('should check email uniqueness excluding current candidate', async () => {
            req.body = { email: 'newemail@example.com' };
            mockClient.execute.mockResolvedValueOnce([[]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                ['newemail@example.com', '1']
            );
        });

        it('should throw error when email exists for another candidate', async () => {
            req.body = { email: 'existing@example.com' };
            mockClient.execute.mockResolvedValueOnce([[{ candidateId: 2 }]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.errorCode).toBe('DUPLICATE_EMAIL');
        });

        it('should check contact uniqueness excluding current candidate', async () => {
            req.body = { contactNumber: '9876543210' };
            mockClient.execute.mockResolvedValueOnce([[]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                ['9876543210', '1']
            );
        });

        it('should validate CTC range when both provided', async () => {
            req.body = { currentCTC: 600000, expectedCTC: 500000 };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors[0].message).toContain('Expected CTC should not be less than current CTC');
        });

        it('should allow updating only currentCTC', async () => {
            req.body = { currentCTC: 700000 };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should allow updating only expectedCTC', async () => {
            req.body = { expectedCTC: 800000 };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should validate resume file on update', async () => {
            req.body = { candidateName: 'Updated Name' };
            req.file = {
                mimetype: 'application/msword',
                path: '/tmp/resume.doc',
                size: 2 * 1024 * 1024,
                originalname: 'updated-resume.doc'
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.resumeOriginalName).toBe('updated-resume.doc');
        });

        it('should reject invalid resume file type on update', async () => {
            req.body = { candidateName: 'Updated Name' };
            req.file = {
                mimetype: 'text/plain',
                path: '/tmp/resume.txt',
                size: 1024
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(fs.unlink).toHaveBeenCalledWith('/tmp/resume.txt', expect.any(Function));
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should clean up file on update validation error', async () => {
            req.body = { candidateName: 'J' };
            req.file = {
                mimetype: 'application/pdf',
                path: '/tmp/test.pdf',
                size: 1024
            };

            // Patch promise-based unlink for this test
            fs.promises = fs.promises || {};
            fs.promises.unlink = jest.fn(() => Promise.resolve());

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/test.pdf');
        });

        it('should allow partial updates with valid fields', async () => {
            req.body = {
                candidateName: 'Updated Name',
                noticePeriod: 60
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.candidateName).toBe('Updated Name');
            expect(req.body.noticePeriod).toBe(60);
        });

        it('should handle multiple validation errors', async () => {
            req.params = { id: 'invalid' };
            req.body = {
                email: 'invalid-email',
                experienceYears: 100
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors.length).toBeGreaterThan(1);
        });
    });

    describe('validateDelete', () => {
        it('should validate valid candidate ID for deletion', () => {
            req.params = { id: '1' };

            CandidateValidator.validateDelete(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject invalid candidate ID', () => {
            req.params = { id: 'invalid' };

            expect(() => {
                CandidateValidator.validateDelete(req, res, next);
            }).toThrow(AppError);
        });

        it('should reject negative candidate ID', () => {
            req.params = { id: '-5' };

            expect(() => {
                CandidateValidator.validateDelete(req, res, next);
            }).toThrow(AppError);
        });

        it('should reject zero as candidate ID', () => {
            req.params = { id: '0' };

            expect(() => {
                CandidateValidator.validateDelete(req, res, next);
            }).toThrow(AppError);
        });

        it('should reject missing candidate ID', () => {
            req.params = {};

            expect(() => {
                CandidateValidator.validateDelete(req, res, next);
            }).toThrow(AppError);
        });

        it('should reject non-integer candidate ID', () => {
            req.params = { id: '1.5' };

            expect(() => {
                CandidateValidator.validateDelete(req, res, next);
            }).toThrow(AppError);
        });
    });

    describe('validateSearch', () => {
        beforeEach(() => {
            mockClient.execute.mockResolvedValue([[]]);
        });

        it('should validate empty search query with defaults', async () => {
            req.query = {};

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.validatedSearch.limit).toBe(50);
            expect(req.validatedSearch.offset).toBe(0);
        });

        it('should validate search with single filter', async () => {
            req.query = { candidateName: 'John' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.validatedSearch.candidateName).toBe('John');
        });

        it('should validate search with multiple filters', async () => {
            req.query = {
                candidateName: 'John',
                jobRole: 'Engineer',
                minExperience: '2',
                maxExperience: '5'
            };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.validatedSearch.candidateName).toBe('John');
            expect(req.validatedSearch.jobRole).toBe('Engineer');
            expect(req.validatedSearch.minExperience).toBe(2);
            expect(req.validatedSearch.maxExperience).toBe(5);
        });

        it('should reject minExperience greater than maxExperience', async () => {
            req.query = {
                minExperience: '10',
                maxExperience: '5'
            };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors[0].message).toContain('Minimum experience cannot be greater than maximum experience');
        });

        it('should reject minCurrentCTC greater than maxCurrentCTC', async () => {
            req.query = {
                minCurrentCTC: '800000',
                maxCurrentCTC: '500000'
            };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors[0].message).toContain('Minimum CTC cannot be greater than maximum CTC');
        });

        it('should validate and transform location in search', async () => {
            req.query = { preferredJobLocation: 'bangalore' };
            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 1 }]]);

            await CandidateValidator.validateSearch(req, res, next);

            expect(req.validatedSearch.preferredJobLocation).toBeDefined();
        });

        it('should validate and transform status in search', async () => {
            req.query = { status: 'selected' };
            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 2 }]]);

            await CandidateValidator.validateSearch(req, res, next);

            expect(req.validatedSearch.statusId).toBe(2);
            expect(req.validatedSearch.status).toBeUndefined();
        });

        it('should validate email format in search', async () => {
            req.query = { email: 'invalid-email' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should validate limit parameter', async () => {
            req.query = { limit: '100' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.validatedSearch.limit).toBe(100);
        });

        it('should reject limit exceeding maximum', async () => {
            req.query = { limit: '2000' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject limit less than 1', async () => {
            req.query = { limit: '0' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should validate offset parameter', async () => {
            req.query = { offset: '20' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.validatedSearch.offset).toBe(20);
        });

        it('should reject negative offset', async () => {
            req.query = { offset: '-1' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should strip unknown query parameters', async () => {
            req.query = {
                candidateName: 'John',
                unknownField: 'should be removed'
            };

            await CandidateValidator.validateSearch(req, res, next);

            expect(req.validatedSearch.unknownField).toBeUndefined();
        });

        it('should accept valid location values', async () => {
            req.query = { preferredJobLocation: 'ahmedabad' };
            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 2 }]]);

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should handle bengaluru as valid location', async () => {
            req.query = { preferredJobLocation: 'bengaluru' };
            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 1 }]]);

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should convert string numbers to integers', async () => {
            req.query = {
                minExperience: '5',
                maxExperience: '10',
                limit: '25'
            };

            await CandidateValidator.validateSearch(req, res, next);

            expect(typeof req.validatedSearch.minExperience).toBe('number');
            expect(typeof req.validatedSearch.maxExperience).toBe('number');
            expect(typeof req.validatedSearch.limit).toBe('number');
        });
    });

    describe('Schema Validation Edge Cases', () => {
        beforeEach(() => {
            mockClient.execute.mockResolvedValue([[]]);
        });

        it('should trim whitespace from all string fields', async () => {
            req.body = {
                candidateName: '  John Doe  ',
                contactNumber: '  +91-9876543210  ',
                email: '  john@example.com  ',
                recruiterName: '  Jayraj  ',
                jobRole: '  Software Engineer  ',
                preferredJobLocation: '  bangalore  ',
                currentCTC: 500000,
                expectedCTC: 600000,
                noticePeriod: 30,
                experienceYears: 5
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[]]) // email
                .mockResolvedValueOnce([[]]); // contact

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.candidateName).toBe('John Doe');
            expect(req.body.email).toBe('john@example.com');
        });

        it('should lowercase email addresses', async () => {
            req.body = {
                candidateName: 'John Doe',
                contactNumber: '+91-9876543210',
                email: 'JOHN@EXAMPLE.COM',
                recruiterName: 'Jayraj',
                jobRole: 'Software Engineer',
                preferredJobLocation: 'bangalore',
                currentCTC: 500000,
                expectedCTC: 600000,
                noticePeriod: 30,
                experienceYears: 5
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[]]) // email
                .mockResolvedValueOnce([[]]); // contact

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.email).toBe('john@example.com');
        });

        it('should accept names with apostrophes and hyphens', async () => {
            req.body = {
                candidateName: "O'Brien-Smith",
                contactNumber: '+91-9876543210',
                email: 'obrien@example.com',
                recruiterName: 'Jayraj',
                jobRole: 'Software Engineer',
                preferredJobLocation: 'bangalore',
                currentCTC: 500000,
                expectedCTC: 600000,
                noticePeriod: 30,
                experienceYears: 5
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[]]) // email
                .mockResolvedValueOnce([[]]); // contact

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should accept zero experience years', async () => {
            req.body = {
                candidateName: 'Fresh Graduate',
                contactNumber: '+91-9876543210',
                email: 'fresh@example.com',
                recruiterName: 'Jayraj',
                jobRole: 'Junior Developer',
                preferredJobLocation: 'bangalore',
                currentCTC: 0,
                expectedCTC: 300000,
                noticePeriod: 0,
                experienceYears: 0
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[]]) // email
                .mockResolvedValueOnce([[]]); // contact

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.experienceYears).toBe(0);
        });

        it('should accept equal currentCTC and expectedCTC', async () => {
            req.body = {
                candidateName: 'John Doe',
                contactNumber: '+91-9876543210',
                email: 'john@example.com',
                recruiterName: 'Jayraj',
                jobRole: 'Software Engineer',
                preferredJobLocation: 'bangalore',
                currentCTC: 500000,
                expectedCTC: 500000,
                noticePeriod: 30,
                experienceYears: 5
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[]]) // email
                .mockResolvedValueOnce([[]]); // contact

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject CTC exceeding maximum', async () => {
            req.body = {
                candidateName: 'John Doe',
                contactNumber: '+91-9876543210',
                email: 'john@example.com',
                recruiterName: 'Jayraj',
                jobRole: 'Software Engineer',
                preferredJobLocation: 'bangalore',
                currentCTC: 11000000,
                expectedCTC: 12000000,
                noticePeriod: 30,
                experienceYears: 5
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should accept contact numbers with various formats', async () => {
            const validFormats = [
                '+91-9876543210',
                '9876543210',
                '+1 (555) 123-4567',
                '+44 20 7946 0958'
            ];

            for (const format of validFormats) {
                req.body = {
                    candidateName: 'John Doe',
                    contactNumber: format,
                    email: `john${Math.random()}@example.com`,
                    recruiterName: 'Jayraj',
                    jobRole: 'Software Engineer',
                    preferredJobLocation: 'bangalore',
                    currentCTC: 500000,
                    expectedCTC: 600000,
                    noticePeriod: 30,
                    experienceYears: 5
                };

                mockClient.execute
                    .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                    .mockResolvedValueOnce([[]]) // email
                    .mockResolvedValueOnce([[]]); // contact

                await CandidateValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalled();
                jest.clearAllMocks();
            }
        });
    });

    describe('Integration Tests', () => {
        beforeEach(() => {
            mockClient.execute.mockResolvedValue([[]]);
        });

        it('should handle complete create flow with all transformations', async () => {
            req.body = {
                candidateName: '  Jane Smith  ',
                contactNumber: '+91-9876543210',
                email: 'JANE@EXAMPLE.COM',
                recruiterName: 'khushi',
                jobRole: 'Data Scientist',
                preferredJobLocation: 'Bengaluru',
                currentCTC: 800000,
                expectedCTC: 1000000,
                noticePeriod: 45,
                experienceYears: 7,
                linkedinProfileUrl: 'https://linkedin.com/in/jane-smith',
                status: 'Interview Pending'
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location
                .mockResolvedValueOnce([[{ lookupKey: 3 }]]) // status
                .mockResolvedValueOnce([[]]) // email
                .mockResolvedValueOnce([[]]); // contact

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.candidateName).toBe('Jane Smith');
            expect(req.body.email).toBe('jane@example.com');
            expect(req.body.preferredJobLocation).toBe(1);
            expect(req.body.statusId).toBe(3);
            expect(req.body.status).toBeUndefined();
        });

        it('should handle complete update flow with partial data', async () => {
            req.params = { id: '5' };
            req.body = {
                email: 'newemail@example.com',
                jobRole: 'Senior Engineer',
                expectedCTC: 1200000,
                // Omit preferredJobLocation and status if you don't want to mock their DB calls
            };

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            // Mock email check result
            mockClient.execute.mockResolvedValueOnce([[]]); // email does not exist

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();  // next() with no args means success
            expect(req.body.email).toBe('newemail@example.com');
            expect(req.body.jobRole).toBe('Senior Engineer');
        });

        it('should handle search with all filters and transformations', async () => {
            req.query = {
                candidateName: 'John',
                email: 'john@example.com',
                jobRole: 'Engineer',
                preferredJobLocation: 'bangalore',
                recruiterName: 'Jayraj',
                minExperience: '3',
                maxExperience: '8',
                minCurrentCTC: '400000',
                maxCurrentCTC: '900000',
                status: 'selected',
                limit: '30',
                offset: '10'
            };

            mockClient.execute
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]) // location (if needed)
                .mockResolvedValueOnce([[{ lookupKey: 1 }]]); // status

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.validatedSearch.minExperience).toBe(3);
            expect(req.validatedSearch.maxExperience).toBe(8);
            expect(req.validatedSearch.limit).toBe(30);
            expect(req.validatedSearch.offset).toBe(10);
            expect(req.validatedSearch.statusId).toBe(1);
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors in helper methods', async () => {
            req.body = {
                candidateName: 'John Doe',
                contactNumber: '+91-9876543210',
                email: 'john@example.com',
                recruiterName: 'Jayraj',
                jobRole: 'Software Engineer',
                preferredJobLocation: 'bangalore',
                currentCTC: 500000,
                expectedCTC: 600000,
                noticePeriod: 30,
                experienceYears: 5
            };

            mockClient.execute.mockRejectedValue(new Error('Connection failed'));

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should clean up file on database error', async () => {
            req.body = {
                candidateName: 'John Doe',
                contactNumber: '+91-9876543210',
                email: 'john@example.com',
                recruiterName: 'Jayraj',
                jobRole: 'Software Engineer',
                preferredJobLocation: 'bangalore',
                currentCTC: 500000,
                expectedCTC: 600000,
                noticePeriod: 30,
                experienceYears: 5
            };
            req.file = {
                mimetype: 'application/pdf',
                path: '/tmp/resume.pdf',
                size: 1024
            };

            // Mock promise-based unlink
            fs.promises = fs.promises || {};
            fs.promises.unlink = jest.fn(() => Promise.resolve());

            mockClient.execute.mockRejectedValue(new Error('Database error'));

            await CandidateValidator.validateCreate(req, res, next);

            expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/resume.pdf');
        });

        it('should handle multiple validation errors gracefully', async () => {
            req.body = {
                candidateName: 'J',
                email: 'invalid',
                currentCTC: -1000,
                expectedCTC: 'not-a-number'
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors.length).toBeGreaterThan(1);
        });
    });
});