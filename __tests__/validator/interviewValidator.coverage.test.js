const AppError = require('../../utils/appError');
const InterviewValidator = require('../../validators/interviewValidator');

describe('InterviewValidator middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = { body: {}, params: {}, query: {} };
        res = {};
        next = jest.fn();
    });

    const validCreateBody = () => ({
        interviewDate: '2025-12-15',
        fromTime: '10:00',
        durationMinutes: 60,
        eventTimezone: 'Asia/Kolkata',
        interviewerId: 1,
        scheduledById: 2
    });

    it('validateCreate calls next on valid body', () => {
        req.body = validCreateBody();
        InterviewValidator.validateCreate(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateCreate throws AppError on invalid body', () => {
        req.body = { ...validCreateBody(), durationMinutes: 5 };
        expect(() => InterviewValidator.validateCreate(req, res, next)).toThrow(AppError);
        expect(next).not.toHaveBeenCalled();
    });

    it('validateScheduleRound accepts valid payload', () => {
        req.body = validCreateBody();
        InterviewValidator.validateScheduleRound(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateUpdate validates patch body with at least one allowed field', () => {
        req.body = { interviewerId: 5 };
        InterviewValidator.validateUpdate(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(req.body.interviewerId).toBe(5);
    });

    it('validateFinalize validates result (title case)', () => {
        req.body = { result: 'Selected', interviewerFeedback: 'ok' };
        InterviewValidator.validateFinalize(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateParams accepts interviewId', () => {
        req.params = { interviewId: '12' };
        InterviewValidator.validateParams(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateQuery validates date range and timezone', () => {
        req.query = {
            startDate: '2025-01-01',
            endDate: '2025-01-31',
            timezone: 'Asia/Kolkata'
        };
        InterviewValidator.validateQuery(req, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(req.validatedQuery).toMatchObject({
            startDate: '2025-01-01',
            endDate: '2025-01-31',
            timezone: 'Asia/Kolkata'
        });
    });

    it('validateInterviewerDailyQuery', () => {
        req.query = { date: '2025-01-01', timezone: 'Etc/UTC' };
        InterviewValidator.validateInterviewerDailyQuery(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateDailyQuery', () => {
        req.query = { date: '2025-01-01', timezone: 'Etc/UTC' };
        InterviewValidator.validateDailyQuery(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateTrackerQuery with today filter', () => {
        req.query = { filter: 'today', timezone: 'Etc/UTC' };
        InterviewValidator.validateTrackerQuery(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it('validateInterviewerWorkloadQuery with today filter', () => {
        req.query = { filter: 'today', timezone: 'Etc/UTC' };
        InterviewValidator.validateInterviewerWorkloadQuery(req, res, next);
        expect(next).toHaveBeenCalledWith();
    });
});
