const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const AppError = require('../utils/appError');

/**
 * Enterprise-grade bulk candidate upload service
 * Supports CSV and XLSX with streaming, validation, and batched DB operations
 */
class CandidateBulkService {
    constructor(candidateRepository, validatorHelper, db) {
        this.candidateRepository = candidateRepository;
        this.validatorHelper = validatorHelper;
        this.db = db;

        // Configuration
        this.BATCH_SIZE = 200; // Sweet spot for MySQL performance
        this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        this.MAX_ROWS = 50000; // Safety limit

        // Tracking
        this.stats = {
            total: 0,
            processed: 0,
            inserted: 0,
            failed: 0,
            skipped: 0
        };

        this.failedRows = [];
        this.currentBatch = [];
    }

    /**
     * Main entry point - validates file and routes to appropriate parser
     */
    async processBulkUpload(file, options = {}) {
        const startTime = Date.now();

        try {
            // Pre-flight checks
            this._validateFile(file);

            // Reset state
            this._resetState();

            // Route to parser based on file type
            const ext = path.extname(file.originalname).toLowerCase();
            let result;

            if (ext === '.csv') {
                result = await this._processCSV(file.path, options);
            } else if (['.xlsx', '.xls'].includes(ext)) {
                result = await this._processExcel(file.path, options);
            } else {
                throw new AppError(
                    'Unsupported file format. Only CSV and Excel files are allowed.',
                    400,
                    'INVALID_FILE_FORMAT'
                );
            }

            // Clean up uploaded file
            await this._cleanupFile(file.path);

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            return {
                summary: {
                    totalRows: this.stats.total,
                    inserted: this.stats.inserted,
                    failed: this.stats.failed,
                    skipped: this.stats.skipped,
                    processingTime: `${duration}s`
                },
                failedRows: this.failedRows.slice(0, 100), // Limit to first 100 errors
                hasMoreErrors: this.failedRows.length > 100
            };

        } catch (error) {
            // Clean up on error
            if (file && file.path) {
                await this._cleanupFile(file.path);
            }

            if (error instanceof AppError) {
                throw error;
            }

            console.error('Bulk upload error:', error);
            throw new AppError(
                'Failed to process bulk upload',
                500,
                'BULK_UPLOAD_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * CSV streaming processor
     */
    async _processCSV(filePath, options) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
            const csvStream = csv({
                mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_'), //normalise Full Name column to full_name
                skipLines: 0,
                strict: true //reject malformed rows
            });

            // Row counter for error reporting
            let rowNumber = 1; // Header is row 1

            const processStream = new Transform({
                objectMode: true, // Each chunk is a parsed row object {column:value}
                transform: async (row, encoding, callback) => {
                    rowNumber++;
                    this.stats.total++;

                    try {
                        // Safety limit check
                        if (this.stats.total > this.MAX_ROWS) {
                            throw new AppError(
                                `Maximum row limit (${this.MAX_ROWS}) exceeded`,
                                400,
                                'ROW_LIMIT_EXCEEDED'
                            );
                        }

                        // Process single row
                        const processed = await this._processRow(row, rowNumber, client);

                        if (processed) {
                            this.currentBatch.push(processed);

                            // Flush batch when size reached
                            if (this.currentBatch.length >= this.BATCH_SIZE) {
                                await this._flushBatch(client);
                            }
                        }

                        callback();
                    } catch (error) {
                        // Row-level errors don't break the stream
                        this._recordFailure(rowNumber, error.message || 'Unknown error');
                        callback();
                    }
                }
            });

            // Stream pipeline with error handling
            await pipeline(readStream, csvStream, processStream);

            // Flush remaining batch
            await this._flushBatch(client);

            await client.commit();

        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Excel streaming processor
     */
    async _processExcel(filePath, options) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
                sharedStrings: 'cache',
                hyperlinks: 'ignore',
                styles: 'ignore'
            });

            let headers = [];
            let rowNumber = 0;

            for await (const worksheetReader of workbook) {
                for await (const row of worksheetReader) {
                    rowNumber++;

                    // First row = headers
                    if (rowNumber === 1) {
                        headers = row.values.slice(1).map(h =>
                            String(h || '').trim().toLowerCase().replace(/\s+/g, '_')
                        );
                        continue;
                    }

                    this.stats.total++;

                    // Safety limit
                    if (this.stats.total > this.MAX_ROWS) {
                        throw new AppError(
                            `Maximum row limit (${this.MAX_ROWS}) exceeded`,
                            400,
                            'ROW_LIMIT_EXCEEDED'
                        );
                    }

                    try {
                        // Convert Excel row to object
                        const rowData = {};
                        const values = row.values.slice(1); // Skip index 0 (Excel quirk)

                        headers.forEach((header, idx) => {
                            if (header) {
                                const value = values[idx];
                                rowData[header] = value !== null && value !== undefined
                                    ? String(value).trim()
                                    : null;
                            }
                        });

                        // Process row
                        const processed = await this._processRow(rowData, rowNumber, client);

                        if (processed) {
                            this.currentBatch.push(processed);

                            if (this.currentBatch.length >= this.BATCH_SIZE) {
                                await this._flushBatch(client);
                            }
                        }

                    } catch (error) {
                        this._recordFailure(rowNumber, error.message || 'Unknown error');
                    }
                }
            }

            // Flush remaining batch
            await this._flushBatch(client);

            await client.commit();

        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Process and validate a single row
     */
    async _processRow(rawRow, rowNumber, client) {
        try {
            // Step 1: Map CSV/Excel columns to database schema
            const mapped = this._mapRowToSchema(rawRow);

            // Step 2: Validate mapped data
            const validated = await this._validateRow(mapped, rowNumber);

            if (!validated) {
                return null; // Skip row
            }

            // Step 3: Transform lookups (status, location, recruiter)
            const transformed = await this._transformRow(validated, client);

            // Step 4: Check for duplicates
            await this._checkDuplicates(transformed, rowNumber, client);

            this.stats.processed++;
            return transformed;

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new Error(error.message || 'Row processing failed');
        }
    }

    /**
     * Map CSV/Excel columns to candidate schema
     * Supports flexible column naming
     */
    _mapRowToSchema(raw) {
        // Helper to find value by multiple possible column names
        const findValue = (possibleNames) => {
            for (const name of possibleNames) {
                if (raw[name] !== undefined && raw[name] !== null && raw[name] !== '') {
                    return raw[name];
                }
            }
            return null;
        };

        return {
            candidateName: findValue(['candidate_name', 'name', 'full_name', 'candidatename']),
            contactNumber: findValue(['contact_number', 'phone', 'mobile', 'contact', 'contactnumber']),
            email: findValue(['email', 'email_address', 'emailaddress']),
            recruiterName: findValue(['recruiter_name', 'recruiter', 'recruitername']),
            clientName: findValue(['client_name', 'client', 'clientname']),
            departmentName: findValue(['department_name', 'department', 'departmentname']),
            jobRole: findValue(['job_role', 'role', 'position', 'jobrole']),
            currentCity: findValue(['current_city', 'current_location', 'city', 'currentcity']),
            expectedCity: findValue(['expected_city', 'preferred_city', 'expected_location', 'expectedcity']),
            currentCTC: findValue(['current_ctc', 'currentctc', 'current_salary']),
            expectedCTC: findValue(['expected_ctc', 'expectedctc', 'expected_salary']),
            noticePeriod: findValue(['notice_period', 'notice', 'noticeperiod']),
            experienceYears: findValue(['experience_years', 'experience', 'exp', 'experienceyears']),
            linkedinProfileUrl: findValue(['linkedin_url', 'linkedin', 'linkedinprofileurl']),
            notes: findValue(['notes', 'comments', 'remarks']),
            vendorName: findValue(['vendor_name', 'vendor', 'vendorname']),
            referredBy: findValue(['referred_by', 'referrer', 'referredby'])
        };
    }

    /**
     * Validate row data using Joi schema (reusing existing validator)
     */
    async _validateRow(data, rowNumber) {
        const Joi = require('joi');

        // Bulk upload schema - must match single create validation exactly
        const bulkSchema = Joi.object({
            candidateName: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .pattern(/^[a-zA-Z\s.'-]+$/)
                .required(),

            contactNumber: Joi.string()
                .trim()
                .pattern(/^[+]?[\d\s()-]{7,25}$/)
                .optional()
                .allow(null, ''),

            email: Joi.string()
                .trim()
                .email()
                .max(255)
                .lowercase()
                .optional()
                .allow(null, ''),

            recruiterName: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    'any.required': 'Recruiter name is required',
                    'string.empty': 'Recruiter name is required'
                }),

            clientName: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    'any.required': 'Client name is required',
                    'string.empty': 'Client name is required'
                }),

            departmentName: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    'any.required': 'Department name is required',
                    'string.empty': 'Department name is required'
                }),

            jobRole: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required()
                .messages({
                    'any.required': 'Job role is required',
                    'string.empty': 'Job role is required'
                }),

            currentCity: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .optional()
                .allow(null, ''),

            expectedCity: Joi.string()
                .trim()
                .min(2)
                .max(100)
                .required(),

            currentCTC: Joi.number()
                .precision(2)
                .min(0)
                .max(10000000)
                .optional()
                .allow(null),

            expectedCTC: Joi.number()
                .precision(2)
                .min(0)
                .max(10000000)
                .optional()
                .allow(null),

            noticePeriod: Joi.number()
                .integer()
                .min(0)
                .max(365)
                .required(),

            experienceYears: Joi.number()
                .precision(2)
                .min(0)
                .max(50)
                .required(),

            linkedinProfileUrl: Joi.string()
                .trim()
                .uri({ scheme: ['http', 'https'] })
                .pattern(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/)
                .max(500)
                .optional()
                .allow(null, ''),

            notes: Joi.string()
                .optional()
                .allow(null, ''),
            vendorName: Joi.string()
                .trim()
                .optional()
                .min(2)
                .max(100),
            referredBy: Joi.string()
                .trim()
                .optional()
                .min(2)
                .max(100)
        }).custom((value, helpers) => {
            if (value.expectedCTC && value.currentCTC && value.expectedCTC < value.currentCTC) {
                return helpers.error('custom.ctcRange');
            }
            return value;
        }).messages({
            'custom.ctcRange': 'Expected CTC should not be less than current CTC'
        });

        const { error, value } = bulkSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
        });

        if (error) {
            const errorMessages = error.details.map(d => d.message).join('; ');
            throw new Error(errorMessages);
        }

        return value;
    }

    /**
     * Transform lookups (locations, status, recruiter, job profile requirement)
     */
    async _transformRow(data, client) {
        const transformed = { ...data };

        // Transform expected location
        if (data.expectedCity) {
            transformed.expectedLocation = await this.validatorHelper.transformLocation(
                { city: data.expectedCity, country: 'india' },
                client
            );
            delete transformed.expectedCity;
        }

        // Transform current location (optional)
        if (data.currentCity) {
            transformed.currentLocation = await this.validatorHelper.transformLocation(
                { city: data.currentCity, country: 'india' },
                client
            );
            delete transformed.currentCity;
        }

        // Default status to 'pending'
        transformed.statusId = await this.validatorHelper.getStatusIdByName('pending', client);

        // Transform recruiter name to ID
        if (data.recruiterName) {
            try {
                transformed.recruiterId = await this.validatorHelper.getRecruiterId(
                    data.recruiterName,
                    client
                );
                delete transformed.recruiterName;
            } catch (error) {
                throw new Error(`Recruiter '${data.recruiterName}' not found`);
            }
        } else {
            throw new Error('Recruiter name is required');
        }

        // Transform job requirement lookup (client + department + role) to ID
        if (data.clientName && data.departmentName && data.jobRole) {
            try {
                transformed.jobProfileRequirementId = await this.validatorHelper.getJobProfileRequirementId(
                    data.clientName,
                    data.departmentName,
                    data.jobRole,
                    client
                );
                // Remove the lookup fields, keep only the ID
                delete transformed.clientName;
                delete transformed.departmentName;
                delete transformed.jobRole;
            } catch (error) {
                throw new Error(`Job requirement not found for Client: '${data.clientName}', Department: '${data.departmentName}', Role: '${data.jobRole}'`);
            }
        } else {
            throw new Error('Client name, department name, and job role are all required');
        }

        return transformed;
    }

    /**
     * Check for duplicate email/phone
     */
    async _checkDuplicates(data, rowNumber, client) {
        if (data.email) {
            const emailExists = await this.validatorHelper.checkEmailExists(
                data.email,
                null,
                client
            );

            if (emailExists) {
                throw new Error(`Duplicate email: ${data.email}`);
            }
        }

        if (data.contactNumber) {
            const contactExists = await this.validatorHelper.checkContactExists(
                data.contactNumber,
                null,
                client
            );

            if (contactExists) {
                throw new Error(`Duplicate contact number: ${data.contactNumber}`);
            }
        }
    }

    /**
     * Flush batch to database
     */
    async _flushBatch(client) {
        if (this.currentBatch.length === 0) {
            return;
        }

        try {
            await this.candidateRepository.bulkInsert(this.currentBatch, client);
            this.stats.inserted += this.currentBatch.length;
            this.currentBatch = [];
        } catch (error) {
            console.error('Batch insert failed:', error);
            throw new AppError(
                'Failed to insert batch',
                500,
                'BATCH_INSERT_ERROR',
                { batchSize: this.currentBatch.length, error: error.message }
            );
        }
    }

    /**
     * File validation
     */
    _validateFile(file) {
        if (!file) {
            throw new AppError('No file uploaded', 400, 'NO_FILE_UPLOADED');
        }

        const allowedMimeTypes = [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new AppError(
                'Invalid file format. Only CSV and Excel files are allowed.',
                400,
                'INVALID_FILE_FORMAT'
            );
        }

        if (file.size > this.MAX_FILE_SIZE) {
            throw new AppError(
                `File size exceeds maximum limit of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
                400,
                'FILE_TOO_LARGE'
            );
        }
    }

    /**
     * Record failed row
     */
    _recordFailure(rowNumber, errorMessage) {
        this.stats.failed++;
        this.failedRows.push({
            row: rowNumber,
            error: errorMessage
        });
    }

    /**
     * Reset state for new upload
     */
    _resetState() {
        this.stats = {
            total: 0,
            processed: 0,
            inserted: 0,
            failed: 0,
            skipped: 0
        };
        this.failedRows = [];
        this.currentBatch = [];
    }

    /**
     * Clean up uploaded file
     */
    async _cleanupFile(filePath) {
        if (!filePath) return;

        try {
            await fs.promises.unlink(filePath);
            console.log(`Deleted temp file: ${filePath}`);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('Failed to delete temp file:', err);
            }
        }
    }

    /**
     * Generate CSV template for users
     */
    async generateTemplate() {
        const headers = [
            'candidate_name',
            'email',
            'contact_number',
            'recruiter_name',
            'client_name',
            'department_name',
            'job_role',
            'current_city',
            'expected_city',
            'current_ctc',
            'expected_ctc',
            'notice_period',
            'experience_years',
            'linkedin_url',
            'notes',
            'vendor_name',
            'referred_by'
        ];

        const sampleData = [
            {
                candidate_name: 'John Doe',
                email: 'john.doe@example.com',
                contact_number: '+91-9876543210',
                recruiter_name: 'Jayraj',
                client_name: 'TCS',
                department_name: 'Engineering',
                job_role: 'Senior Software Engineer',
                current_city: 'Ahmedabad',
                expected_city: 'Bangalore',
                current_ctc: 1200000,
                expected_ctc: 1500000,
                notice_period: 30,
                experience_years: 5.5,
                linkedin_url: 'https://linkedin.com/in/johndoe',
                notes: 'Strong React and Node.js skills',
                vendor_name: 'Tech Recruiters Inc.',
                referred_by: 'Jane Smith'
            }
        ];

        return {
            headers,
            sampleData
        };
    }
}

module.exports = CandidateBulkService;