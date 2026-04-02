const express = require('express');
const { listGroups, sendResume } = require('../controllers/whatsappController');

const router = express.Router();

router.get('/groups', listGroups);
router.post('/send-resume', sendResume);

module.exports = router;
