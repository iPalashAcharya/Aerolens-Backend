const DepartmentValidator = require('../../validators/departmentValidator');
const AppError = require('../../utils/appError');

describe('DepartmentValidator', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        mockReq = {
            body: {},
            params: {}
        };
        mockRes = {};
        mockNext = jest.fn();
    });

    describe('validateCreate', () => {
        describe('Success Cases', () => {
            it('should validate valid department data successfully', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development and engineering team',
                    clientId: 1
                };

                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalledWith();
                expect(mockReq.body).toMatchObject({
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development and engineering team',
                    clientId: 1
                });
            });

            it('should trim whitespace from strings', () => {
                mockReq.body = {
                    departmentName: '  Engineering  ',
                    departmentDescription: '  Software development team  ',
                    clientId: 1
                };

                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

                expect(mockReq.body.departmentName).toBe('Engineering');
                expect(mockReq.body.departmentDescription).toBe('Software development team');
            });

            it('should accept minimum length department name', () => {
                mockReq.body = {
                    departmentName: 'IT',
                    departmentDescription: 'Information Technology Department',
                    clientId: 1
                };

                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should accept maximum length department name', () => {
                mockReq.body = {
                    departmentName: 'A'.repeat(100),
                    departmentDescription: 'Description of the department',
                    clientId: 1
                };

                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should accept minimum length department description', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: '1234567890', // exactly 10 characters
                    clientId: 1
                };

                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should accept maximum length department description', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'A'.repeat(500),
                    clientId: 1
                };

                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });
        });

        describe('departmentName Validation', () => {
            it('should throw error when departmentName is missing', () => {
                mockReq.body = {
                    departmentDescription: 'Software development team',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentName is empty string', () => {
                mockReq.body = {
                    departmentName: '',
                    departmentDescription: 'Software development team',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentName is too short', () => {
                mockReq.body = {
                    departmentName: 'A',
                    departmentDescription: 'Software development team',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentName exceeds maximum length', () => {
                mockReq.body = {
                    departmentName: 'A'.repeat(101),
                    departmentDescription: 'Software development team',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error with correct message for empty departmentName', () => {
                mockReq.body = {
                    departmentName: '',
                    departmentDescription: 'Software development team',
                    clientId: 1
                };

                try {
                    DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(error).toBeInstanceOf(AppError);
                    expect(error.statusCode).toBe(400);
                    expect(error.errorCode).toBe('VALIDATION_ERROR');
                    expect(error.details.validationErrors[0].message).toEqual('Department name is required')
                }
            });
        });

        describe('departmentDescription Validation', () => {
            it('should throw error when departmentDescription is missing', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentDescription is empty string', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: '',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentDescription is too short', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Short',
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentDescription exceeds maximum length', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'A'.repeat(501),
                    clientId: 1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });
        });

        describe('clientId Validation', () => {
            it('should throw error when clientId is missing', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development team'
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when clientId is not a number', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development team',
                    clientId: 'invalid'
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when clientId is negative', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development team',
                    clientId: -1
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when clientId is zero', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development team',
                    clientId: 0
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when clientId is a decimal', () => {
                mockReq.body = {
                    departmentName: 'Engineering',
                    departmentDescription: 'Software development team',
                    clientId: 1.5
                };

                expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });
        });

        describe('Multiple Validation Errors', () => {
            it('should return all validation errors at once', () => {
                mockReq.body = {
                    departmentName: 'A',
                    departmentDescription: 'Short',
                    clientId: -1
                };

                try {
                    DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(error).toBeInstanceOf(AppError);
                    expect(error.details.validationErrors).toHaveLength(3);
                    expect(error.details.validationErrors).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({ field: 'departmentName' }),
                            expect.objectContaining({ field: 'departmentDescription' }),
                            expect.objectContaining({ field: 'clientId' })
                        ])
                    );
                }
            });

            it('should not call next() when validation fails', () => {
                mockReq.body = {
                    departmentName: 'A',
                    departmentDescription: 'Short',
                    clientId: -1
                };

                try {
                    DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(mockNext).not.toHaveBeenCalled();
                }
            });
        });
    });

    describe('validateUpdate', () => {
        describe('Success Cases', () => {
            it('should validate update with departmentName only', () => {
                mockReq.body = { departmentName: 'Updated Engineering' };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
                expect(mockReq.body.departmentName).toBe('Updated Engineering');
            });

            it('should validate update with departmentDescription only', () => {
                mockReq.body = { departmentDescription: 'Updated software development team' };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should validate update with both fields', () => {
                mockReq.body = {
                    departmentName: 'Updated Engineering',
                    departmentDescription: 'Updated software development team'
                };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should trim whitespace in update fields', () => {
                mockReq.body = {
                    departmentName: '  Updated Engineering  '
                };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockReq.body.departmentName).toBe('Updated Engineering');
            });

            it('should accept minimum length values', () => {
                mockReq.body = {
                    departmentName: 'IT',
                    departmentDescription: '1234567890'
                };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should accept maximum length values', () => {
                mockReq.body = {
                    departmentName: 'A'.repeat(100),
                    departmentDescription: 'B'.repeat(500)
                };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });
        });

        describe('Body Validation Errors', () => {
            it('should throw error when no update fields provided', () => {
                mockReq.body = {};
                mockReq.params = { id: '1' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error with correct message when body is empty', () => {
                mockReq.body = {};
                mockReq.params = { id: '1' };

                try {
                    DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(error.details.validationErrors[0].message).toContain('At least one field');
                }
            });

            it('should throw error when departmentName is too short', () => {
                mockReq.body = { departmentName: 'A' };
                mockReq.params = { id: '1' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentName exceeds maximum length', () => {
                mockReq.body = { departmentName: 'A'.repeat(101) };
                mockReq.params = { id: '1' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentDescription is too short', () => {
                mockReq.body = { departmentDescription: 'Short' };
                mockReq.params = { id: '1' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when departmentDescription exceeds maximum length', () => {
                mockReq.body = { departmentDescription: 'A'.repeat(501) };
                mockReq.params = { id: '1' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });
        });

        describe('Params Validation Errors', () => {
            it('should throw error when id is missing', () => {
                mockReq.body = { departmentName: 'Engineering' };
                mockReq.params = {};

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is not a number', () => {
                mockReq.body = { departmentName: 'Engineering' };
                mockReq.params = { id: 'invalid' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is negative', () => {
                mockReq.body = { departmentName: 'Engineering' };
                mockReq.params = { id: '-1' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is zero', () => {
                mockReq.body = { departmentName: 'Engineering' };
                mockReq.params = { id: '0' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is decimal', () => {
                mockReq.body = { departmentName: 'Engineering' };
                mockReq.params = { id: '1.5' };

                expect(() => DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });
        });

        describe('Combined Validation Errors', () => {
            it('should return both body and params errors', () => {
                mockReq.body = { departmentName: 'A' };
                mockReq.params = { id: 'invalid' };

                try {
                    DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(error).toBeInstanceOf(AppError);
                    expect(error.details.validationErrors.length).toBeGreaterThanOrEqual(2);
                    expect(error.details.validationErrors).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({ field: 'departmentName' }),
                            expect.objectContaining({ field: 'id' })
                        ])
                    );
                }
            });

            it('should collect all errors from both body and params', () => {
                mockReq.body = {
                    departmentName: 'A',
                    departmentDescription: 'Short'
                };
                mockReq.params = { id: '-1' };

                try {
                    DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(error.details.validationErrors).toHaveLength(3);
                }
            });

            it('should not call next() when validation fails', () => {
                mockReq.body = { departmentName: 'A' };
                mockReq.params = { id: 'invalid' };

                try {
                    DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(mockNext).not.toHaveBeenCalled();
                }
            });
        });

        describe('Optional Fields Behavior', () => {
            it('should not require departmentName in update', () => {
                mockReq.body = {
                    departmentDescription: 'Valid description here'
                };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should not require departmentDescription in update', () => {
                mockReq.body = {
                    departmentName: 'Engineering'
                };
                mockReq.params = { id: '1' };

                DepartmentValidator.validateUpdate(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });
        });
    });

    describe('validateDelete', () => {
        describe('Success Cases', () => {
            it('should validate valid department id', () => {
                mockReq.params = { id: '1' };

                DepartmentValidator.validateDelete(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });

            it('should validate large positive id', () => {
                mockReq.params = { id: '999999' };

                DepartmentValidator.validateDelete(mockReq, mockRes, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });
        });

        describe('Validation Errors', () => {
            it('should throw error when id is missing', () => {
                mockReq.params = {};

                expect(() => DepartmentValidator.validateDelete(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is not a number', () => {
                mockReq.params = { id: 'invalid' };

                expect(() => DepartmentValidator.validateDelete(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is negative', () => {
                mockReq.params = { id: '-1' };

                expect(() => DepartmentValidator.validateDelete(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is zero', () => {
                mockReq.params = { id: '0' };

                expect(() => DepartmentValidator.validateDelete(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error when id is decimal', () => {
                mockReq.params = { id: '1.5' };

                expect(() => DepartmentValidator.validateDelete(mockReq, mockRes, mockNext))
                    .toThrow(AppError);
            });

            it('should throw error with correct structure', () => {
                mockReq.params = { id: 'invalid' };

                try {
                    DepartmentValidator.validateDelete(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(error).toBeInstanceOf(AppError);
                    expect(error.statusCode).toBe(400);
                    expect(error.errorCode).toBe('VALIDATION_ERROR');
                    expect(error.details.validationErrors).toBeDefined();
                    expect(error.details.validationErrors[0]).toHaveProperty('field');
                    expect(error.details.validationErrors[0]).toHaveProperty('message');
                }
            });

            it('should not call next() when validation fails', () => {
                mockReq.params = { id: 'invalid' };

                try {
                    DepartmentValidator.validateDelete(mockReq, mockRes, mockNext);
                } catch (error) {
                    expect(mockNext).not.toHaveBeenCalled();
                }
            });
        });
    });

    describe('Error Structure', () => {
        it('should throw AppError with correct properties', () => {
            mockReq.body = {
                departmentName: '',
                departmentDescription: '',
                clientId: 'invalid'
            };

            try {
                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);
            } catch (error) {
                expect(error).toBeInstanceOf(AppError);
                expect(error.message).toBe('Validation failed');
                expect(error.statusCode).toBe(400);
                expect(error.errorCode).toBe('VALIDATION_ERROR');
                expect(error.details).toHaveProperty('validationErrors');
                expect(Array.isArray(error.details.validationErrors)).toBe(true);
            }
        });

        it('should include field and message in validation errors', () => {
            mockReq.body = {
                departmentName: 'A',
                departmentDescription: 'Software development team',
                clientId: 1
            };

            try {
                DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);
            } catch (error) {
                const validationError = error.details.validationErrors[0];
                expect(validationError).toHaveProperty('field');
                expect(validationError).toHaveProperty('message');
                expect(typeof validationError.field).toBe('string');
                expect(typeof validationError.message).toBe('string');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle null values in create', () => {
            mockReq.body = {
                departmentName: null,
                departmentDescription: null,
                clientId: null
            };

            expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                .toThrow(AppError);
        });

        it('should handle undefined values in create', () => {
            mockReq.body = {
                departmentName: undefined,
                departmentDescription: undefined,
                clientId: undefined
            };

            expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                .toThrow(AppError);
        });

        it('should handle whitespace-only strings', () => {
            mockReq.body = {
                departmentName: '   ',
                departmentDescription: '   ',
                clientId: 1
            };

            expect(() => DepartmentValidator.validateCreate(mockReq, mockRes, mockNext))
                .toThrow(AppError);
        });

        it('should handle special characters in strings', () => {
            mockReq.body = {
                departmentName: 'Engineering & Development',
                departmentDescription: 'Team responsible for R&D, testing & deployment',
                clientId: 1
            };

            DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle very large client IDs', () => {
            mockReq.body = {
                departmentName: 'Engineering',
                departmentDescription: 'Software development team',
                clientId: 2147483647 // Max 32-bit integer
            };

            DepartmentValidator.validateCreate(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });
    });
});