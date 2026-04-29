const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate } = require('../middlewares/authMiddleware');

router.get('/plans', subscriptionController.getPlans);

router.use(authenticate);
router.get('/me', subscriptionController.getMySubscription);
router.post('/create-order', subscriptionController.createOrder);
router.post('/confirm-payment', subscriptionController.confirmPayment);

module.exports = router;
