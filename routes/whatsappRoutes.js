const express = require('express');
const { listGroups, sendResume, getShareLog } = require('../controllers/whatsappController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/groups', listGroups);
router.post('/send-resume', sendResume);
router.get('/shares/:queueId', getShareLog);

module.exports = router;
