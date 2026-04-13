jest.mock('../../repositories/whatsappMessageLogRepository', () =>
    jest.fn().mockImplementation(() => ({
        updateStatusByMetaMessageId: jest.fn().mockResolvedValue(undefined),
    }))
);

const { verifyWebhook, handleWebhook } = require('../../controllers/webhookController');

describe('webhookController', () => {
    describe('verifyWebhook', () => {
        it('returns challenge when token matches', () => {
            const req = {
                query: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': process.env.WA_VERIFY_TOKEN,
                    'hub.challenge': 'abc123',
                },
            };
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

            verifyWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith('abc123');
        });

        it('returns 403 when token mismatches', () => {
            const req = {
                query: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'wrong',
                    'hub.challenge': 'x',
                },
            };
            const res = { sendStatus: jest.fn() };

            verifyWebhook(req, res);

            expect(res.sendStatus).toHaveBeenCalledWith(403);
        });
    });

    describe('handleWebhook', () => {
        it('returns OK and processes statuses', async () => {
            const req = {
                body: {
                    entry: [
                        {
                            changes: [
                                {
                                    value: {
                                        statuses: [{ status: 'delivered', id: 'mid1' }],
                                    },
                                },
                            ],
                        },
                    ],
                },
            };
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
            jest.spyOn(console, 'error').mockImplementation(() => {});

            await handleWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith('OK');
            console.error.mockRestore();
        });
    });
});
