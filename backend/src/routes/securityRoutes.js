const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { uploadSecurityIncidentAttachment } = require('../middlewares/uploadMiddleware');

router.use(authenticate);

router.get('/meta', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), securityController.getSecurityMeta);
router.get('/summary', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.getSecuritySummary);
router.get('/logs', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.getGuardLogs);
router.get('/guard-logs', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.getGuardLogs);

router.post('/activity', authorize('GUARD', 'ADMIN', 'MANAGER'), securityController.logGuardActivity);

router.get('/shifts', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), securityController.getGuardShifts);
router.post('/shifts', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.createGuardShift);
router.put('/shifts/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.updateGuardShift);
router.post('/shifts/:id/start', authorize('GUARD', 'ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.startGuardShift);
router.post('/shifts/:id/end', authorize('GUARD', 'ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.endGuardShift);

router.get('/incidents', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), securityController.getSecurityIncidents);
router.post('/incidents', authorize('GUARD', 'ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.createSecurityIncident);
router.put('/incidents/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), securityController.updateSecurityIncident);
router.post(
    '/upload/incident-attachment',
    authorize('GUARD', 'ADMIN', 'SUPERADMIN', 'MANAGER'),
    uploadSecurityIncidentAttachment.single('file'),
    securityController.uploadIncidentAttachment
);

module.exports = router;
