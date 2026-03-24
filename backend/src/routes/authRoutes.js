const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');

// Define auth routes
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.get('/me', authenticate, authController.getMe);
router.post('/push-token', authenticate, authController.registerPushToken);
router.delete('/push-token', authenticate, authController.unregisterPushToken);

module.exports = router;
