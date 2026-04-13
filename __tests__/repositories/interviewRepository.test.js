const InterviewRepository = require('../../repositories/interviewRepository');

describe('InterviewRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        mockConn = {
            execute: jest.fn(),
            query: jest.fn()
        };
        repo = new InterviewRepository({});
    });

    it('getSummary returns interviewers array', async () => {
        mockConn.query.mockResolvedValue([[{ interviewerId: 1, total: 2 }]]);

        const out = await repo.getSummary(mockConn);

        expect(out.interviewers).toHaveLength(1);
    });

    it('getById returns row or null', async () => {
        mockConn.query.mockResolvedValueOnce([[{ interviewId: 1, candidateId: 2 }]]);

        await expect(repo.getById(1, mockConn)).resolves.toMatchObject({ interviewId: 1 });

        mockConn.query.mockResolvedValueOnce([[]]);
        await expect(repo.getById(99, mockConn)).resolves.toBeNull();
    });

    it('getAll returns data array', async () => {
        mockConn.query.mockResolvedValue([[{ interviewId: 1 }]]);

        const result = await repo.getAll(10, 1, mockConn);

        expect(result.data).toHaveLength(1);
    });

    it('getInterviewsByCandidateId returns rows', async () => {
        mockConn.query.mockResolvedValue([[{ interviewId: 3 }]]);

        await expect(repo.getInterviewsByCandidateId(5, mockConn)).resolves.toHaveLength(1);
    });

    it('getMonthlySummary returns summary object', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ total: 1, selected: 0, rejected: 0, pending: 1, cancelled: 0 }]])
            .mockResolvedValueOnce([[{ interviewerId: 1, total: 1 }]])
            .mockResolvedValueOnce([[{ interviewTimeStamp: '2024-01-01' }]]);

        const out = await repo.getMonthlySummary(mockConn, new Date('2024-01-01'), new Date('2024-01-31'));

        expect(out.summary).toBeDefined();
        expect(out.interviewers).toHaveLength(1);
    });

    it('getDailySummary returns data', async () => {
        mockConn.query.mockResolvedValue([[{ total: 2 }]]);

        const out = await repo.getDailySummary(mockConn, new Date(), new Date());

        expect(out).toBeDefined();
    });

    it('getInterviewsByDateRange parses JSON location and applies filters', async () => {
        const row = {
            interviewId: 1,
            expectedJoiningLocation: JSON.stringify({
                locationId: 1,
                city: 'Pune',
                state: 'MH',
                country: 'IN'
            })
        };
        mockConn.query.mockResolvedValue([[row]]);

        const start = new Date('2025-01-01T00:00:00.000Z');
        const end = new Date('2025-01-31T00:00:00.000Z');
        const rows = await repo.getInterviewsByDateRange(mockConn, start, end, {
            interviewerId: 2,
            result: 'pending',
            candidateId: 3
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].expectedJoiningLocation).toEqual(
            expect.objectContaining({ city: 'Pune' })
        );
    });

    it('getInterviewerWorkloadReport returns grouped interviewers', async () => {
        mockConn.query
            .mockResolvedValueOnce([
                [
                    {
                        interviewerId: 1,
                        interviewerName: 'A',
                        totalInterviews: 2,
                        interviewsConducted: 2,
                        pending: 1,
                        selected: 1,
                        rejected: 0,
                        cancelled: 0,
                        cancelledByCandidates: 0
                    }
                ]
            ])
            .mockResolvedValueOnce([
                [
                    {
                        interviewerId: 1,
                        candidateId: 9,
                        candidateName: 'C',
                        role: 'Dev',
                        round: 'R1',
                        date: '2025-01-01T10:00:00Z',
                        result: 'pending',
                        feedback: null,
                        recruiterId: 4,
                        recruiterName: 'R'
                    }
                ]
            ]);

        const out = await repo.getInterviewerWorkloadReport(
            mockConn,
            new Date('2025-01-01'),
            new Date('2025-01-02'),
            1
        );

        expect(out.interviewers).toHaveLength(1);
        expect(out.interviewers[0].interviews).toHaveLength(1);
    });

    it('getFormData returns interviewers and recruiters', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ interviewerId: 1, interviewerName: 'I' }]])
            .mockResolvedValueOnce([[{ recruiterId: 2, recruiterName: 'R' }]]);

        const out = await repo.getFormData(mockConn);

        expect(out.interviewers).toHaveLength(1);
        expect(out.recruiters).toHaveLength(1);
    });

    it('getFinalizationFormData returns first row or null', async () => {
        mockConn.query.mockResolvedValueOnce([[{ interviewId: 1, result: 'pending' }]]);
        await expect(repo.getFinalizationFormData(mockConn, 1)).resolves.toMatchObject({
            interviewId: 1
        });

        mockConn.query.mockResolvedValueOnce([[]]);
        await expect(repo.getFinalizationFormData(mockConn, 99)).resolves.toBeNull();
    });

    it('exists returns row or null', async () => {
        mockConn.execute.mockResolvedValueOnce([[{ interviewId: 1, candidateId: 2 }]]);
        await expect(repo.exists(1, mockConn)).resolves.toMatchObject({ interviewId: 1 });

        mockConn.execute.mockResolvedValueOnce([[]]);
        await expect(repo.exists(99, mockConn)).resolves.toBeNull();
    });

    it('softDeleteByCandidateId and softDeleteByInterviewerId return affected rows', async () => {
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 2 }]);
        await expect(repo.softDeleteByCandidateId(5, mockConn)).resolves.toBe(2);

        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await expect(repo.softDeleteByInterviewerId(7, mockConn)).resolves.toBe(1);
    });

    it('permanentlyDeleteBatch returns 0 for empty ids', async () => {
        await expect(repo.permanentlyDeleteBatch([], mockConn)).resolves.toBe(0);
    });

    it('permanentlyDeleteBatch deletes by ids', async () => {
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 3 }]);
        await expect(repo.permanentlyDeleteBatch([1, 2, 3], mockConn)).resolves.toBe(3);
    });

    it('getInterviewerDailyStatsUTC aggregates capacity and times', async () => {
        mockConn.execute
            .mockResolvedValueOnce([[{ interviewerCapacity: 5 }]])
            .mockResolvedValueOnce([[{ count: 2 }]])
            .mockResolvedValueOnce([[{ fromTimeUTC: '2025-01-01T10:00:00Z' }]]);

        const out = await repo.getInterviewerDailyStatsUTC(
            1,
            new Date('2025-01-01'),
            new Date('2025-01-02'),
            mockConn
        );

        expect(out.capacity).toBe(5);
        expect(out.scheduledCount).toBe(2);
        expect(out.scheduledTimesUTC).toEqual(['2025-01-01T10:00:00Z']);
    });

    it('delete soft-deletes and returns candidateId', async () => {
        mockConn.query.mockResolvedValueOnce([[{ candidateId: 44 }]]);
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const out = await repo.delete(10, mockConn);

        expect(out.success).toBe(true);
        expect(out.candidateId).toBe(44);
    });

    it('create inserts and returns ranked row', async () => {
        mockConn.execute.mockResolvedValueOnce([{ insertId: 200 }]);
        mockConn.query.mockResolvedValueOnce([
            [
                {
                    interviewId: 200,
                    candidateId: 3,
                    roundNumber: 1,
                    candidateName: 'A'
                }
            ]
        ]);

        const row = await repo.create(
            3,
            {
                interviewDate: '2025-06-01',
                startUTC: new Date('2025-06-01T10:00:00.000Z'),
                eventTimezone: 'Asia/Kolkata',
                durationMinutes: 45,
                interviewerId: 1,
                scheduledById: 2,
                result: 'pending'
            },
            mockConn
        );

        expect(row.interviewId).toBe(200);
        expect(row.candidateName).toBe('A');
    });

    it('update patches allowed fields and returns candidateId', async () => {
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
        mockConn.query.mockResolvedValueOnce([[{ candidateId: 8 }]]);

        const out = await repo.update(
            15,
            { durationMinutes: 30, interviewerId: 2, extraIgnored: true },
            mockConn
        );

        expect(out.interviewId).toBe(15);
        expect(out.candidateId).toBe(8);
        expect(out.durationMinutes).toBe(30);
    });

    it('finalize writes result fields', async () => {
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const out = await repo.finalize(
            20,
            { result: 'Selected', recruiterNotes: 'ok', meetingUrl: 'https://meet.example/x' },
            mockConn
        );

        expect(out.interviewId).toBe(20);
        expect(out.result).toBe('Selected');
    });

    it('update throws when interview row missing', async () => {
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(
            repo.update(999, { durationMinutes: 30 }, mockConn)
        ).rejects.toMatchObject({ errorCode: 'INTERVIEW_ENTRY_NOT_FOUND' });
    });

    it('finalize throws when interview row missing', async () => {
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(
            repo.finalize(998, { result: 'Selected' }, mockConn)
        ).rejects.toMatchObject({ errorCode: 'INTERVIEW_ENTRY_NOT_FOUND' });
    });

    it('delete reports success false when update affects no rows', async () => {
        mockConn.query.mockResolvedValueOnce([[{ candidateId: 1 }]]);
        mockConn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

        const out = await repo.delete(50, mockConn);

        expect(out.success).toBe(false);
    });

    it('update validates id, data, and allowed fields', async () => {
        await expect(repo.update(null, { durationMinutes: 1 }, mockConn)).rejects.toMatchObject({
            errorCode: 'MISSING_INTERVIEW_ID'
        });
        await expect(repo.update(1, {}, mockConn)).rejects.toMatchObject({
            errorCode: 'MISSING_INTERVIEW_DATA'
        });
        await expect(repo.update(1, { unknown: 1 }, mockConn)).rejects.toMatchObject({
            errorCode: 'NO_VALID_FIELDS'
        });
    });

    it('finalize validates id and payload', async () => {
        await expect(repo.finalize(null, { result: 'Selected' }, mockConn)).rejects.toMatchObject({
            errorCode: 'MISSING_INTERVIEW_ID'
        });
        await expect(repo.finalize(1, {}, mockConn)).rejects.toMatchObject({
            errorCode: 'MISSING_FINAL_DATA'
        });
        await expect(repo.finalize(1, { unknown: 1 }, mockConn)).rejects.toMatchObject({
            errorCode: 'NO_VALID_FIELDS'
        });
    });
});
