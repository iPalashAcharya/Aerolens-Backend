const express = require('express');
const {
    verifyWebhook,
    handleWebhook
} = require('../controllers/webhookController');

const router = express.Router();

router.get('/whatsapp', verifyWebhook);
router.post('/whatsapp', handleWebhook);

module.exports = router;
