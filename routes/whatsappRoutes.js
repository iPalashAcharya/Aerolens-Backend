const express = require('express');
const { sendResume } = require('../controllers/whatsappController');

const router = express.Router();

router.post('/send-resume', sendResume);

module.exports = router;
