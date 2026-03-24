const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/', authorize('ADMIN', 'SUPERADMIN', 'GUARD', 'RESIDENT'), settingsController.getSettings);
router.put('/', authorize('ADMIN', 'SUPERADMIN'), settingsController.updateSettings);
router.get('/managers', authorize('ADMIN', 'SUPERADMIN'), settingsController.getManagers);
router.post('/managers', authorize('ADMIN', 'SUPERADMIN'), settingsController.createManager);
router.put('/managers/:id', authorize('ADMIN', 'SUPERADMIN'), settingsController.updateManager);

module.exports = router;
