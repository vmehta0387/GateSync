const express = require('express');
const router = express.Router();
const publicOnboardingController = require('../controllers/publicOnboardingController');
const publicOnboardingPaymentController = require('../controllers/publicOnboardingPaymentController');

router.post('/society', publicOnboardingController.createSociety);
router.post('/payment/precreate-order', publicOnboardingPaymentController.createPreOrder);
router.post('/payment/preconfirm', publicOnboardingPaymentController.confirmPrePayment);
router.post('/payment/create-order', publicOnboardingPaymentController.createOrder);
router.post('/payment/confirm', publicOnboardingPaymentController.confirmPayment);

module.exports = router;
