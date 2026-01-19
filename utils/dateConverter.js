const { DateTime } = require('luxon');

class DateConverter {
    /**
     * Converts local date range to UTC timestamps
     * @param {string} startDate - Date in YYYY-MM-DD format
     * @param {string} endDate - Date in YYYY-MM-DD format
     * @param {string} timezone - IANA timezone (e.g., 'Asia/Kolkata')
     * @returns {Object} - { startUTC, endUTC } as ISO strings
     */
    static getUTCRangeFromLocalDates(startDate, endDate, timezone) {
        // Start of day in user's timezone (00:00:00)
        const startLocal = DateTime.fromISO(startDate, { zone: timezone })
            .startOf('day');

        // End of day in user's timezone (23:59:59.999)
        const endLocal = DateTime.fromISO(endDate, { zone: timezone })
            .endOf('day');

        // Check if timezone is valid
        if (!startLocal.isValid) {
            throw new Error(`Invalid timezone: ${timezone}`);
        }

        return {
            startUTC: startLocal.toUTC().toISO(),
            endUTC: endLocal.toUTC().toISO()
        };
    }
}

module.exports = DateConverter;