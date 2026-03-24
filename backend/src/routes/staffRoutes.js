const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { uploadStaffPhoto, uploadStaffDocument } = require('../middlewares/uploadMiddleware');

router.use(authenticate);

// List staff
router.get('/meta', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), staffController.getStaffMeta);
router.get('/', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD', 'RESIDENT'), staffController.getStaffDirectory);
router.get('/directory', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD', 'RESIDENT'), staffController.getStaffDirectory);
router.get('/logs', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), staffController.getStaffLogs);

// Manage staff
router.post('/upload/photo', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), uploadStaffPhoto.single('file'), staffController.uploadStaffPhoto);
router.post('/upload/document', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), uploadStaffDocument.single('file'), staffController.uploadStaffDocument);
router.post('/', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), staffController.addStaff);
router.post('/:id/enable-guard-login', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), staffController.enableGuardLogin);
router.post('/:id/disable-guard-login', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), staffController.disableGuardLogin);
router.put('/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), staffController.updateStaff);
router.delete('/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), staffController.deleteStaff);

// Staff access logs
router.post('/log-entry', authorize('GUARD', 'ADMIN'), staffController.logStaffEntry);
router.post('/log-exit', authorize('GUARD', 'ADMIN'), staffController.logStaffExit);

module.exports = router;
