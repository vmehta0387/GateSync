const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/', billingController.getInvoices);
router.get('/invoices', billingController.getInvoices);
router.get('/summary', billingController.getBillingSummary);
router.get('/reports', authorize('ADMIN', 'SUPERADMIN'), billingController.getBillingReports);
router.get('/configs', authorize('ADMIN', 'SUPERADMIN'), billingController.getBillingConfigs);

router.post('/:id/pay', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN'), billingController.payInvoice);
router.put('/:id/adjust', authorize('ADMIN', 'SUPERADMIN'), billingController.adjustInvoice);

router.post('/generate', authorize('ADMIN', 'SUPERADMIN'), billingController.generateInvoice);
router.post('/configs', authorize('ADMIN', 'SUPERADMIN'), billingController.saveBillingConfig);
router.put('/configs/:id', authorize('ADMIN', 'SUPERADMIN'), billingController.saveBillingConfig);
router.put('/flats/:id', authorize('ADMIN', 'SUPERADMIN'), billingController.updateFlatBillingMeta);

module.exports = router;
