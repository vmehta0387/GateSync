const express = require('express');
const router = express.Router();
const facilityController = require('../controllers/facilityController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/', facilityController.getFacilities);
router.get('/summary', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.getFacilitySummary);
router.get('/availability', facilityController.getAvailability);
router.get('/bookings', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), facilityController.getBookings);
router.get('/maintenance', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER', 'GUARD'), facilityController.getMaintenanceBlocks);

router.post('/', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.createFacility);
router.put('/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.updateFacility);

router.post('/bookings', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.createBooking);
router.put('/bookings/:id', authorize('RESIDENT', 'ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.updateBookingStatus);

router.post('/maintenance', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.createMaintenanceBlock);
router.delete('/maintenance/:id', authorize('ADMIN', 'SUPERADMIN', 'MANAGER'), facilityController.deleteMaintenanceBlock);

module.exports = router;
