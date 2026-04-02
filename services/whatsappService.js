const axios = require('axios');
const waConfig = require('../config/whatsapp');

// ---------------------------------------------------------------------------
// Phone number sanitization
// Meta WhatsApp API requires E.164 without the leading '+':
//   +91-9876543210  →  919876543210
//   +91 9999999999  →  919999999999
//   9876543210      →  9876543210  (passed as-is if already digits only)
// ---------------------------------------------------------------------------
function sanitizePhoneNumber(raw) {
    if (!raw || typeof raw !== 'string') {
        throw new Error(`Invalid phone number: ${raw}`);
    }

    // Strip everything except digits
    const digits = raw.replace(/\D/g, '');

    if (digits.length < 7 || digits.length > 15) {
        throw new Error(
            `Phone number out of valid range (7-15 digits) after sanitization: "${raw}" → "${digits}"`
        );
    }

    return digits;
}

// ---------------------------------------------------------------------------
// customMessage helpers ({{9}} — validated before template body is built)
// ---------------------------------------------------------------------------
function validateCustomMessage(customMessage) {
    if (customMessage === undefined || customMessage === null) {
        return;
    }
    if (typeof customMessage !== 'string') {
        throw new Error('customMessage must be plain text');
    }
    const trimmed = customMessage.trim();
    if (trimmed.length > 1024) {
        throw new Error('customMessage max length is 1024 characters');
    }
    if (/<[^>]*>/.test(trimmed)) {
        throw new Error('customMessage must be plain text only');
    }
}

function normalizeTemplateText(value) {
    if (value === undefined || value === null) {
        return ' ';
    }
    // Meta template params reject newlines/tabs and long space runs.
    const text = String(value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/ {5,}/g, '    ')
        .trim();
    return text.length > 0 ? text : ' ';
}

const EXPECTED_BODY_PARAM_COUNT = 9;

// ---------------------------------------------------------------------------
// Send single WhatsApp message
// ---------------------------------------------------------------------------
async function sendWhatsApp(to, bodyParams, fileUrl) {
    if (!Array.isArray(bodyParams) || bodyParams.length !== EXPECTED_BODY_PARAM_COUNT) {
        throw new Error(
            `WhatsApp template body must have ${EXPECTED_BODY_PARAM_COUNT} parameters, got ${bodyParams?.length}`
        );
    }

    const sanitizedTo = sanitizePhoneNumber(to);
    const bodyParameters = bodyParams.map((p) => ({
        type: 'text',
        text: normalizeTemplateText(p)
    }));

    const payload = {
        messaging_product: 'whatsapp',
        to: sanitizedTo,
        type: 'template',
        template: {
            name: waConfig.templateName,
            language: { code: waConfig.templateLanguageCode },
            components: [
                // Keep component order deterministic (header first, then body)
                {
                    type: 'header',
                    parameters: [
                        {
                            type: 'document',
                            document: {
                                link: fileUrl,
                                filename: 'Resume.pdf'
                            }
                        }
                    ]
                },
                {
                    type: 'body',
                    parameters: bodyParameters
                }
            ]
        }
    };

    console.log('[WA SEND] Outbound request', {
        to: sanitizedTo,
        template: waConfig.templateName,
        language: waConfig.templateLanguageCode,
        phoneNumberId: waConfig.phoneNumberId,
        apiBaseUrl: waConfig.apiBaseUrl,
        hasToken: !!waConfig.accessToken,
        fileUrl,
        bodyParamLengths: bodyParameters.map((p) => (p?.text || '').length)
    });
    console.log('[WA SEND] Outbound components', JSON.stringify(payload.template.components));

    const response = await axios.post(
        `${waConfig.apiBaseUrl}/${waConfig.phoneNumberId}/messages`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${waConfig.accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        }
    );

    console.log('[WA SEND] Meta API response', {
        to: sanitizedTo,
        status: response.status,
        messageId: response.data?.messages?.[0]?.id
    });

    return response.data;
}

// ---------------------------------------------------------------------------
// Send to all recipients; never throws — per-recipient errors are captured
// ---------------------------------------------------------------------------
async function sendToGroup(recipients, bodyParams, fileUrl) {
    const results = [];

    for (const recipient of recipients) {
        const rawPhone = recipient.phone_number;
        console.log('[WA SEND GROUP] Sending to member', {
            memberId: recipient.member_id,
            rawPhone
        });

        try {
            const apiResponse = await sendWhatsApp(rawPhone, bodyParams, fileUrl);

            results.push({
                memberId:      recipient.member_id,
                phone:         rawPhone,
                status:        'SUCCESS',
                metaMessageId: apiResponse?.messages?.[0]?.id || null
            });
        } catch (error) {
            const metaErrorPayload = error.response?.data || null;
            const metaError = metaErrorPayload
                ? JSON.stringify(metaErrorPayload)
                : error.message;
            const metaErrorDetails = metaErrorPayload?.error?.error_data?.details || null;

            console.error('[WA SEND GROUP] Failed for member', {
                memberId:     recipient.member_id,
                rawPhone,
                metaStatus:   error.response?.status,
                metaResponse: metaErrorPayload,
                metaErrorDetails,
                error:        error.message
            });

            results.push({
                memberId:     recipient.member_id,
                phone:        rawPhone,
                status:       'FAILED',
                metaMessageId: null,
                errorMessage: metaError
            });
        }
    }

    return results;
}

module.exports = {
    sendWhatsApp,
    sendToGroup,
    validateCustomMessage
};
