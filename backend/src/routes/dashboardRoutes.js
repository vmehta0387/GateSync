const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/summary', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), dashboardController.getDashboardSummary);

module.exports = router;
