const express = require('express');
const router = express.Router();
const visitorController = require('../controllers/visitorController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { uploadVisitorPhoto } = require('../middlewares/uploadMiddleware');

router.post('/public-decision', visitorController.publicDecision);
router.all('/masked-call/bridge', visitorController.maskedCallBridge);

router.use(authenticate);

// All authenticated roles can see logs (filtered by role inside controller)
router.get('/logs', visitorController.getLogs);
router.get('/pending', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), visitorController.getPendingApprovals);
router.get('/rules', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), visitorController.getRules);

// Only Residents (or Admins acting on behalf) can pre-approve
router.post('/pre-approve', authorize('RESIDENT', 'ADMIN', 'MANAGER'), visitorController.preApproveVisitor);
router.post('/walk-in', authorize('GUARD', 'ADMIN', 'MANAGER'), visitorController.createWalkInVisitor);
router.post('/approve/:id', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), visitorController.approveVisitor);
router.post('/deny/:id', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), visitorController.denyVisitor);
router.post('/call-resident', authorize('GUARD', 'ADMIN', 'MANAGER'), visitorController.initiateMaskedResidentCall);

// Only Guards (or Admins) can check-in/out
router.post('/check-in', authorize('GUARD', 'ADMIN', 'MANAGER'), visitorController.checkInVisitor);
router.post('/check-out', authorize('GUARD', 'ADMIN', 'MANAGER'), visitorController.checkOutVisitor);
router.post('/upload/photo', authorize('GUARD', 'ADMIN', 'MANAGER'), uploadVisitorPhoto.single('file'), visitorController.uploadVisitorPhoto);

// Admin routes for updating visitor rules (VIP/Blacklist)
router.post('/status', authorize('ADMIN', 'SUPERADMIN'), visitorController.setVisitorStatus);
router.put('/rules', authorize('ADMIN', 'SUPERADMIN'), visitorController.updateRules);

module.exports = router;
