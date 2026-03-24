const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

// List residents
router.get('/', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.getResidents);
router.get('/me/flats', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.getMyFlats);
router.get('/me/important-contacts', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.getImportantContacts);

// Manage residents
router.get('/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.getResidentById);
router.post('/', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.addResident);
router.put('/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.updateResident);
router.post('/:id/remove', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), residentController.removeResidentMapping);

module.exports = router;
