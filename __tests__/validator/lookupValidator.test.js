const LookupValidator = require('../../validators/lookupValidator');
const AppError = require('../../utils/appError');

describe('LookupValidator', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            body: {},
            params: {},
            query: {},
        };
        res = {};
        next = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('validateCreate', () => {
        describe('successful validation', () => {
            it('should pass validation with valid tag and value', () => {
                req.body = {
                    tag: 'status',
                    value: 'active',
                };

                LookupValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
                expect(next).toHaveBeenCalledWith();
                expect(req.body).toEqual({
                    tag: 'status',
                    value: 'active',
                });
            });

            it('should trim whitespace from tag and value', () => {
                req.body = {
                    tag: '  status  ',
                    value: '  active  ',
                };

                LookupValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
                expect(req.body.tag).toBe('status');
                expect(req.body.value).toBe('active');
            });

            it('should accept tag at minimum length (1 character)', () => {
                req.body = {
                    tag: 'a',
                    value: 'value',
                };

                LookupValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept tag at maximum length (100 characters)', () => {
                req.body = {
                    tag: 'a'.repeat(100),
                    value: 'value',
                };

                LookupValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept value at maximum length (500 characters)', () => {
                req.body = {
                    tag: 'tag',
                    value: 'a'.repeat(500),
                };

                LookupValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });
        });

        describe('tag validation errors', () => {
            it('should throw AppError when tag is missing', () => {
                req.body = {
                    value: 'active',
                };

                expect(() => LookupValidator.validateCreate(req, res, next))
                    .toThrow(AppError);

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.message).toBe('Validation failed');
                    expect(error.statusCode).toBe(400);
                    expect(error.errorCode).toBe('VALIDATION_ERROR');
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'tag',
                        message: 'Tag is required',
                    });
                }

                expect(next).not.toHaveBeenCalled();
            });

            it('should throw AppError when tag is empty string', () => {
                req.body = {
                    tag: '',
                    value: 'active',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'tag',
                        message: 'Tag cannot be empty',
                    });
                }

                expect(next).not.toHaveBeenCalled();
            });

            it('should throw AppError when tag is only whitespace', () => {
                req.body = {
                    tag: '   ',
                    value: 'active',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'tag',
                        message: 'Tag cannot be empty',
                    });
                }
            });

            it('should throw AppError when tag is not a string', () => {
                req.body = {
                    tag: 123,
                    value: 'active',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'tag',
                        message: 'Tag must be a string',
                    });
                }
            });

            it('should throw AppError when tag exceeds 100 characters', () => {
                req.body = {
                    tag: 'a'.repeat(101),
                    value: 'active',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'tag',
                        message: 'Tag cannot exceed 100 characters',
                    });
                }
            });
        });

        describe('value validation errors', () => {
            it('should throw AppError when value is missing', () => {
                req.body = {
                    tag: 'status',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'value',
                        message: 'Value is required',
                    });
                }

                expect(next).not.toHaveBeenCalled();
            });

            it('should throw AppError when value is empty string', () => {
                req.body = {
                    tag: 'status',
                    value: '',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'value',
                        message: 'Value cannot be empty',
                    });
                }
            });

            it('should throw AppError when value is only whitespace', () => {
                req.body = {
                    tag: 'status',
                    value: '   ',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'value',
                        message: 'Value cannot be empty',
                    });
                }
            });

            it('should throw AppError when value is not a string', () => {
                req.body = {
                    tag: 'status',
                    value: 456,
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'value',
                        message: 'Value must be a string',
                    });
                }
            });

            it('should throw AppError when value exceeds 500 characters', () => {
                req.body = {
                    tag: 'status',
                    value: 'a'.repeat(501),
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'value',
                        message: 'Value cannot exceed 500 characters',
                    });
                }
            });
        });

        describe('multiple validation errors', () => {
            it('should return all validation errors when multiple fields are invalid', () => {
                req.body = {
                    tag: '',
                    value: '',
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toHaveLength(2);
                    expect(error.details.validationErrors).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({ field: 'tag' }),
                            expect.objectContaining({ field: 'value' }),
                        ])
                    );
                }
            });

            it('should handle both fields being wrong type', () => {
                req.body = {
                    tag: 123,
                    value: true,
                };

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toHaveLength(2);
                }
            });
        });

        describe('edge cases', () => {
            it('should throw AppError when body is empty', () => {
                req.body = {};

                try {
                    LookupValidator.validateCreate(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toHaveLength(2);
                }
            });

            it('should ignore extra fields not in schema', () => {
                req.body = {
                    tag: 'status',
                    value: 'active',
                    extraField: 'should be ignored',
                };

                LookupValidator.validateCreate(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
                expect(req.body.extraField).toBeUndefined();
            });
        });
    });

    describe('validateDelete', () => {
        describe('successful validation', () => {
            it('should pass validation with valid lookupKey', () => {
                req.params = {
                    lookupKey: '123',
                };

                LookupValidator.validateDelete(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
                expect(next).toHaveBeenCalledWith();
            });

            it('should accept lookupKey as number', () => {
                req.params = {
                    lookupKey: 456,
                };

                LookupValidator.validateDelete(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept large positive integers', () => {
                req.params = {
                    lookupKey: 999999999,
                };

                LookupValidator.validateDelete(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });
        });

        describe('lookupKey validation errors', () => {
            it('should throw AppError when lookupKey is missing', () => {
                req.params = {};

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.message).toBe('Validation failed');
                    expect(error.statusCode).toBe(400);
                    expect(error.errorCode).toBe('VALIDATION_ERROR');
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'lookupKey',
                        message: 'Lookup key is required',
                    });
                }

                expect(next).not.toHaveBeenCalled();
            });

            it('should throw AppError when lookupKey is not a number', () => {
                req.params = {
                    lookupKey: 'abc',
                };

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'lookupKey',
                        message: 'Lookup key must be a number',
                    });
                }
            });

            it('should throw AppError when lookupKey is zero', () => {
                req.params = {
                    lookupKey: 0,
                };

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'lookupKey',
                        message: 'Lookup key must be positive',
                    });
                }
            });

            it('should throw AppError when lookupKey is negative', () => {
                req.params = {
                    lookupKey: -5,
                };

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'lookupKey',
                        message: 'Lookup key must be positive',
                    });
                }
            });

            it('should throw AppError when lookupKey is a decimal', () => {
                req.params = {
                    lookupKey: 12.5,
                };

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'lookupKey',
                        message: 'Lookup key must be an integer',
                    });
                }
            });

            it('should throw AppError when lookupKey is null', () => {
                req.params = {
                    lookupKey: null,
                };

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors[0].field).toBe('lookupKey');
                }
            });

            it('should throw AppError when lookupKey is boolean', () => {
                req.params = {
                    lookupKey: true,
                };

                try {
                    LookupValidator.validateDelete(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'lookupKey',
                        message: 'Lookup key must be a number',
                    });
                }
            });
        });
    });

    describe('validatePagination', () => {
        describe('successful validation', () => {
            it('should pass validation with valid page and limit', () => {
                req.query = {
                    page: '2',
                    limit: '20',
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
                expect(next).toHaveBeenCalledWith();
            });

            it('should use default values when page and limit are not provided', () => {
                req.query = {};

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept page as number', () => {
                req.query = {
                    page: 5,
                    limit: 25,
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept minimum page value (1)', () => {
                req.query = {
                    page: 1,
                    limit: 10,
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept minimum limit value (1)', () => {
                req.query = {
                    page: 1,
                    limit: 1,
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept maximum limit value (100)', () => {
                req.query = {
                    page: 1,
                    limit: 100,
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });
        });

        describe('page validation errors', () => {
            it('should throw AppError when page is not a number', () => {
                req.query = {
                    page: 'abc',
                    limit: 10,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'page',
                        message: 'Page must be a number',
                    });
                }

                expect(next).not.toHaveBeenCalled();
            });

            it('should throw AppError when page is zero', () => {
                req.query = {
                    page: 0,
                    limit: 10,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'page',
                        message: 'Page must be at least 1',
                    });
                }
            });

            it('should throw AppError when page is negative', () => {
                req.query = {
                    page: -1,
                    limit: 10,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'page',
                        message: 'Page must be at least 1',
                    });
                }
            });

            it('should throw AppError when page is a decimal', () => {
                req.query = {
                    page: 1.5,
                    limit: 10,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'page',
                        message: 'Page must be an integer',
                    });
                }
            });
        });

        describe('limit validation errors', () => {
            it('should throw AppError when limit is not a number', () => {
                req.query = {
                    page: 1,
                    limit: 'xyz',
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'limit',
                        message: 'Limit must be a number',
                    });
                }
            });

            it('should throw AppError when limit is zero', () => {
                req.query = {
                    page: 1,
                    limit: 0,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'limit',
                        message: 'Limit must be at least 1',
                    });
                }
            });

            it('should throw AppError when limit is negative', () => {
                req.query = {
                    page: 1,
                    limit: -10,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'limit',
                        message: 'Limit must be at least 1',
                    });
                }
            });

            it('should throw AppError when limit exceeds 100', () => {
                req.query = {
                    page: 1,
                    limit: 101,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'limit',
                        message: 'Limit cannot exceed 100',
                    });
                }
            });

            it('should throw AppError when limit is a decimal', () => {
                req.query = {
                    page: 1,
                    limit: 10.5,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toContainEqual({
                        field: 'limit',
                        message: 'Limit must be an integer',
                    });
                }
            });
        });

        describe('multiple validation errors', () => {
            it('should return all validation errors when multiple fields are invalid', () => {
                req.query = {
                    page: 0,
                    limit: 101,
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toHaveLength(2);
                    expect(error.details.validationErrors).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({ field: 'page' }),
                            expect.objectContaining({ field: 'limit' }),
                        ])
                    );
                }
            });

            it('should handle both fields being wrong type', () => {
                req.query = {
                    page: 'abc',
                    limit: 'xyz',
                };

                try {
                    LookupValidator.validatePagination(req, res, next);
                } catch (error) {
                    expect(error.details.validationErrors).toHaveLength(2);
                }
            });
        });

        describe('edge cases', () => {
            it('should ignore extra fields not in schema', () => {
                req.query = {
                    page: 1,
                    limit: 10,
                    extraField: 'should be ignored',
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });

            it('should accept very large page numbers', () => {
                req.query = {
                    page: 999999,
                    limit: 10,
                };

                LookupValidator.validatePagination(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('AppError structure', () => {
        it('should throw AppError with correct structure in validateCreate', () => {
            req.body = {};

            try {
                LookupValidator.validateCreate(req, res, next);
            } catch (error) {
                expect(error).toBeInstanceOf(AppError);
                expect(error).toHaveProperty('message');
                expect(error).toHaveProperty('statusCode');
                expect(error).toHaveProperty('errorCode');
                expect(error).toHaveProperty('details');
                expect(error.details).toHaveProperty('validationErrors');
                expect(Array.isArray(error.details.validationErrors)).toBe(true);
            }
        });

        it('should throw AppError with correct structure in validateDelete', () => {
            req.params = { lookupKey: 'invalid' };

            try {
                LookupValidator.validateDelete(req, res, next);
            } catch (error) {
                expect(error).toBeInstanceOf(AppError);
                expect(error.statusCode).toBe(400);
                expect(error.errorCode).toBe('VALIDATION_ERROR');
            }
        });

        it('should throw AppError with correct structure in validatePagination', () => {
            req.query = { page: -1 };

            try {
                LookupValidator.validatePagination(req, res, next);
            } catch (error) {
                expect(error).toBeInstanceOf(AppError);
                expect(error.statusCode).toBe(400);
                expect(error.errorCode).toBe('VALIDATION_ERROR');
            }
        });
    });
});