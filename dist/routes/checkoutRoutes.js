"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const checkoutController_1 = require("../controllers/checkoutController");
const auth_1 = require("../middleware/auth");
const constants_1 = require("../config/constants");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Check-ins
router.get('/checkins', checkoutController_1.CheckoutController.getActiveCheckIns);
router.post('/checkin/walkin', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKINS_CREATE), checkoutController_1.CheckoutController.checkInWalkIn);
router.post('/checkin/booking', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKINS_CREATE), checkoutController_1.CheckoutController.checkInBooking);
// Check-outs
router.get('/checkout/preview/:checkInId', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKOUTS_CREATE), checkoutController_1.CheckoutController.previewBill);
router.post('/checkout', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKOUTS_CREATE), checkoutController_1.CheckoutController.checkout);
router.post('/checkin/:checkInId/extra-charges', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKINS_CREATE), checkoutController_1.CheckoutController.addExtraCharge);
router.get('/checkin/:checkInId/extra-charges', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKINS_CREATE), checkoutController_1.CheckoutController.getExtraCharges);
router.delete('/checkin/:checkInId/extra-charges/:chargeId', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.CHECKINS_CREATE), checkoutController_1.CheckoutController.deleteExtraCharge);
// Payments
router.post('/payments', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.PAYMENTS_CREATE), checkoutController_1.CheckoutController.collectPartialPayment);
router.get('/payments/ledger', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.PAYMENTS_READ), checkoutController_1.CheckoutController.getPaymentLedger);
exports.default = router;
