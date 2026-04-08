/**
 * E.164 validation for member contact (WhatsApp / Meta Cloud API).
 * Regex is a fast pre-filter; libphonenumber-js is the source of truth for validity.
 */

const { parsePhoneNumber } = require('libphonenumber-js/max');
const AppError = require('./appError');

/** ITU E.164: + followed by 1–15 digits, first digit after + is 1–9. */
const E164_STRICT_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * @param {string|null|undefined} value
 * @returns {{ valid: true, e164: string } | { valid: false, error: string }}
 */
function validatePhoneE164(value) {
    if (value == null || typeof value !== 'string') {
        return { valid: false, error: 'Phone number is required' };
    }
    const trimmed = value.trim();
    if (trimmed === '') {
        return { valid: false, error: 'Phone number is required' };
    }
    if (!E164_STRICT_REGEX.test(trimmed)) {
        return {
            valid: false,
            error: 'Phone must be in E.164 format (e.g. +919876543210 or +12025550123)'
        };
    }
    try {
        const pn = parsePhoneNumber(trimmed);
        if (!pn || !pn.isValid()) {
            return { valid: false, error: 'Phone number is not a valid E.164 number' };
        }
        return { valid: true, e164: pn.number };
    } catch {
        return { valid: false, error: 'Phone number could not be parsed' };
    }
}

/**
 * Express middleware: validate req.body[fieldName] when present and non-empty.
 * Normalizes to E.164 on success.
 *
 * @example
 * router.post('/x', validateBodyPhoneE164('memberContact'), handler);
 */
function validateBodyPhoneE164(fieldName = 'memberContact') {
    return (req, res, next) => {
        try {
            const raw = req.body?.[fieldName];
            if (raw == null || String(raw).trim() === '') {
                return next();
            }
            const r = validatePhoneE164(String(raw).trim());
            if (!r.valid) {
                const err = new AppError(
                    r.error,
                    400,
                    'VALIDATION_ERROR',
                    { validationErrors: [{ field: fieldName, message: r.error }] }
                );
                return next(err);
            }
            req.body[fieldName] = r.e164;
            return next();
        } catch (e) {
            return next(e);
        }
    };
}

module.exports = {
    validatePhoneE164,
    validateBodyPhoneE164,
    E164_STRICT_REGEX
};
