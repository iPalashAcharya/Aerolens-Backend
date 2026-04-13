const InterviewService = require('../../services/interviewService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('InterviewService static helpers', () => {
    it('computeEventTimestamp converts UTC to event timezone', () => {
        const iso = InterviewService.computeEventTimestamp('2024-06-15T10:00:00.000Z', 'Asia/Kolkata');
        expect(iso).toMatch(/2024-06-15/);
    });

    it('enrichInterview capitalizes result and adds eventTimestamp', () => {
        const row = {
            result: 'pass',
            fromTime: '2024-01-10T09:00:00.000Z',
            eventTimezone: 'UTC',
        };
        InterviewService.enrichInterview(row);
        expect(row.result).toBe('Pass');
        expect(row.eventTimestamp).toBeDefined();
    });

    it('enrichInterview returns nullish input unchanged', () => {
        expect(InterviewService.enrichInterview(null)).toBeNull();
    });

    it('buildUtcDateTime returns Date for valid inputs', () => {
        const d = InterviewService.buildUtcDateTime('2024-03-01', '14:30', 'UTC');
        expect(d).toBeInstanceOf(Date);
    });

    it('buildUtcDateTime throws on invalid date/time', () => {
        expect(() =>
            InterviewService.buildUtcDateTime('not-a-date', '99:99', 'UTC')
        ).toThrow(AppError);
    });

    it('capitalizeFirstLetter handles edge cases', () => {
        expect(InterviewService.capitalizeFirstLetter('')).toBe('');
        expect(InterviewService.capitalizeFirstLetter('ab')).toBe('Ab');
        expect(InterviewService.capitalizeFirstLetter(1)).toBe('');
    });

    it('capitalizeField no-ops on missing string', () => {
        const o = { x: null };
        InterviewService.capitalizeField(o, 'x');
        expect(o.x).toBeNull();
    });
});

describe('InterviewService instance (mocked repo + db)', () => {
    let service;
    let mockRepo;
    let mockClient;
    let mockDb;

    const audit = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            query: jest.fn(),
            execute: jest.fn(),
        };
        mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
        mockRepo = {
            getAll: jest.fn(),
            getById: jest.fn(),
            getInterviewsByCandidateId: jest.fn(),
            getFormData: jest.fn(),
            getFinalizationFormData: jest.fn(),
            getSummary: jest.fn(),
            getMonthlySummary: jest.fn(),
            getDailySummary: jest.fn(),
            getInterviewsByDateRange: jest.fn(),
            getInterviewerWorkloadReport: jest.fn(),
            getInterviewerDailyStatsUTC: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            finalize: jest.fn(),
            delete: jest.fn(),
            permanentlyDeleteBatch: jest.fn(),
        };
        service = new InterviewService(mockRepo, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    it('getAll enriches interviews', async () => {
        mockRepo.getAll.mockResolvedValue({
            data: [{ interviewId: 1, result: 'pending' }],
        });

        const out = await service.getAll();

        expect(out.data).toHaveLength(1);
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('getInterviewById throws when missing', async () => {
        mockRepo.getById.mockResolvedValue(null);

        await expect(service.getInterviewById(99)).rejects.toMatchObject({
            errorCode: 'INTERVIEW_ENTRY_NOT_FOUND',
        });
    });

    it('getInterviewById enriches single row', async () => {
        mockRepo.getById.mockResolvedValue({
            interviewId: 1,
            result: 'pass',
            fromTime: '2024-01-10T09:00:00.000Z',
            eventTimezone: 'UTC',
        });

        const row = await service.getInterviewById(1);

        expect(row.result).toBe('Pass');
    });

    it('getInterviewsByCandidateId returns totals', async () => {
        mockRepo.getInterviewsByCandidateId.mockResolvedValue([
            { interviewId: 1, result: 'x' },
        ]);

        const out = await service.getInterviewsByCandidateId(5);

        expect(out.candidateId).toBe(5);
        expect(out.totalRounds).toBe(1);
    });

    it('getFormData delegates to repository', async () => {
        mockRepo.getFormData.mockResolvedValue({ interviewers: [] });

        await expect(service.getFormData(3)).resolves.toEqual({ interviewers: [] });
    });

    it('getFinalizationFormData throws when repo returns null', async () => {
        mockRepo.getFinalizationFormData.mockResolvedValue(null);

        await expect(service.getFinalizationFormData(1)).rejects.toMatchObject({
            errorCode: 'INTERVIEW_ENTRY_NOT_FOUND',
        });
    });

    it('getTotalSummary returns repository data', async () => {
        mockRepo.getSummary.mockResolvedValue({ total: 3 });

        await expect(service.getTotalSummary()).resolves.toEqual({ total: 3 });
    });

    it('getMonthlySummary delegates', async () => {
        mockRepo.getMonthlySummary.mockResolvedValue([]);

        await expect(
            service.getMonthlySummary('2024-01-01', '2024-01-31', 'UTC')
        ).resolves.toEqual([]);
    });

    it('getDailySummary delegates', async () => {
        mockRepo.getDailySummary.mockResolvedValue({});

        await expect(service.getDailySummary('2024-01-15', 'UTC')).resolves.toEqual({});
    });

    it('getInterviewTracker uses today filter', async () => {
        mockRepo.getInterviewsByDateRange.mockResolvedValue([
            { result: 'pass' },
        ]);

        const rows = await service.getInterviewTracker({
            filter: 'today',
            timezone: 'UTC',
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].result).toBe('Pass');
    });

    it('getInterviewerWorkloadReport uses custom filter', async () => {
        mockRepo.getInterviewerWorkloadReport.mockResolvedValue({
            interviewers: [
                {
                    interviews: [{ result: 'fail' }],
                },
            ],
        });

        const out = await service.getInterviewerWorkloadReport({
            filter: 'custom',
            startDate: '2024-01-01',
            endDate: '2024-01-07',
            timezone: 'UTC',
        });

        expect(out.interviewers[0].interviews[0].result).toBe('Fail');
    });

    it('getInterviewerDailyCapacity maps stats', async () => {
        mockRepo.getInterviewerDailyStatsUTC.mockResolvedValue({
            capacity: 5,
            scheduledCount: 2,
            scheduledTimesUTC: [],
        });

        const out = await service.getInterviewerDailyCapacity(9, '2024-02-01', 'UTC');

        expect(out.isFull).toBe(false);
        expect(out.scheduledCount).toBe(2);
    });

    it('assertCandidateActive throws when candidate missing', async () => {
        mockClient.query.mockResolvedValue([[]]);

        await expect(service.assertCandidateActive(1, mockClient)).rejects.toMatchObject({
            errorCode: 'CANDIDATE_NOT_FOUND',
        });
    });

    it('assertCandidateActive throws when inactive', async () => {
        mockClient.query.mockResolvedValue([[{ candidateId: 1, isActive: 0 }]]);

        await expect(service.assertCandidateActive(1, mockClient)).rejects.toMatchObject({
            errorCode: 'CANDIDATE_INACTIVE',
        });
    });

    it('createInterview commits after successful create', async () => {
        let q = 0;
        mockClient.query.mockImplementation(() => {
            q += 1;
            if (q === 1) {
                return Promise.resolve([[{ candidateId: 1, isActive: 1 }]]);
            }
            return Promise.resolve([[]]);
        });
        mockRepo.create.mockResolvedValue({ interviewId: 10 });

        const result = await service.createInterview(
            1,
            {
                interviewDate: '2025-01-15',
                fromTime: '10:00',
                eventTimezone: 'UTC',
                durationMinutes: 30,
                interviewerId: 2,
            },
            audit
        );

        expect(result.interviewId).toBe(10);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('deleteInterview rolls back on generic error', async () => {
        mockRepo.getById.mockResolvedValue({ interviewId: 1, candidateId: 1 });
        mockRepo.delete.mockRejectedValue(new Error('db'));

        await expect(service.deleteInterview(1, audit)).rejects.toMatchObject({
            errorCode: 'INTERVIEW_DELETION_ERROR',
        });
        expect(mockClient.rollback).toHaveBeenCalled();
    });

    it('deleteInterview commits when delete succeeds', async () => {
        mockRepo.getById.mockResolvedValue({ interviewId: 1, candidateId: 1 });
        mockRepo.delete.mockResolvedValue({ success: true });

        const out = await service.deleteInterview(1, audit);

        expect(out.success).toBe(true);
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('permanentlyDeleteOldInterviews commits when no rows', async () => {
        mockClient.execute.mockResolvedValue([[]]);

        await service.permanentlyDeleteOldInterviews();

        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('finalizeInterview commits when interview is in the past', async () => {
        mockRepo.getById.mockResolvedValue({
            interviewId: 1,
            fromTimeUTC: new Date('2020-01-01'),
        });
        mockRepo.finalize.mockResolvedValue({ interviewId: 1, result: 'selected' });

        const out = await service.finalizeInterview(1, { result: 'selected' }, audit);

        expect(out.result).toBe('selected');
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('scheduleNextRound commits when overlaps clear and prior interviews exist', async () => {
        mockClient.query.mockResolvedValue([[]]);
        mockRepo.getInterviewsByCandidateId.mockResolvedValue([{ interviewId: 5 }]);
        mockRepo.create.mockResolvedValue({ interviewId: 8, roundNumber: 2 });

        const out = await service.scheduleNextRound(
            1,
            {
                interviewDate: '2025-02-01',
                fromTime: '11:00',
                eventTimezone: 'UTC',
                durationMinutes: 45,
                interviewerId: 3,
            },
            audit
        );

        expect(out.success).toBe(true);
        expect(out.data.roundNumber).toBe(2);
    });
});
