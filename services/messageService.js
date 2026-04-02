// ---------------------------------------------------------------------------
// WhatsApp template body: {{1}}–{{9}} (single-line values; newlines forbidden by Meta)
// ---------------------------------------------------------------------------

function formatAmount(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) {
        return null;
    }
    return Number(n).toLocaleString('en-IN');
}

function symbolFromCurrencyLookup(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    const v = value.trim();
    const upper = v.toUpperCase();
    if (upper === 'INR' || /RUPEE|₹/.test(v)) {
        return '₹';
    }
    if (upper === 'USD' || /DOLLAR|\$/.test(v)) {
        return '$';
    }
    if (upper === 'EUR' || /EURO|€/.test(v)) {
        return '€';
    }
    if (upper === 'GBP' || /POUND|£/.test(v)) {
        return '£';
    }
    return v;
}

function formatCtcLine({ amount, currencyLookupValue, typeLookupValue, legacyAmount }) {
    const hasFull =
        amount != null &&
        amount !== '' &&
        currencyLookupValue &&
        typeLookupValue;

    if (hasFull) {
        const sym = symbolFromCurrencyLookup(currencyLookupValue);
        const amt = formatAmount(amount);
        return `${sym} ${amt} ${typeLookupValue}`.trim();
    }

    if (legacyAmount != null && legacyAmount !== '') {
        const amt = formatAmount(legacyAmount);
        return `₹ ${amt} Annual`;
    }

    return 'N/A';
}

function formatNoticePeriod(np) {
    if (np === null || np === undefined || np === '') {
        return 'N/A';
    }
    if (typeof np === 'number') {
        return `${np} days`;
    }
    const s = String(np).trim();
    return s || 'N/A';
}

function formatExperienceYears(yoe) {
    if (yoe === null || yoe === undefined || yoe === '') {
        return 'N/A';
    }
    const num = Number(yoe);
    if (!Number.isFinite(num)) {
        return 'N/A';
    }
    // WhatsApp display only: avoid "2.20 years" — trim trailing zeros after the decimal (10 stays 10).
    const rounded = Math.round(num * 100) / 100;
    const abs = Math.abs(rounded);
    const sign = rounded < 0 ? '-' : '';
    const [w, frac = ''] = abs.toFixed(2).split('.');
    if (frac === '00') {
        return `${sign}${w} years`;
    }
    const fracTrimmed = frac.replace(/0+$/, '');
    return `${sign}${w}.${fracTrimmed} years`;
}

function normalizeCustomMessageForParam9(customMessage) {
    if (customMessage === undefined || customMessage === null) {
        return ' ';
    }
    const trimmed = String(customMessage).trim();
    return trimmed !== '' ? trimmed : ' ';
}

/**
 * Builds the nine body parameters for the approved WhatsApp template (order matters).
 * @param {object} candidate — row from whatsappCandidateService.getCandidate
 * @param {string|undefined|null} customMessage — FE optional note (maps to {{9}})
 */
function buildWhatsappTemplateBodyParams(candidate, customMessage) {
    const fullName = candidate.name || 'N/A';
    const contact = candidate.contactNumber || 'N/A';
    const email = candidate.email || 'N/A';
    const linkedin = candidate.linkedinUrl || 'N/A';
    const yoe = formatExperienceYears(candidate.yoe);
    const currentCtc = formatCtcLine({
        amount: candidate.currentCTCAmount,
        currencyLookupValue: candidate.currentCurrencyValue,
        typeLookupValue: candidate.currentCompensationTypeValue,
        legacyAmount: candidate.currentCTC
    });
    const expectedCtc = formatCtcLine({
        amount: candidate.expectedCTCAmount,
        currencyLookupValue: candidate.expectedCurrencyValue,
        typeLookupValue: candidate.expectedCompensationTypeValue,
        legacyAmount: candidate.expectedCTC
    });
    const notice = formatNoticePeriod(candidate.noticePeriod);
    const additional = normalizeCustomMessageForParam9(customMessage);

    return [
        fullName,
        contact,
        email,
        linkedin,
        yoe,
        currentCtc,
        expectedCtc,
        notice,
        additional
    ];
}

module.exports = {
    buildWhatsappTemplateBodyParams
};
