import { Router } from 'express';
import { CheckoutController } from '../controllers/checkoutController';
import { authenticate, checkPermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/constants';

const router = Router();

router.use(authenticate);

// Check-ins
router.get('/checkins', CheckoutController.getActiveCheckIns);
router.post('/checkin/walkin', checkPermission(PERMISSIONS.CHECKINS_CREATE), CheckoutController.checkInWalkIn);
router.post('/checkin/booking', checkPermission(PERMISSIONS.CHECKINS_CREATE), CheckoutController.checkInBooking);
router.post('/checkin/previous', checkPermission(PERMISSIONS.CHECKINS_CREATE), CheckoutController.addPreviousStay);

// Check-outs
router.get('/checkout/preview/:checkInId', checkPermission(PERMISSIONS.CHECKOUTS_CREATE), CheckoutController.previewBill);
router.post('/checkout', checkPermission(PERMISSIONS.CHECKOUTS_CREATE), CheckoutController.checkout);
router.post('/checkin/:checkInId/extra-charges', checkPermission(PERMISSIONS.CHECKINS_CREATE), CheckoutController.addExtraCharge);
router.get('/checkin/:checkInId/extra-charges', checkPermission(PERMISSIONS.CHECKINS_CREATE), CheckoutController.getExtraCharges);
router.delete('/checkin/:checkInId/extra-charges/:chargeId', checkPermission(PERMISSIONS.CHECKINS_CREATE), CheckoutController.deleteExtraCharge);

// Payments
router.post('/payments', checkPermission(PERMISSIONS.PAYMENTS_CREATE), CheckoutController.collectPartialPayment);
router.get('/payments/ledger', checkPermission(PERMISSIONS.PAYMENTS_READ), CheckoutController.getPaymentLedger);

export default router;
