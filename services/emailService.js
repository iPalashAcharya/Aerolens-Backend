const nodemailer = require('nodemailer');
const { DateTime, IANAZone } = require('luxon');

const normalizeEnvValue = (value) => String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

/** Strip markdown mailto links or mailto: prefix from pasted addresses */
function normalizeEmailInput(raw) {
    if (raw == null) return '';
    let s = String(raw).trim();
    const md = /^\[([^\]]*)\]\(\s*mailto:([^)]+)\s*\)$/i.exec(s);
    if (md) return md[2].trim();
    if (s.toLowerCase().startsWith('mailto:')) return s.slice(7).trim();
    return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
    return typeof email === 'string' && EMAIL_RE.test(email);
}

function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * `interview.fromTimeUTC` is stored as UTC. With mysql2 `dateStrings: true`, values arrive as
 * `yyyy-MM-dd HH:mm:ss` with NO offset — they must be parsed as UTC, not server-local (new Date()).
 */
function parseInterviewUtcInstant(dateTime) {
    if (dateTime == null || dateTime === '') {
        throw new Error('dateTime is required');
    }

    if (dateTime instanceof Date) {
        if (Number.isNaN(dateTime.getTime())) {
            throw new Error('Invalid Date object for interview email');
        }
        return DateTime.fromJSDate(dateTime, { zone: 'utc' });
    }

    if (typeof dateTime === 'number') {
        const dt = DateTime.fromMillis(dateTime, { zone: 'utc' });
        if (!dt.isValid) throw new Error('Invalid numeric timestamp for interview email');
        return dt;
    }

    const raw = String(dateTime).trim();
    // MySQL DATETIME / dateStrings (no timezone) — wall clock is UTC
    const mysqlUtcPattern = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d{1,6})?$/;
    if (mysqlUtcPattern.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
        const normalized = raw.replace('T', ' ').replace(/\.\d{1,6}$/, '');
        let dt = DateTime.fromSQL(normalized, { zone: 'utc' });
        if (!dt.isValid) {
            dt = DateTime.fromFormat(normalized, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' });
        }
        if (!dt.isValid) {
            throw new Error(`Invalid MySQL UTC datetime for interview email: ${raw}`);
        }
        return dt;
    }

    const isoLike = raw.replace(' ', 'T');
    const dt = DateTime.fromISO(isoLike, { setZone: true });
    if (!dt.isValid) {
        throw new Error(`Invalid ISO datetime for interview email: ${raw}`);
    }
    return dt.toUTC();
}

function resolveEventDisplayZone(eventTimezone) {
    const z = eventTimezone && String(eventTimezone).trim();
    if (z && IANAZone.isValidZone(z)) {
        return z;
    }
    if (z) {
        console.warn(`[INTERVIEW EMAIL] Invalid eventTimezone "${z}", using UTC for display`);
    }
    return 'UTC';
}

/**
 * @param {Date|string|number} dateTime - UTC instant (DB fromTimeUTC or ISO)
 * @param {string} [eventTimezone] - IANA zone for display (must match interview scheduling intent)
 * @returns {{ formattedDate: string, formattedTime: string }}
 */
function formatInterviewDateTime(dateTime, eventTimezone = 'UTC') {
    const dtUtc = parseInterviewUtcInstant(dateTime);
    const displayZone = resolveEventDisplayZone(eventTimezone);
    const zoned = dtUtc.setZone(displayZone);
    return {
        formattedDate: zoned.toFormat('dd MMMM yyyy'),
        formattedTime: zoned.toFormat('h:mm a')
    };
}

/**
 * Validates and normalizes interview email payload.
 * Recruiter email/phone are kept on the object for internal use but never appear in the body.
 */
function validateInterviewEmailPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Interview email payload is required');
    }

    const {
        candidateName,
        role,
        round,
        location,
        dateTime,
        toEmail,
        ccEmails,
        recruiter,
        eventTimezone
    } = payload;

    const missing = [];
    if (!candidateName) missing.push('candidateName');
    if (!role) missing.push('role');
    if (!round) missing.push('round');
    if (!location) missing.push('location');
    if (dateTime == null || dateTime === '') missing.push('dateTime');

    const primary = normalizeEmailInput(toEmail);
    if (!primary || !isValidEmail(primary)) missing.push('toEmail');

    if (missing.length) {
        throw new Error(`Missing or invalid interview email fields: ${missing.join(', ')}`);
    }

    const rawCc = Array.isArray(ccEmails) ? ccEmails : [];
    const ccNormalized = [...new Set(
        rawCc
            .map((e) => normalizeEmailInput(e))
            .filter((e) => e && isValidEmail(e))
            .map((e) => e.toLowerCase())
    )].filter((e) => e !== primary.toLowerCase());

    const rec = recruiter && typeof recruiter === 'object' ? recruiter : {};
    const recruiterBlock = {
        name: rec.name != null ? String(rec.name) : '',
        designation: rec.designation != null ? String(rec.designation) : '',
        email: normalizeEmailInput(rec.email),
        phone: rec.phone != null ? String(rec.phone) : ''
    };

    return {
        candidateName: String(candidateName),
        role: String(role),
        round: String(round),
        location: String(location),
        dateTime,
        toEmail: primary,
        ccEmails: ccNormalized,
        recruiter: recruiterBlock,
        eventTimezone: resolveEventDisplayZone(eventTimezone)
    };
}

function buildInterviewSubject(validated) {
    return `${validated.candidateName} - ${validated.role} - ${validated.round} - ${validated.location}`;
}

/**
 * Plain text body — recruiter contact lines use xxxxx only (never real email/phone).
 */
function buildInterviewEmailText(validated, { formattedDate, formattedTime }) {
    const sigName = validated.recruiter.name || '';
    const sigDesig = validated.recruiter.designation || '';

    return [
        `Hello ${validated.candidateName},`,
        '',
        `I hope this email finds you well. I have scheduled your First round of Video interview for the position of ${validated.role} on ${formattedDate} at ${formattedTime}.`,
        '',
        'Instructions for Candidate:',
        '• Ready to showcase your coding skills',
        '• Please join the interview 5-10 minutes early to ensure there are no technical issues.',
        '• A laptop or desktop with a stable internet connection is required (mobile devices are not allowed).',
        "• The candidate's camera must be turned on during the interview.",
        '',
        'Thank you, and feel free to reach out to me at xxxxx or xxxxx if you have any questions.',
        '',
        '---',
        '',
        'Microsoft Teams meeting',
        'Join: https://teams.microsoft.com/meetBc',
        'Meeting ID: 427 85',
        'Passcode: cccccccccccccccss',
        '',
        sigName,
        sigDesig
    ].join('\n');
}

function buildInterviewEmailHtml(validated, { formattedDate, formattedTime }) {
    const cn = escapeHtml(validated.candidateName);
    const rl = escapeHtml(validated.role);
    const fd = escapeHtml(formattedDate);
    const ft = escapeHtml(formattedTime);
    const sigName = escapeHtml(validated.recruiter.name || '');
    const sigDesig = escapeHtml(validated.recruiter.designation || '');

    return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b;">
<p>Hello ${cn},</p>
<p>I hope this email finds you well. I have scheduled your First round of Video interview for the position of <strong>${rl}</strong> on <strong>${fd}</strong> at <strong>${ft}</strong>.</p>
<p><strong>Instructions for Candidate:</strong></p>
<ul>
<li>Ready to showcase your coding skills</li>
<li>Please join the interview 5-10 minutes early to ensure there are no technical issues.</li>
<li>A laptop or desktop with a stable internet connection is required (mobile devices are not allowed).</li>
<li>The candidate's camera must be turned on during the interview.</li>
</ul>
<p>Thank you, and feel free to reach out to me at xxxxx or xxxxx if you have any questions.</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0;" />
<p><strong>Microsoft Teams meeting</strong><br/>
Join: <a href="https://teams.microsoft.com/meetBc">https://teams.microsoft.com/meetBc</a><br/>
Meeting ID: 427 85<br/>
Passcode: cccccccccccccccss</p>
<p>${sigName}<br/>${sigDesig}</p>
</body></html>`;
}

/**
 * Builds everything needed to send the interview email (SMTP now, Microsoft Graph later).
 * @returns {{ to: string, cc: string[], subject: string, html: string, text: string }}
 */
function buildInterviewEmailDispatchPayload(payload) {
    const validated = validateInterviewEmailPayload(payload);
    const { formattedDate, formattedTime } = formatInterviewDateTime(
        validated.dateTime,
        validated.eventTimezone
    );
    const subject = buildInterviewSubject(validated);
    const text = buildInterviewEmailText(validated, { formattedDate, formattedTime });
    const html = buildInterviewEmailHtml(validated, { formattedDate, formattedTime });

    return {
        to: validated.toEmail,
        cc: validated.ccEmails,
        subject,
        html,
        text
    };
}

function createTransporter() {
    const EMAIL_USER = normalizeEnvValue(process.env.EMAIL_USER).toLowerCase();
    const EMAIL_PASS = normalizeEnvValue(process.env.EMAIL_PASS).replace(/\s+/g, '');

    if (!EMAIL_USER || !EMAIL_PASS) {
        throw new Error('EMAIL_USER and EMAIL_PASS must be set in environment variables');
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });
}

async function sendMailViaSmtp({ to, cc, subject, html, text }) {
    const transporter = createTransporter();
    const fromEmail = normalizeEnvValue(process.env.EMAIL_USER).toLowerCase();

    const mail = {
        from: fromEmail,
        to,
        subject,
        text,
        html
    };
    if (cc && cc.length > 0) {
        mail.cc = cc;
    }

    return transporter.sendMail(mail);
}

/**
 * Sends interview invitation: candidate as To, interviewers + recruiter in CC.
 * Template never includes recruiter real email or phone (only xxxxx in body).
 */
const sendInterviewEmail = async (payload) => {
    try {
        const dispatch = buildInterviewEmailDispatchPayload(payload);
        const info = await sendMailViaSmtp(dispatch);

        console.log(
            `[INTERVIEW EMAIL] Sent OK messageId=${info.messageId} to=${dispatch.to} ccCount=${dispatch.cc.length} subject="${dispatch.subject}"`
        );
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        if (String(error.message).includes('Invalid login')) {
            console.error(
                '[INTERVIEW EMAIL] Failed: Invalid login. For Gmail, use EMAIL_USER as the Gmail address and EMAIL_PASS as a 16-character Google App Password.'
            );
        } else {
            console.error('[INTERVIEW EMAIL] Failed:', error.message);
        }
        throw error;
    }
};

module.exports = {
    sendInterviewEmail,
    buildInterviewEmailDispatchPayload,
    validateInterviewEmailPayload,
    formatInterviewDateTime,
    parseInterviewUtcInstant,
    resolveEventDisplayZone,
    normalizeEmailInput
};
