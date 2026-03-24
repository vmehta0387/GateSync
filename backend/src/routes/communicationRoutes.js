const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { uploadCommunicationAttachment } = require('../middlewares/uploadMiddleware');

router.use(authenticate);

router.get('/hub', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.getHubOverview);
router.get('/targets', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.getTargets);
router.get('/messages', communicationController.getMessages);
router.post('/messages', communicationController.sendMessage);
router.get('/messages/thread/:userId', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.getThreadMessages);
router.get('/notices', communicationController.getNotices);
router.post('/notices', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.sendBroadcast);
router.post('/send', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.sendBroadcast);
router.get('/polls', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.getPolls);
router.post('/polls', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.createPoll);
router.get('/events', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.getEvents);
router.post('/events', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.createEvent);
router.get('/documents', communicationController.getDocuments);
router.post('/documents', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), communicationController.createDocument);
router.patch('/messages/:id/read', communicationController.markAsRead);
router.post('/emergency', authorize('ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), communicationController.sendEmergencyAlert);
router.post('/upload/attachment', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), uploadCommunicationAttachment.single('file'), communicationController.uploadAttachment);

module.exports = router;
