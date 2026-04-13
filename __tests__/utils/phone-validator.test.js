const {
    validatePhoneE164,
    validateBodyPhoneE164,
    E164_STRICT_REGEX,
} = require('../../utils/phone-validator');
const AppError = require('../../utils/appError');

describe('phone-validator', () => {
    describe('E164_STRICT_REGEX', () => {
        it('matches valid E.164 samples', () => {
            expect(E164_STRICT_REGEX.test('+919876543210')).toBe(true);
            expect(E164_STRICT_REGEX.test('+12025550123')).toBe(true);
        });
    });

    describe('validatePhoneE164', () => {
        it('rejects null and undefined', () => {
            expect(validatePhoneE164(null)).toEqual({
                valid: false,
                error: 'Phone number is required',
            });
            expect(validatePhoneE164(undefined)).toEqual({
                valid: false,
                error: 'Phone number is required',
            });
        });

        it('rejects non-string types', () => {
            expect(validatePhoneE164(12345).valid).toBe(false);
        });

        it('rejects empty and whitespace-only', () => {
            expect(validatePhoneE164('').valid).toBe(false);
            expect(validatePhoneE164('   ').valid).toBe(false);
        });

        it('rejects invalid format before libphonenumber', () => {
            const r = validatePhoneE164('+0123');
            expect(r.valid).toBe(false);
            expect(r.error).toMatch(/E\.164/);
        });

        it('returns valid with e164 for real E.164 number', () => {
            const r = validatePhoneE164('+12025550123');
            expect(r.valid).toBe(true);
            expect(r.e164).toBeDefined();
        });

        it('rejects syntactically ok but invalid country/number combo via parse', () => {
            const r = validatePhoneE164('+9999999999999');
            expect(r.valid).toBe(false);
        });
    });

    describe('validateBodyPhoneE164', () => {
        const next = jest.fn();
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        beforeEach(() => {
            next.mockClear();
        });

        it('skips when field missing or empty', () => {
            const mw = validateBodyPhoneE164('memberContact');
            mw({ body: {} }, res, next);
            expect(next).toHaveBeenCalledWith();
            mw({ body: { memberContact: '' } }, res, next);
            expect(next).toHaveBeenCalledTimes(2);
        });

        it('normalizes valid phone and calls next', () => {
            const mw = validateBodyPhoneE164('memberContact');
            const req = { body: { memberContact: '+12025550123' } };
            mw(req, res, next);
            expect(next).toHaveBeenCalledWith();
            expect(req.body.memberContact).toMatch(/^\+/);
        });

        it('passes AppError to next on invalid phone', () => {
            const mw = validateBodyPhoneE164('phone');
            mw({ body: { phone: 'not-e164' } }, res, next);
            expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
        });

        it('uses custom field name', () => {
            const mw = validateBodyPhoneE164('x');
            mw({ body: { x: '+12025550123' } }, res, next);
            expect(next).toHaveBeenCalledWith();
        });
    });
});
