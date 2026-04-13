const { CandidateValidator } = require('../../validators/candidateValidator');
const AppError = require('../../utils/appError');
const fs = require('fs');

jest.mock('fs', () => ({
    unlink: jest.fn((path, callback) => callback && callback())
}));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({}),
    })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => input),
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
            mockClient.execute.mockResolvedValue([[{ '1': 1 }]]);

            const result = await helper.getStatusIdByName('selected');

            expect(result).toBe(1);
            expect(mockClient.execute).toHaveBeenCalled();
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

        it('should default null status name to pending', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 9 }]]);

            const result = await helper.getStatusIdByName(null);

            expect(result).toBe(9);
            expect(mockClient.execute).toHaveBeenCalledWith(expect.any(String), ['pending']);
        });

        it('should default undefined status name to pending', async () => {
            mockClient.execute.mockResolvedValue([[{ lookupKey: 9 }]]);

            const result = await helper.getStatusIdByName(undefined);

            expect(result).toBe(9);
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
        const loc = (city) => ({ country: 'india', city });

        it('should transform and return location ID for Bangalore', async () => {
            mockClient.execute.mockResolvedValue([[{ locationId: 1 }]]);

            const result = await helper.transformLocation(loc('Bangalore'));

            expect(result).toBe(1);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT locationId FROM location'),
                ['Bangalore']
            );
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should normalize Bengaluru to Bangalore', async () => {
            mockClient.execute.mockResolvedValue([[{ locationId: 1 }]]);

            await helper.transformLocation(loc('Bengaluru'));

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['Bengaluru']
            );
        });

        it('should handle Ahmedabad location', async () => {
            mockClient.execute.mockResolvedValue([[{ locationId: 2 }]]);

            const result = await helper.transformLocation(loc('Ahmedabad'));

            expect(result).toBe(2);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['Ahmedabad']
            );
        });

        it('should handle San Francisco location', async () => {
            mockClient.execute.mockResolvedValue([[{ locationId: 3 }]]);

            const result = await helper.transformLocation({ country: 'usa', city: 'San Francisco' });

            expect(result).toBe(3);
            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['San Francisco']
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

            await expect(helper.transformLocation(loc('Invalid City')))
                .rejects
                .toMatchObject({
                    message: "Invalid location: 'Invalid City'. Location does not exist.",
                    statusCode: 400,
                    errorCode: 'INVALID_LOCATION'
                });

            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('should handle case-insensitive location names', async () => {
            mockClient.execute.mockResolvedValue([[{ locationId: 1 }]]);

            await helper.transformLocation(loc('BANGALORE'));

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['BANGALORE']
            );
        });

        it('should trim whitespace from location names', async () => {
            mockClient.execute.mockResolvedValue([[{ locationId: 1 }]]);

            await helper.transformLocation(loc('  bangalore  '));

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['bangalore']
            );
        });

        it('should use provided client when passed', async () => {
            const externalClient = {
                execute: jest.fn().mockResolvedValue([[{ locationId: 1 }]]),
                release: jest.fn()
            };

            await helper.transformLocation(loc('Bangalore'), externalClient);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
            expect(externalClient.execute).toHaveBeenCalledTimes(1);
            expect(externalClient.release).not.toHaveBeenCalled();
        });

        it('should handle empty result set', async () => {
            mockClient.execute.mockResolvedValue([[]]);

            await expect(helper.transformLocation(loc('Unknown')))
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

        const { S3Client } = require('@aws-sdk/client-s3');
        S3Client.mockImplementation(() => ({
            send: jest.fn().mockResolvedValue({}),
        }));

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

    const validCreateData = () => ({
        candidateName: 'John Doe',
        contactNumber: '+91 9876543210',
        email: 'john@example.com',
        recruiterId: 1,
        jobProfileRequirementId: 10,
        expectedLocation: { country: 'india', city: 'Mumbai' },
        workModeId: 2,
        noticePeriod: 30,
        experienceYears: 5,
        linkedinProfileUrl: 'https://linkedin.com/in/johndoe',
    });

    const mockCreateSuccessSequence = (mock, { locationId = 5, statusLookupKey = 7 } = {}) => {
        mock.execute
            .mockResolvedValueOnce([[{ locationId }]])
            .mockResolvedValueOnce([[{ lookupKey: statusLookupKey }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]]);
    };

    describe('validateCreate', () => {
        beforeEach(() => {
            mockCreateSuccessSequence(mockClient);
        });

        it('should validate and transform valid create data', async () => {
            req.body = { ...validCreateData() };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.expectedLocation).toBe(5);
            expect(req.body.statusId).toBe(7);
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
            req.body = { ...validCreateData(), candidateName: 'John123' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors.some(e =>
                e.field === 'candidateName'
            )).toBe(true);
        });

        it('should reject candidate name shorter than 2 characters', async () => {
            req.body = { ...validCreateData(), candidateName: 'J' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject invalid email format', async () => {
            req.body = { ...validCreateData(), email: 'invalid-email' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject invalid contact number format', async () => {
            req.body = { ...validCreateData(), contactNumber: '123' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject invalid recruiter id type', async () => {
            req.body = { ...validCreateData(), recruiterId: 'not-a-number' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should accept numeric recruiter id', async () => {
            req.body = { ...validCreateData(), recruiterId: 99 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject invalid expected location city length', async () => {
            req.body = { ...validCreateData(), expectedLocation: { country: 'india', city: 'x' } };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject negative CTC values', async () => {
            req.body = { ...validCreateData(), currentCTC: -1000 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should allow expectedCTC less than currentCTC', async () => {
            req.body = { ...validCreateData(), currentCTC: 600000, expectedCTC: 500000 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject notice period exceeding 365 days', async () => {
            req.body = { ...validCreateData(), noticePeriod: 400 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject experience years exceeding 50', async () => {
            req.body = { ...validCreateData(), experienceYears: 51 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should validate LinkedIn URL format', async () => {
            req.body = { ...validCreateData(), linkedinProfileUrl: 'https://facebook.com/john' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should accept valid LinkedIn URL', async () => {
            req.body = { ...validCreateData(), linkedinProfileUrl: 'https://linkedin.com/in/john-doe' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should accept empty LinkedIn URL', async () => {
            req.body = { ...validCreateData(), linkedinProfileUrl: '' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should throw error when email already exists', async () => {
            // Arrange
            req.body = { ...validCreateData(), email: 'existing@example.com' };
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

            mockClient.execute
                .mockResolvedValueOnce([[{ locationId: 1 }]])
                .mockResolvedValueOnce([[{ lookupKey: 3 }]])
                .mockResolvedValueOnce([[{ candidateId: 99 }]]);

            // Act
            await CandidateValidator.validateCreate(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
            expect(next.mock.calls[0][0].errorCode).toBe('DUPLICATE_EMAIL');
        });

        it('should throw error when contact number already exists', async () => {
            // Arrange
            req.body = { ...validCreateData() };

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
                .mockResolvedValueOnce([[{ locationId: 1 }]])
                .mockResolvedValueOnce([[{ lookupKey: 3 }]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ candidateId: 1 }]]);

            // Act
            await CandidateValidator.validateCreate(req, res, next);

            // Assert
            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
            expect(next.mock.calls[0][0].errorCode).toBe('DUPLICATE_CONTACT');
        });

        it('should validate resume file type', async () => {
            const { S3Client } = require('@aws-sdk/client-s3');
            req.body = { ...validCreateData() };
            req.file = {
                mimetype: 'image/jpeg',
                key: 'uploads/bad.jpg',
                size: 1024
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(S3Client).toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.message).toContain('Invalid resume file format');
        });

        it('should accept valid resume file types', async () => {
            req.body = { ...validCreateData() };
            req.file = {
                mimetype: 'application/pdf',
                key: 'uploads/good.pdf',
                size: 1024 * 1024
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject resume file exceeding 5MB', async () => {
            const { S3Client } = require('@aws-sdk/client-s3');
            req.body = { ...validCreateData() };
            req.file = {
                mimetype: 'application/pdf',
                key: 'uploads/huge.pdf',
                size: 6 * 1024 * 1024
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(S3Client).toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.message).toContain('Resume file size cannot exceed 5MB');
        });

        it('should clean up uploaded file on validation error', async () => {
            const { S3Client } = require('@aws-sdk/client-s3');
            req.body = { candidateName: 'J' };
            req.file = {
                mimetype: 'application/pdf',
                key: 'uploads/bad.pdf',
                size: 1024
            };

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            await CandidateValidator.validateCreate(req, res, next);

            expect(S3Client).toHaveBeenCalled();
        });

        it('should strip unknown fields from request body', async () => {
            req.body = { ...validCreateData(), unknownField: 'should be removed' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.unknownField).toBeUndefined();
        });

        it('should convert and trim string fields', async () => {
            req.body = { ...validCreateData(), candidateName: '  John Doe  ' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.candidateName).toBe('John Doe');
        });
    });

    describe('validateUpdate', () => {
        const validUpdateData = () => ({
            workModeId: 1,
            candidateName: 'Jane Doe',
            email: 'jane@example.com',
        });

        beforeEach(() => {
            req.params = { id: '1' };
            mockClient.execute.mockResolvedValue([[]]);
        });

        it('should validate and transform valid update data', async () => {
            req.body = { ...validUpdateData() };

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
            expect(error.details.validationErrors[0].message).toMatch(/Work mode|At least one field/);
        });

        it('should allow update with only file upload when body empty', async () => {
            req.body = { workModeId: 1 };
            req.file = {
                mimetype: 'application/pdf',
                key: 'uploads/resume.pdf',
                size: 1024,
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should validate candidate ID in params', async () => {
            req.params = { id: 'invalid' };
            req.body = { ...validUpdateData() };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should reject negative candidate ID', async () => {
            req.params = { id: '-1' };
            req.body = { ...validUpdateData() };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should transform expectedLocation when provided', async () => {
            req.body = {
                workModeId: 1,
                expectedLocation: { country: 'india', city: 'Pune' },
            };
            mockClient.execute.mockResolvedValueOnce([[{ locationId: 9 }]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(req.body.expectedLocation).toBe(9);
        });

        it('should strip unknown status field on update', async () => {
            req.body = { workModeId: 1, status: 'selected' };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(req.body.status).toBeUndefined();
        });

        it('should check email uniqueness excluding current candidate', async () => {
            req.body = { workModeId: 1, email: 'newemail@example.com' };
            mockClient.execute.mockResolvedValueOnce([[]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                ['newemail@example.com', '1']
            );
        });

        it('should throw error when email exists for another candidate', async () => {
            req.body = { workModeId: 1, email: 'existing@example.com' };
            mockClient.execute.mockResolvedValueOnce([[{ candidateId: 2 }]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.errorCode).toBe('DUPLICATE_EMAIL');
        });

        it('should check contact uniqueness excluding current candidate', async () => {
            req.body = { workModeId: 1, contactNumber: '9876543210' };
            mockClient.execute.mockResolvedValueOnce([[]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(mockClient.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                ['9876543210', '1']
            );
        });

        it('should reject incomplete structured current CTC group', async () => {
            req.body = { workModeId: 1, currentCTCAmount: 100 };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should allow updating only currentCTC', async () => {
            req.body = { workModeId: 1, currentCTC: 700000 };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should allow updating only expectedCTC', async () => {
            req.body = { workModeId: 1, expectedCTC: 800000 };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should validate resume file on update', async () => {
            req.body = { workModeId: 1, candidateName: 'Updated Name' };
            req.file = {
                mimetype: 'application/msword',
                key: 'uploads/resume.doc',
                size: 2 * 1024 * 1024,
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject invalid resume file type on update', async () => {
            const { S3Client } = require('@aws-sdk/client-s3');
            req.body = { workModeId: 1, candidateName: 'Updated Name' };
            req.file = {
                mimetype: 'text/plain',
                key: 'uploads/bad.txt',
                size: 1024,
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(S3Client).toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should clean up file on update validation error', async () => {
            const { S3Client } = require('@aws-sdk/client-s3');
            req.body = { workModeId: 1, candidateName: 'J' };
            req.file = {
                mimetype: 'application/pdf',
                key: 'uploads/bad.pdf',
                size: 1024,
            };

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(S3Client).toHaveBeenCalled();
        });

        it('should allow partial updates with valid fields', async () => {
            req.body = {
                workModeId: 1,
                candidateName: 'Updated Name',
                noticePeriod: 60,
            };

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.candidateName).toBe('Updated Name');
            expect(req.body.noticePeriod).toBe(60);
        });

        it('should handle multiple validation errors', async () => {
            req.params = { id: 'invalid' };
            req.body = {
                workModeId: 1,
                email: 'invalid-email',
                experienceYears: 100,
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

        it('should surface error when preferredJobLocation string is passed to transform', async () => {
            req.query = { preferredJobLocation: 'bangalore' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
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

        it('should not complete search when preferredJobLocation cannot be transformed', async () => {
            req.query = { preferredJobLocation: 'ahmedabad' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should not complete search for bengaluru string without location object', async () => {
            req.query = { preferredJobLocation: 'bengaluru' };

            await CandidateValidator.validateSearch(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
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
        it('should trim whitespace from string fields on create', async () => {
            mockCreateSuccessSequence(mockClient);
            req.body = {
                ...validCreateData(),
                candidateName: '  John Doe  ',
                email: '  john@example.com  ',
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.candidateName).toBe('John Doe');
            expect(req.body.email).toBe('john@example.com');
        });

        it('should lowercase email addresses', async () => {
            mockCreateSuccessSequence(mockClient);
            req.body = { ...validCreateData(), email: 'JOHN@EXAMPLE.COM' };

            await CandidateValidator.validateCreate(req, res, next);

            expect(req.body.email).toBe('john@example.com');
        });

        it('should accept names with apostrophes and hyphens', async () => {
            mockCreateSuccessSequence(mockClient);
            req.body = { ...validCreateData(), candidateName: "O'Brien-Smith" };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should accept zero experience years', async () => {
            mockCreateSuccessSequence(mockClient);
            req.body = { ...validCreateData(), experienceYears: 0 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.experienceYears).toBe(0);
        });

        it('should accept equal currentCTC and expectedCTC', async () => {
            mockCreateSuccessSequence(mockClient);
            req.body = { ...validCreateData(), currentCTC: 500000, expectedCTC: 500000 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('should reject CTC exceeding maximum', async () => {
            req.body = { ...validCreateData(), currentCTC: 11000000, expectedCTC: 12000000 };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
        });

        it('should accept contact numbers with various formats', async () => {
            const validFormats = [
                '+91-9876543210',
                '9876543210',
                '+1 (555) 123-4567',
                '+44 20 7946 0958',
            ];

            for (const format of validFormats) {
                mockCreateSuccessSequence(mockClient);
                req.body = {
                    ...validCreateData(),
                    contactNumber: format,
                    email: `john${Math.random()}@example.com`,
                };

                await CandidateValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledWith();
                jest.clearAllMocks();
            }
        });
    });

    describe('Integration Tests', () => {
        it('should handle complete create flow with all transformations', async () => {
            mockCreateSuccessSequence(mockClient, { locationId: 2, statusLookupKey: 4 });
            req.body = {
                candidateName: '  Jane Smith  ',
                contactNumber: '+91 9876543210',
                email: 'JANE@EXAMPLE.COM',
                recruiterId: 1,
                jobProfileRequirementId: 5,
                expectedLocation: { country: 'india', city: 'Delhi' },
                workModeId: 2,
                noticePeriod: 45,
                experienceYears: 7,
                linkedinProfileUrl: 'https://linkedin.com/in/jane-smith',
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.candidateName).toBe('Jane Smith');
            expect(req.body.email).toBe('jane@example.com');
            expect(req.body.expectedLocation).toBe(2);
            expect(req.body.statusId).toBe(4);
        });

        it('should handle complete update flow with partial data', async () => {
            req.params = { id: '5' };
            req.body = {
                workModeId: 1,
                email: 'newemail@example.com',
                expectedCTC: 1200000,
            };

            next = jest.fn();
            res = {};
            mockClient = { execute: jest.fn(), release: jest.fn() };
            mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
            CandidateValidator.init(mockDb);

            mockClient.execute.mockResolvedValueOnce([[]]);

            await CandidateValidator.validateUpdate(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(req.body.email).toBe('newemail@example.com');
        });

        it('should handle search with filters except preferredJobLocation transform', async () => {
            req.query = {
                candidateName: 'John',
                email: 'john@example.com',
                jobRole: 'Engineer',
                recruiterName: 'Jayraj',
                minExperience: '3',
                maxExperience: '8',
                minCurrentCTC: '400000',
                maxCurrentCTC: '900000',
                status: 'selected',
                limit: '30',
                offset: '10',
            };

            mockClient.execute.mockResolvedValueOnce([[{ lookupKey: 1 }]]);

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
            req.body = { ...validCreateData() };

            mockClient.execute.mockRejectedValue(new Error('Connection failed'));

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should propagate database errors from helper after schema validation', async () => {
            req.body = { ...validCreateData() };
            req.file = {
                mimetype: 'application/pdf',
                key: 'uploads/resume.pdf',
                size: 1024,
            };

            mockClient.execute.mockRejectedValue(new Error('Database error'));

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should handle multiple validation errors gracefully', async () => {
            req.body = {
                candidateName: 'J',
                email: 'invalid',
                currentCTC: -1000,
                expectedCTC: 'not-a-number',
            };

            await CandidateValidator.validateCreate(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.details.validationErrors.length).toBeGreaterThan(1);
        });
    });
});