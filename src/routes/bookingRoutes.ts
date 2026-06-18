import { Router } from 'express';
import { BookingController } from '../controllers/bookingController';
import { authenticate, checkPermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/constants';

const router = Router();

router.use(authenticate);

router.get('/', checkPermission(PERMISSIONS.BOOKINGS_READ), BookingController.getAll);
router.get('/:id', checkPermission(PERMISSIONS.BOOKINGS_READ), BookingController.getById);
router.post('/', checkPermission(PERMISSIONS.BOOKINGS_CREATE), BookingController.create);
router.put('/:id', checkPermission(PERMISSIONS.BOOKINGS_UPDATE), BookingController.update);
router.patch('/:id/cancel', checkPermission(PERMISSIONS.BOOKINGS_CANCEL), BookingController.cancel);

export default router;
