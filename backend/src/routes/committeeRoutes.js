const express = require('express');
const committeeController = require('../controllers/committeeController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.get('/templates', authorize('ADMIN', 'SUPERADMIN'), committeeController.getTemplates);
router.get('/public', committeeController.getPublicDirectory);
router.get('/', authorize('ADMIN', 'SUPERADMIN'), committeeController.getCommittees);
router.post('/', authorize('ADMIN', 'SUPERADMIN'), committeeController.createCommittee);
router.get('/:id', authorize('ADMIN', 'SUPERADMIN'), committeeController.getCommitteeDetail);
router.put('/:id', authorize('ADMIN', 'SUPERADMIN'), committeeController.updateCommittee);
router.get('/:id/messages', authorize('ADMIN', 'SUPERADMIN'), committeeController.getCommitteeMessages);
router.post('/:id/messages', authorize('ADMIN', 'SUPERADMIN'), committeeController.sendCommitteeMessage);
router.post('/:id/tasks', authorize('ADMIN', 'SUPERADMIN'), committeeController.createCommitteeTask);
router.patch('/tasks/:taskId', authorize('ADMIN', 'SUPERADMIN'), committeeController.updateCommitteeTask);
router.post('/:id/votes', authorize('ADMIN', 'SUPERADMIN'), committeeController.createCommitteeVote);
router.post('/votes/:voteId/respond', committeeController.respondToCommitteeVote);
router.post('/:id/documents', authorize('ADMIN', 'SUPERADMIN'), committeeController.createCommitteeDocument);

module.exports = router;
