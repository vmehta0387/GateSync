const express = require('express');
const router = express.Router();
const complaintsController = require('../controllers/complaintsController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { uploadComplaintAttachment } = require('../middlewares/uploadMiddleware');

router.use(authenticate);

router.get('/summary', authorize('ADMIN', 'MANAGER'), complaintsController.getSummary);
router.get('/categories', complaintsController.getCategories);
router.post('/categories', authorize('ADMIN', 'MANAGER'), complaintsController.createCategory);
router.post('/upload/attachment', authorize('RESIDENT', 'ADMIN', 'MANAGER'), uploadComplaintAttachment.single('file'), complaintsController.uploadAttachment);
router.get('/', complaintsController.getComplaints);
router.post('/', authorize('RESIDENT', 'ADMIN', 'MANAGER'), complaintsController.createComplaint);
router.get('/:id', complaintsController.getComplaintDetail);
router.put('/:id', authorize('ADMIN', 'MANAGER'), complaintsController.updateComplaint);
router.post('/:id/assign', authorize('ADMIN', 'MANAGER'), complaintsController.assignComplaint);
router.post('/:id/messages', authorize('RESIDENT', 'ADMIN', 'MANAGER'), complaintsController.addComplaintMessage);

module.exports = router;
