jest.mock('axios', () => ({
    post: jest.fn(),
}));

jest.mock('../../config/whatsapp', () => ({
    accessToken: 'tok',
    phoneNumberId: 'pid',
    templateName: 't',
    templateLanguageCode: 'en',
    apiBaseUrl: 'https://graph.test/v0',
}));

const axios = require('axios');
const {
    sendWhatsApp,
    sendToGroup,
    validateCustomMessage,
} = require('../../services/whatsappService');

describe('whatsappService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.log.mockRestore();
        console.error.mockRestore();
    });

    describe('validateCustomMessage', () => {
        it('allows undefined/null', () => {
            expect(() => validateCustomMessage(undefined)).not.toThrow();
            expect(() => validateCustomMessage(null)).not.toThrow();
        });

        it('rejects non-string', () => {
            expect(() => validateCustomMessage(1)).toThrow('plain text');
        });

        it('rejects HTML', () => {
            expect(() => validateCustomMessage('<b>x</b>')).toThrow('plain text only');
        });
    });

    describe('sendWhatsApp', () => {
        const nine = Array.from({ length: 9 }, (_, i) => `p${i}`);

        it('throws when body params length is wrong', async () => {
            await expect(sendWhatsApp('+919876543210', ['a'], 'https://f')).rejects.toThrow(/9 parameters/);
        });

        it('posts to Meta API', async () => {
            axios.post.mockResolvedValue({ status: 200, data: { messages: [{ id: 'mid' }] } });

            const data = await sendWhatsApp('+919876543210', nine, 'https://file.example/r.pdf');

            expect(axios.post).toHaveBeenCalled();
            expect(data.messages[0].id).toBe('mid');
        });
    });

    describe('sendToGroup', () => {
        const nine = Array.from({ length: 9 }, (_, i) => `p${i}`);

        it('aggregates success and failure per recipient', async () => {
            axios.post
                .mockResolvedValueOnce({ data: { messages: [{ id: 'a' }] } })
                .mockRejectedValueOnce({ message: 'fail', response: { status: 400, data: { error: {} } } });

            const results = await sendToGroup(
                [
                    { member_id: 1, phone_number: '+919811111111' },
                    { member_id: 2, phone_number: '+919822222222' },
                ],
                nine,
                'https://x'
            );

            expect(results[0].status).toBe('SUCCESS');
            expect(results[1].status).toBe('FAILED');
        });
    });
});
