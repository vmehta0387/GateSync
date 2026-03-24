const express = require('express');
const router = express.Router();
const noticesController = require('../controllers/noticesController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

// Admins broadcast notices
router.post('/', authorize('ADMIN'), noticesController.createNotice);

// Everyone can view notices
router.get('/', noticesController.getNotices);

module.exports = router;
