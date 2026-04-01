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
// customMessage helpers
// ---------------------------------------------------------------------------
function normalizeCustomMessage(customMessage) {
    if (typeof customMessage !== 'string') {
        return ' ';
    }
    const trimmed = customMessage.trim();
    return trimmed !== '' ? trimmed : ' ';
}

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

// ---------------------------------------------------------------------------
// Send single WhatsApp message
// ---------------------------------------------------------------------------
async function sendWhatsApp(to, dynamicText, customMessage, fileUrl) {
    validateCustomMessage(customMessage);

    const sanitizedTo = sanitizePhoneNumber(to);

    const parameters = [
        { type: 'text', text: dynamicText },
        { type: 'text', text: normalizeCustomMessage(customMessage) }
    ];

    const payload = {
        messaging_product: 'whatsapp',
        to: sanitizedTo,
        type: 'template',
        template: {
            name: 'candidate_resume_v2',
            language: { code: 'en' },
            components: [
                {
                    type: 'body',
                    parameters
                },
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
                }
            ]
        }
    };

    console.log('[WA SEND] Outbound request', {
        to: sanitizedTo,
        template: 'candidate_resume_v2',
        phoneNumberId: waConfig.phoneNumberId,
        apiBaseUrl: waConfig.apiBaseUrl,
        hasToken: !!waConfig.accessToken,
        fileUrl
    });

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
async function sendToGroup(recipients, dynamicText, customMessage, fileUrl) {
    const results = [];

    for (const recipient of recipients) {
        const rawPhone = recipient.phone_number;
        console.log('[WA SEND GROUP] Sending to member', {
            memberId: recipient.member_id,
            rawPhone
        });

        try {
            const apiResponse = await sendWhatsApp(
                rawPhone,
                dynamicText,
                customMessage,
                fileUrl
            );

            results.push({
                memberId:      recipient.member_id,
                phone:         rawPhone,
                status:        'SUCCESS',
                metaMessageId: apiResponse?.messages?.[0]?.id || null
            });
        } catch (error) {
            const metaError = error.response?.data
                ? JSON.stringify(error.response.data)
                : error.message;

            console.error('[WA SEND GROUP] Failed for member', {
                memberId:     recipient.member_id,
                rawPhone,
                metaStatus:   error.response?.status,
                metaResponse: error.response?.data,
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
    sendToGroup
};
