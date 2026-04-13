const fs = require('fs');
const os = require('os');
const path = require('path');

const AppError = require('../../utils/appError');
const CandidateBulkService = require('../../services/candidateBulkService');

describe('CandidateBulkService', () => {
    let service;
    let candidateRepository;
    let validatorHelper;
    let db;

    beforeEach(() => {
        candidateRepository = {
            bulkInsert: jest.fn().mockResolvedValue(undefined)
        };
        validatorHelper = {
            transformLocation: jest.fn().mockResolvedValue({ locationId: 1 }),
            getStatusIdByName: jest.fn().mockResolvedValue(1),
            getVendorIdByName: jest.fn().mockResolvedValue(5),
            getRecruiterId: jest.fn().mockResolvedValue(3),
            getJobProfileRequirementId: jest.fn().mockResolvedValue(4),
            checkEmailExists: jest.fn().mockResolvedValue(false),
            checkContactExists: jest.fn().mockResolvedValue(false)
        };
        db = {
            getConnection: jest.fn().mockResolvedValue({
                beginTransaction: jest.fn().mockResolvedValue(undefined),
                commit: jest.fn().mockResolvedValue(undefined),
                rollback: jest.fn().mockResolvedValue(undefined),
                release: jest.fn(),
                execute: jest.fn().mockResolvedValue([[]]),
                query: jest.fn().mockResolvedValue([[]])
            })
        };
        service = new CandidateBulkService(candidateRepository, validatorHelper, db);
    });

    describe('generateTemplate', () => {
        it('returns headers and sample row', async () => {
            const { headers, sampleData } = await service.generateTemplate();
            expect(headers).toContain('candidate_name');
            expect(headers).toContain('email');
            expect(sampleData).toHaveLength(1);
            expect(sampleData[0].candidate_name).toBe('John Doe');
        });
    });

    describe('processBulkUpload', () => {
        it('throws when file is missing', async () => {
            await expect(service.processBulkUpload(null)).rejects.toThrow(AppError);
            await expect(service.processBulkUpload(null)).rejects.toMatchObject({
                errorCode: 'NO_FILE_UPLOADED'
            });
        });

        it('throws on invalid mimetype', async () => {
            const file = {
                path: '/tmp/x.csv',
                mimetype: 'application/pdf',
                size: 100,
                originalname: 'a.csv'
            };
            await expect(service.processBulkUpload(file)).rejects.toMatchObject({
                errorCode: 'INVALID_FILE_FORMAT'
            });
        });

        it('throws when file exceeds max size', async () => {
            const file = {
                path: '/tmp/x.csv',
                mimetype: 'text/csv',
                size: 11 * 1024 * 1024,
                originalname: 'a.csv'
            };
            await expect(service.processBulkUpload(file)).rejects.toMatchObject({
                errorCode: 'FILE_TOO_LARGE'
            });
        });

        it('throws on unsupported extension', async () => {
            const file = {
                path: '/tmp/x.txt',
                mimetype: 'text/csv',
                size: 100,
                originalname: 'a.txt'
            };
            await expect(service.processBulkUpload(file)).rejects.toMatchObject({
                errorCode: 'INVALID_FILE_FORMAT'
            });
        });

        it('processes a valid CSV row and inserts batch', async () => {
            const tmp = path.join(os.tmpdir(), `bulk-${Date.now()}.csv`);
            const csvContent = [
                'candidate_name,email,contact_number,recruiter_name,client_name,department_name,job_role,current_city,expected_city,current_ctc,expected_ctc,notice_period,experience_years',
                'John Doe,john.doe@example.com,+919876543210,Jayraj,TCS,Engineering,Engineer,Mumbai,Bangalore,1000000,1200000,30,5'
            ].join('\n');
            fs.writeFileSync(tmp, csvContent, 'utf8');

            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: Buffer.byteLength(csvContent),
                originalname: 'candidates.csv'
            };

            const result = await service.processBulkUpload(file);

            expect(result.summary.inserted).toBeGreaterThanOrEqual(1);
            expect(candidateRepository.bulkInsert).toHaveBeenCalled();
            expect(db.getConnection).toHaveBeenCalled();

            expect(fs.existsSync(tmp)).toBe(false);
        });
    });
});
