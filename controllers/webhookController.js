const { verifyToken } = require('../config/whatsapp');
const WhatsappMessageLogRepository = require('../repositories/whatsappMessageLogRepository');

const whatsappMessageLogRepository = new WhatsappMessageLogRepository();

async function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
}

async function handleWebhook(req, res) {
    try {
        const changes = req.body?.entry?.[0]?.changes || [];
        for (const change of changes) {
            const statuses = change?.value?.statuses || [];

            for (const statusItem of statuses) {
                const statusMap = {
                    sent: 'SENT',
                    delivered: 'DELIVERED',
                    read: 'READ',
                    failed: 'FAILED'
                };

                const mappedStatus = statusMap[statusItem.status];
                if (!mappedStatus) {
                    continue;
                }

                const shouldSetDeliveredAt =
                    statusItem.status === 'delivered' || statusItem.status === 'read';

                await whatsappMessageLogRepository.updateStatusByMetaMessageId(
                    mappedStatus,
                    statusItem.id,
                    shouldSetDeliveredAt
                );
            }
        }
    } catch (error) {
        console.error('Webhook processing error:', error.message);
    }

    return res.status(200).send('OK');
}

module.exports = {
    verifyWebhook,
    handleWebhook
};
