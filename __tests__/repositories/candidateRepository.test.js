const CandidateRepository = require('../../repositories/candidateRepository');
const AppError = require('../../utils/appError');

describe('CandidateRepository', () => {
    let candidateRepository;
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock connection
        mockConnection = {
            execute: jest.fn(),
            query: jest.fn(),
            release: jest.fn()
        };

        // Mock database
        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        candidateRepository = new CandidateRepository(mockDb);
    });

    describe('create', () => {
        const mockCandidateData = {
            candidateName: 'John Doe',
            contactNumber: '1234567890',
            email: 'john@example.com',
            recruiterName: 'Jane Smith',
            jobRole: 'Software Engineer',
            preferredJobLocation: 1,
            currentCTC: 500000,
            expectedCTC: 700000,
            noticePeriod: 30,
            experienceYears: 5,
            linkedinProfileUrl: 'https://linkedin.com/in/johndoe',
            statusId: 1
        };

        it('should create candidate successfully', async () => {
            const mockResult = { insertId: 1, affectedRows: 1 };
            mockConnection.execute.mockResolvedValue([mockResult]);

            const result = await candidateRepository.create(mockCandidateData);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO candidate'),
                expect.arrayContaining([
                    mockCandidateData.candidateName,
                    mockCandidateData.contactNumber,
                    mockCandidateData.email
                ])
            );
            expect(result).toMatchObject({
                candidateId: 1,
                ...mockCandidateData
            });
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should use default statusId when not provided', async () => {
            const dataWithoutStatus = { ...mockCandidateData };
            delete dataWithoutStatus.statusId;
            mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

            await candidateRepository.create(dataWithoutStatus);

            const callArgs = mockConnection.execute.mock.calls[0][1];
            expect(callArgs[11]).toBe(9); // Default statusId
        });

        it('should handle null preferredJobLocation', async () => {
            const dataWithoutLocation = { ...mockCandidateData };
            delete dataWithoutLocation.preferredJobLocation;
            mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

            await candidateRepository.create(dataWithoutLocation);

            const callArgs = mockConnection.execute.mock.calls[0][1];
            expect(callArgs[5]).toBeNull();
        });

        it('should handle duplicate entry error', async () => {
            const dbError = new Error('Duplicate entry');
            dbError.code = 'ER_DUP_ENTRY';
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(candidateRepository.create(mockCandidateData))
                .rejects
                .toThrow(AppError);
        });

        it('should not release connection when client is provided', async () => {
            mockConnection.execute.mockResolvedValue([{ insertId: 1 }]);

            await candidateRepository.create(mockCandidateData, mockConnection);

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('findById', () => {
        it('should find candidate by id successfully', async () => {
            const mockCandidate = {
                candidateId: 1,
                candidateName: 'John Doe',
                email: 'john@example.com',
                statusName: 'Active'
            };
            mockConnection.execute.mockResolvedValue([[mockCandidate]]);

            const result = await candidateRepository.findById(1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                [1]
            );
            expect(result).toEqual(mockCandidate);
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should return null when candidate not found', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await candidateRepository.findById(999);

            expect(result).toBeNull();
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(candidateRepository.findById(null))
                .rejects
                .toThrow(AppError);

            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should not release connection when client is provided', async () => {
            mockConnection.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            await candidateRepository.findById(1, mockConnection);

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('findByEmail', () => {
        it('should find candidate by email successfully', async () => {
            const mockCandidate = {
                candidateId: 1,
                email: 'john@example.com'
            };
            mockConnection.execute.mockResolvedValue([[mockCandidate]]);

            const result = await candidateRepository.findByEmail('john@example.com');

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE c.email = ?'),
                ['john@example.com']
            );
            expect(result).toEqual(mockCandidate);
        });

        it('should return null when email not found', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await candidateRepository.findByEmail('notfound@example.com');

            expect(result).toBeNull();
        });

        it('should throw error when email is missing', async () => {
            await expect(candidateRepository.findByEmail(null))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('findByContactNumber', () => {
        it('should find candidate by contact number successfully', async () => {
            const mockCandidate = {
                candidateId: 1,
                contactNumber: '1234567890'
            };
            mockConnection.execute.mockResolvedValue([[mockCandidate]]);

            const result = await candidateRepository.findByContactNumber('1234567890');

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE c.contactNumber = ?'),
                ['1234567890']
            );
            expect(result).toEqual(mockCandidate);
        });

        it('should throw error when contact number is missing', async () => {
            await expect(candidateRepository.findByContactNumber(null))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('findByStatus', () => {
        it('should find candidates by status successfully', async () => {
            const mockCandidates = [
                { candidateId: 1, statusName: 'Active' },
                { candidateId: 2, statusName: 'Active' }
            ];
            mockConnection.execute.mockResolvedValue([mockCandidates]);

            const result = await candidateRepository.findByStatus(1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE c.statusId = ?'),
                [1]
            );
            expect(result).toEqual(mockCandidates);
        });

        it('should apply limit and offset', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.findByStatus(1, 10, 5);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT ? OFFSET ?'),
                [1, 10, 5]
            );
        });

        it('should apply only limit without offset', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.findByStatus(1, 10);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT ?'),
                [1, 10]
            );
        });

        it('should throw error when statusId is missing', async () => {
            await expect(candidateRepository.findByStatus(null))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('searchCandidates', () => {
        it('should search with all criteria', async () => {
            const searchOptions = {
                candidateName: 'John',
                email: 'john@example.com',
                jobRole: 'Engineer',
                preferredJobLocation: 'Mumbai',
                recruiterName: 'Jane',
                minExperience: 2,
                maxExperience: 5,
                minCurrentCTC: 400000,
                maxCurrentCTC: 600000,
                statusId: 1
            };
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.searchCandidates(searchOptions);

            const query = mockConnection.execute.mock.calls[0][0];
            expect(query).toContain('c.candidateName LIKE ?');
            expect(query).toContain('c.email LIKE ?');
            expect(query).toContain('c.jobRole LIKE ?');
            expect(query).toContain('loc.value = ?');
            expect(query).toContain('c.recruiterName LIKE ?');
            expect(query).toContain('c.experienceYears >= ?');
            expect(query).toContain('c.experienceYears <= ?');
            expect(query).toContain('c.currentCTC >= ?');
            expect(query).toContain('c.currentCTC <= ?');
            expect(query).toContain('c.statusId = ?');
        });

        it('should search with partial criteria', async () => {
            const searchOptions = {
                candidateName: 'John'
            };
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.searchCandidates(searchOptions);

            const params = mockConnection.execute.mock.calls[0][1];
            expect(params).toEqual(['%John%']);
        });

        it('should handle empty search options', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.searchCandidates({});

            const query = mockConnection.execute.mock.calls[0][0];
            expect(query).toContain('WHERE 1=1');
        });

        it('should apply limit and offset', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.searchCandidates({}, 10, 5);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT ? OFFSET ?'),
                [10, 5]
            );
        });
    });

    describe('update', () => {
        const candidateId = 1;
        const updateData = {
            candidateName: 'Jane Doe',
            email: 'jane@example.com'
        };

        it('should update candidate successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await candidateRepository.update(candidateId, updateData);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE candidate SET'),
                expect.arrayContaining(['Jane Doe', 'jane@example.com', 1])
            );
            expect(result).toBe(1);
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(candidateRepository.update(null, updateData))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when updateData is empty', async () => {
            await expect(candidateRepository.update(candidateId, {}))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when updateData is null', async () => {
            await expect(candidateRepository.update(candidateId, null))
                .rejects
                .toThrow(AppError);
        });

        it('should filter out invalid fields', async () => {
            const dataWithInvalidFields = {
                candidateName: 'Jane',
                invalidField: 'should be filtered',
                anotherInvalid: 'also filtered'
            };
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await candidateRepository.update(candidateId, dataWithInvalidFields);

            const query = mockConnection.execute.mock.calls[0][0];
            expect(query).toContain('candidateName = ?');
            expect(query).not.toContain('invalidField');
        });

        it('should throw error when no valid fields provided', async () => {
            const invalidData = {
                invalidField: 'test'
            };

            await expect(candidateRepository.update(candidateId, invalidData))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when candidate not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(candidateRepository.update(candidateId, updateData))
                .rejects
                .toThrow(AppError);
        });

        it('should not release connection when client is provided', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await candidateRepository.update(candidateId, updateData, mockConnection);

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('updateStatus', () => {
        it('should update status successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await candidateRepository.updateStatus(1, 2);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE candidate SET statusId = ?'),
                [2, 1]
            );
            expect(result).toBe(1);
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(candidateRepository.updateStatus(null, 2))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when statusId is missing', async () => {
            await expect(candidateRepository.updateStatus(1, null))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when candidate not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(candidateRepository.updateStatus(999, 2))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('delete', () => {
        it('should delete candidate successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await candidateRepository.delete(1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM candidate WHERE candidateId = ?'),
                [1]
            );
            expect(result).toBe(1);
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(candidateRepository.delete(null))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when candidate not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(candidateRepository.delete(999))
                .rejects
                .toThrow(AppError);
        });

        it('should not release connection when client is provided', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await candidateRepository.delete(1, mockConnection);

            expect(mockConnection.release).not.toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should find all candidates with default pagination', async () => {
            const mockCandidates = [
                { candidateId: 1, candidateName: 'John' },
                { candidateId: 2, candidateName: 'Jane' }
            ];
            mockConnection.query.mockResolvedValue([mockCandidates]);

            const result = await candidateRepository.findAll();

            expect(mockConnection.query).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT ? OFFSET ?'),
                [10, 0]
            );
            expect(result).toEqual(mockCandidates);
        });

        it('should find all candidates with custom pagination', async () => {
            mockConnection.query.mockResolvedValue([[]]);

            await candidateRepository.findAll(20, 10);

            expect(mockConnection.query).toHaveBeenCalledWith(
                expect.any(String),
                [20, 10]
            );
        });

        it('should handle invalid limit values', async () => {
            mockConnection.query.mockResolvedValue([[]]);

            await candidateRepository.findAll(-5, 0);

            const params = mockConnection.query.mock.calls[0][1];
            expect(params[0]).toBeGreaterThanOrEqual(1);
        });

        it('should handle invalid offset values', async () => {
            mockConnection.query.mockResolvedValue([[]]);

            await candidateRepository.findAll(10, -5);

            const params = mockConnection.query.mock.calls[0][1];
            expect(params[1]).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getCount', () => {
        it('should get total count', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 42 }]]);

            const result = await candidateRepository.getCount();

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COUNT(*) as count FROM candidate'),
                []
            );
            expect(result).toBe(42);
        });

        it('should get count by status', async () => {
            mockConnection.execute.mockResolvedValue([[{ count: 15 }]]);

            const result = await candidateRepository.getCount(1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('WHERE statusId = ?'),
                [1]
            );
            expect(result).toBe(15);
        });
    });

    describe('checkEmailExists', () => {
        it('should return true when email exists', async () => {
            mockConnection.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            const result = await candidateRepository.checkEmailExists('john@example.com');

            expect(result).toBe(true);
        });

        it('should return false when email does not exist', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await candidateRepository.checkEmailExists('notfound@example.com');

            expect(result).toBe(false);
        });

        it('should exclude specific candidate when provided', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.checkEmailExists('john@example.com', 1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                ['john@example.com', 1]
            );
        });
    });

    describe('checkContactExists', () => {
        it('should return true when contact exists', async () => {
            mockConnection.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            const result = await candidateRepository.checkContactExists('1234567890');

            expect(result).toBe(true);
        });

        it('should return false when contact does not exist', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await candidateRepository.checkContactExists('9999999999');

            expect(result).toBe(false);
        });

        it('should exclude specific candidate when provided', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            await candidateRepository.checkContactExists('1234567890', 1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('AND candidateId != ?'),
                ['1234567890', 1]
            );
        });
    });

    describe('updateResumeInfo', () => {
        it('should update resume info successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await candidateRepository.updateResumeInfo(
                1,
                'resume.pdf',
                'original_resume.pdf'
            );

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE candidate'),
                ['resume.pdf', 'original_resume.pdf', 1]
            );
            expect(result).toBe(1);
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(
                candidateRepository.updateResumeInfo(null, 'resume.pdf', 'original.pdf')
            ).rejects.toThrow(AppError);
        });

        it('should throw error when candidate not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(
                candidateRepository.updateResumeInfo(999, 'resume.pdf', 'original.pdf')
            ).rejects.toThrow(AppError);
        });
    });

    describe('getResumeInfo', () => {
        it('should get resume info successfully', async () => {
            const mockResumeInfo = {
                resumeFilename: 'resume.pdf',
                resumeOriginalName: 'original.pdf',
                resumeUploadDate: new Date()
            };
            mockConnection.execute.mockResolvedValue([[mockResumeInfo]]);

            const result = await candidateRepository.getResumeInfo(1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SELECT resumeFilename'),
                [1]
            );
            expect(result).toEqual(mockResumeInfo);
        });

        it('should return null when no resume found', async () => {
            mockConnection.execute.mockResolvedValue([[]]);

            const result = await candidateRepository.getResumeInfo(1);

            expect(result).toBeNull();
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(candidateRepository.getResumeInfo(null))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('deleteResumeInfo', () => {
        it('should delete resume info successfully', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

            const result = await candidateRepository.deleteResumeInfo(1);

            expect(mockConnection.execute).toHaveBeenCalledWith(
                expect.stringContaining('SET resumeFilename = NULL'),
                [1]
            );
            expect(result).toBe(1);
        });

        it('should throw error when candidateId is missing', async () => {
            await expect(candidateRepository.deleteResumeInfo(null))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when candidate not found', async () => {
            mockConnection.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(candidateRepository.deleteResumeInfo(999))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('_handleDatabaseError', () => {
        it('should handle ER_DUP_ENTRY error', () => {
            const error = new Error('Duplicate entry');
            error.code = 'ER_DUP_ENTRY';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle ER_DATA_TOO_LONG error', () => {
            const error = new Error('Data too long');
            error.code = 'ER_DATA_TOO_LONG';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle ER_BAD_NULL_ERROR error', () => {
            const error = new Error('Null constraint');
            error.code = 'ER_BAD_NULL_ERROR';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle ER_NO_REFERENCED_ROW_2 error', () => {
            const error = new Error('Foreign key violation');
            error.code = 'ER_NO_REFERENCED_ROW_2';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle ER_ROW_IS_REFERENCED_2 error', () => {
            const error = new Error('Cannot delete');
            error.code = 'ER_ROW_IS_REFERENCED_2';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle ECONNREFUSED error', () => {
            const error = new Error('Connection refused');
            error.code = 'ECONNREFUSED';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle ER_ACCESS_DENIED_ERROR error', () => {
            const error = new Error('Access denied');
            error.code = 'ER_ACCESS_DENIED_ERROR';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });

        it('should handle unknown database errors', () => {
            const error = new Error('Unknown error');
            error.code = 'UNKNOWN_ERROR';
            error.sqlState = '42000';

            expect(() => candidateRepository._handleDatabaseError(error))
                .toThrow(AppError);
        });
    });

    describe('Connection Management', () => {
        it('should release connection on error when no client provided', async () => {
            const dbError = new Error('Database error');
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(candidateRepository.findById(1))
                .rejects
                .toThrow();

            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should not release connection on error when client is provided', async () => {
            const dbError = new Error('Database error');
            mockConnection.execute.mockRejectedValue(dbError);

            await expect(candidateRepository.findById(1, mockConnection))
                .rejects
                .toThrow();

            expect(mockConnection.release).not.toHaveBeenCalled();
        });

        it('should get new connection when client is not provided', async () => {
            mockConnection.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            await candidateRepository.findById(1);

            expect(mockDb.getConnection).toHaveBeenCalled();
        });

        it('should use provided client instead of getting new connection', async () => {
            mockConnection.execute.mockResolvedValue([[{ candidateId: 1 }]]);

            await candidateRepository.findById(1, mockConnection);

            expect(mockDb.getConnection).not.toHaveBeenCalled();
        });
    });
});