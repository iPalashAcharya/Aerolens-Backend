const DateConverter = require('../../utils/dateConverter');

describe('DateConverter', () => {
    describe('getUTCRangeFromLocalDates', () => {
        it('should return UTC ISO range for valid local dates in Asia/Kolkata', () => {
            const { startUTC, endUTC } = DateConverter.getUTCRangeFromLocalDates(
                '2024-06-15',
                '2024-06-15',
                'Asia/Kolkata'
            );

            expect(startUTC).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(endUTC).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(new Date(endUTC).getTime()).toBeGreaterThanOrEqual(new Date(startUTC).getTime());
        });

        it('should throw when timezone is invalid for the given date', () => {
            expect(() =>
                DateConverter.getUTCRangeFromLocalDates('2024-06-15', '2024-06-15', 'Not/ARealTimezone')
            ).toThrow(/Invalid timezone/);
        });
    });
});
