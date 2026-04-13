const fs = require('fs');
const os = require('os');
const path = require('path');

const ExcelJS = require('exceljs');

const AppError = require('../../utils/appError');
const CandidateBulkService = require('../../services/candidateBulkService');

function validHeaderRow() {
    return [
        'candidate_name',
        'email',
        'contact_number',
        'recruiter_name',
        'client_name',
        'department_name',
        'job_role',
        'work_mode',
        'current_city',
        'expected_city',
        'notice_period',
        'experience_years'
    ];
}

function validDataRow(overrides = {}) {
    return {
        candidate_name: 'John Doe',
        email: 'john.doe@example.com',
        contact_number: '+919876543210',
        recruiter_name: 'Jayraj',
        client_name: 'TCS',
        department_name: 'Engineering',
        job_role: 'Engineer',
        work_mode: 'Remote',
        current_city: 'Mumbai',
        expected_city: 'Bangalore',
        notice_period: 30,
        experience_years: 5,
        ...overrides
    };
}

describe('CandidateBulkService', () => {
    let service;
    let candidateRepository;
    let validatorHelper;
    let db;
    let mockClient;

    beforeEach(() => {
        candidateRepository = {
            bulkInsert: jest.fn().mockResolvedValue(undefined)
        };
        validatorHelper = {
            transformLocation: jest.fn().mockResolvedValue(1),
            getStatusIdByName: jest.fn().mockResolvedValue(1),
            getVendorIdByName: jest.fn().mockResolvedValue(5),
            getRecruiterId: jest.fn().mockResolvedValue(3),
            getJobProfileRequirementId: jest.fn().mockResolvedValue(4),
            getLookupKeyByTagAndValue: jest.fn().mockResolvedValue(99),
            checkEmailExists: jest.fn().mockResolvedValue(false),
            checkContactExists: jest.fn().mockResolvedValue(false)
        };
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            execute: jest.fn().mockImplementation(async (sql) => {
                if (String(sql).includes('SELECT candidateId')) {
                    return [[{ candidateId: 99 }]];
                }
                return [{ affectedRows: 1 }];
            }),
            query: jest.fn().mockResolvedValue([[]])
        };
        db = {
            getConnection: jest.fn().mockResolvedValue(mockClient)
        };
        service = new CandidateBulkService(candidateRepository, validatorHelper, db);
    });

    describe('generateTemplate', () => {
        it('returns headers and sample row', async () => {
            const { headers, sampleData } = await service.generateTemplate();
            expect(headers).toContain('candidate_name');
            expect(headers).toContain('work_mode');
            expect(headers).toContain('email');
            expect(headers).not.toContain('current_ctc');
            expect(headers).not.toContain('expected_ctc');
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
                'candidate_name,email,contact_number,recruiter_name,client_name,department_name,job_role,work_mode,current_city,expected_city,notice_period,experience_years',
                'John Doe,john.doe@example.com,+919876543210,Jayraj,TCS,Engineering,Engineer,Remote,Mumbai,Bangalore,30,5'
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

        it('wraps non-AppError failures as BULK_UPLOAD_ERROR', async () => {
            db.getConnection.mockRejectedValueOnce(new Error('connection failed'));
            const file = {
                path: '/tmp/missing.csv',
                mimetype: 'text/csv',
                size: 100,
                originalname: 'a.csv'
            };
            await expect(service.processBulkUpload(file)).rejects.toMatchObject({
                errorCode: 'BULK_UPLOAD_ERROR'
            });
        });

        it('processes a valid XLSX upload', async () => {
            const tmp = path.join(os.tmpdir(), `bulk-${Date.now()}.xlsx`);
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Sheet1');
            ws.addRow(validHeaderRow());
            ws.addRow(Object.values(validDataRow()));
            await wb.xlsx.writeFile(tmp);

            const file = {
                path: tmp,
                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                size: fs.statSync(tmp).size,
                originalname: 'candidates.xlsx'
            };

            const result = await service.processBulkUpload(file);

            expect(result.summary.inserted).toBeGreaterThanOrEqual(1);
            expect(candidateRepository.bulkInsert).toHaveBeenCalled();
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('records validation failures without stopping the stream', async () => {
            const tmp = path.join(os.tmpdir(), `bulk-${Date.now()}.csv`);
            const badEmail = validDataRow({ email: 'not-an-email' });
            const csvContent = [
                validHeaderRow().join(','),
                Object.values(badEmail).join(',')
            ].join('\n');
            fs.writeFileSync(tmp, csvContent, 'utf8');

            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: Buffer.byteLength(csvContent),
                originalname: 'candidates.csv'
            };

            const result = await service.processBulkUpload(file);

            expect(result.summary.failed).toBeGreaterThanOrEqual(1);
            expect(result.failedRows.length).toBeGreaterThan(0);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('records duplicate email as a failed row', async () => {
            validatorHelper.checkEmailExists.mockResolvedValue(true);

            const tmp = path.join(os.tmpdir(), `bulk-${Date.now()}.csv`);
            const row = validDataRow();
            const csvContent = [
                validHeaderRow().join(','),
                Object.values(row).join(',')
            ].join('\n');
            fs.writeFileSync(tmp, csvContent, 'utf8');

            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: Buffer.byteLength(csvContent),
                originalname: 'candidates.csv'
            };

            const result = await service.processBulkUpload(file);

            expect(result.summary.failed).toBeGreaterThanOrEqual(1);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('skips completely empty rows', async () => {
            const tmp = path.join(os.tmpdir(), `bulk-${Date.now()}.csv`);
            const emptyCols = validHeaderRow().map(() => '');
            const csvContent = [
                validHeaderRow().join(','),
                emptyCols.join(',')
            ].join('\n');
            fs.writeFileSync(tmp, csvContent, 'utf8');

            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: Buffer.byteLength(csvContent),
                originalname: 'candidates.csv'
            };

            const result = await service.processBulkUpload(file);

            expect(result.summary.skipped).toBeGreaterThanOrEqual(1);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('throws BATCH_INSERT_ERROR when bulk insert fails', async () => {
            candidateRepository.bulkInsert.mockRejectedValueOnce(new Error('deadlock'));

            const tmp = path.join(os.tmpdir(), `bulk-${Date.now()}.csv`);
            const csvContent = [
                validHeaderRow().join(','),
                Object.values(validDataRow()).join(',')
            ].join('\n');
            fs.writeFileSync(tmp, csvContent, 'utf8');

            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: Buffer.byteLength(csvContent),
                originalname: 'candidates.csv'
            };

            await expect(service.processBulkUpload(file)).rejects.toMatchObject({
                errorCode: 'BATCH_INSERT_ERROR'
            });
            expect(fs.existsSync(tmp)).toBe(false);
        });
    });

    describe('processBulkVendorPatch', () => {
        it('throws when extension is not csv/xls/xlsx', async () => {
            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.dat`);
            fs.writeFileSync(tmp, 'x', 'utf8');
            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: 1,
                originalname: 'patch.dat'
            };
            await expect(service.processBulkVendorPatch(file)).rejects.toMatchObject({
                errorCode: 'INVALID_FILE_FORMAT'
            });
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('patches vendor from CSV when candidate exists', async () => {
            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.csv`);
            fs.writeFileSync(
                tmp,
                ['email,vendor_name', 'john@example.com,Acme Vendor'].join('\n'),
                'utf8'
            );
            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: fs.statSync(tmp).size,
                originalname: 'vendors.csv'
            };

            const result = await service.processBulkVendorPatch(file);

            expect(result.summary.patched).toBe(1);
            expect(mockClient.execute).toHaveBeenCalled();
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('skips rows without vendor name', async () => {
            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.csv`);
            fs.writeFileSync(
                tmp,
                ['email,vendor_name', 'john@example.com,'].join('\n'),
                'utf8'
            );
            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: fs.statSync(tmp).size,
                originalname: 'vendors.csv'
            };

            const result = await service.processBulkVendorPatch(file);

            expect(result.summary.skipped).toBeGreaterThanOrEqual(1);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('records failure when email and contact are missing', async () => {
            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.csv`);
            fs.writeFileSync(
                tmp,
                ['vendor_name', 'Acme'].join('\n'),
                'utf8'
            );
            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: fs.statSync(tmp).size,
                originalname: 'vendors.csv'
            };

            const result = await service.processBulkVendorPatch(file);

            expect(result.summary.failed).toBeGreaterThanOrEqual(1);
            expect(result.failedRows.some((r) => String(r.error).includes('No email or contact'))).toBe(true);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('records not found when candidate does not exist', async () => {
            mockClient.execute.mockImplementation(async (sql) => {
                if (String(sql).includes('SELECT candidateId')) {
                    return [[]];
                }
                return [{ affectedRows: 0 }];
            });

            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.csv`);
            fs.writeFileSync(
                tmp,
                ['email,vendor_name', 'missing@example.com,Acme'].join('\n'),
                'utf8'
            );
            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: fs.statSync(tmp).size,
                originalname: 'vendors.csv'
            };

            const result = await service.processBulkVendorPatch(file);

            expect(result.summary.failed).toBeGreaterThanOrEqual(1);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('runs vendor patch from XLSX', async () => {
            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.xlsx`);
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('S');
            ws.addRow(['email', 'vendor_name']);
            ws.addRow(['john@example.com', 'Acme Vendor']);
            await wb.xlsx.writeFile(tmp);

            const file = {
                path: tmp,
                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                size: fs.statSync(tmp).size,
                originalname: 'vendors.xlsx'
            };

            const result = await service.processBulkVendorPatch(file);

            expect(result.summary.patched).toBe(1);
            expect(fs.existsSync(tmp)).toBe(false);
        });

        it('wraps unexpected errors as VENDOR_PATCH_ERROR', async () => {
            db.getConnection.mockRejectedValueOnce(new Error('db down'));
            const tmp = path.join(os.tmpdir(), `vp-${Date.now()}.csv`);
            fs.writeFileSync(
                tmp,
                ['email,vendor_name', 'a@b.com,V'].join('\n'),
                'utf8'
            );
            const file = {
                path: tmp,
                mimetype: 'text/csv',
                size: fs.statSync(tmp).size,
                originalname: 'v.csv'
            };

            await expect(service.processBulkVendorPatch(file)).rejects.toMatchObject({
                errorCode: 'VENDOR_PATCH_ERROR'
            });
            expect(fs.existsSync(tmp)).toBe(false);
        });
    });
});
