import { Router } from 'express';
import authRoutes from './authRoutes';
import roomRoutes from './roomRoutes';
import bookingRoutes from './bookingRoutes';
import customerRoutes from './customerRoutes';
import checkoutRoutes from './checkoutRoutes';
import adminRoutes from './adminRoutes';
import inventoryRoutes from './inventoryRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);
router.use('/bookings', bookingRoutes);
router.use('/customers', customerRoutes);
router.use('/stay', checkoutRoutes);
router.use('/admin', adminRoutes);
router.use('/inventory', inventoryRoutes);

export default router;
