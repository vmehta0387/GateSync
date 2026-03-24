const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadminController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// All routes require SUPERADMIN
router.use(authenticate, authorize('SUPERADMIN'));

router.get('/stats', superadminController.getPlatformStats);
router.get('/societies', superadminController.getSocieties);
router.get('/societies/:id', superadminController.getSocietyById);
router.post('/societies', superadminController.onboardSociety);
router.put('/societies/:id', superadminController.updateSociety);
router.post('/societies/:id/flats/generate', superadminController.generateFlats);
router.put('/societies/:id/status', superadminController.updateSocietyStatus);

module.exports = router;
