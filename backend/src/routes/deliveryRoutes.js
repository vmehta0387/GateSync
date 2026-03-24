const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/', deliveryController.getDeliveries);
router.post('/', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'GUARD'), deliveryController.createDelivery);
router.patch('/:id/status', authorize('GUARD', 'ADMIN', 'SUPERADMIN'), deliveryController.updateDeliveryStatus);

module.exports = router;
