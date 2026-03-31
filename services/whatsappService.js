const axios = require('axios');
const waConfig = require('../config/whatsapp');

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

async function sendWhatsApp(to, dynamicText, customMessage, fileUrl) {
    validateCustomMessage(customMessage);

    const parameters = [
        {
            type: 'text',
            text: dynamicText
        },
        {
            type: 'text',
            text: normalizeCustomMessage(customMessage)
        }
    ];

    const payload = {
        messaging_product: 'whatsapp',
        to,
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

    const response = await axios.post(
        `${waConfig.apiBaseUrl}/${waConfig.phoneNumberId}/messages`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${waConfig.accessToken}`,
                'Content-Type': 'application/json'
            }
        }
    );

    return response.data;
}

async function sendToGroup(recipients, dynamicText, customMessage, fileUrl) {
    const results = [];

    for (const recipient of recipients) {
        try {
            const apiResponse = await sendWhatsApp(
                recipient.phone_number,
                dynamicText,
                customMessage,
                fileUrl
            );

            results.push({
                memberId: recipient.member_id,
                phone: recipient.phone_number,
                status: 'SUCCESS',
                metaMessageId: apiResponse?.messages?.[0]?.id || null
            });
        } catch (error) {
            results.push({
                memberId: recipient.member_id,
                phone: recipient.phone_number,
                status: 'FAILED',
                errorMessage: error.response?.data
                    ? JSON.stringify(error.response.data)
                    : error.message
            });
        }
    }

    return results;
}

module.exports = {
    sendWhatsApp,
    sendToGroup
};
