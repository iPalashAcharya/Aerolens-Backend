const AppError = require('./appError');

/** E.164: + then 1–15 digits, first digit after + must be 1–9 */
const E164_STRICT_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * @param {unknown} value
 * @returns {{ valid: true, e164: string } | { valid: false, error: string }}
 */
function validatePhoneE164(value) {
    if (value === null || value === undefined) {
        return { valid: false, error: 'Phone number is required' };
    }
    if (typeof value !== 'string') {
        return { valid: false, error: 'Phone number must be a string' };
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return { valid: false, error: 'Phone number is required' };
    }
    if (!E164_STRICT_REGEX.test(trimmed)) {
        return { valid: false, error: 'Number must be in valid E.164 format' };
    }
    // Reject obviously invalid country codes (e.g. unassigned / test numbers)
    if (/^\+999/.test(trimmed)) {
        return { valid: false, error: 'Invalid phone number' };
    }

    return { valid: true, e164: trimmed };
}

function validateBodyPhoneE164(fieldName) {
    return (req, res, next) => {
        const raw = req.body[fieldName];
        if (raw === undefined || raw === null) {
            return next();
        }
        if (typeof raw === 'string' && raw.trim() === '') {
            return next();
        }
        const result = validatePhoneE164(raw);
        if (!result.valid) {
            return next(new AppError(result.error, 400, 'INVALID_PHONE'));
        }
        req.body[fieldName] = result.e164;
        return next();
    };
}

module.exports = {
    E164_STRICT_REGEX,
    validatePhoneE164,
    validateBodyPhoneE164,
};
