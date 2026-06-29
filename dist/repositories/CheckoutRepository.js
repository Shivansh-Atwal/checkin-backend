"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class CheckoutRepository {
    static async create(data) {
        return db_1.default.$transaction(async (tx) => {
            const checkIn = await tx.checkIn.findUnique({
                where: { id: data.checkInId },
                include: { room: true, booking: true },
            });
            if (!checkIn) {
                throw new Error('CheckIn record not found');
            }
            const checkoutTime = data.actualCheckOutTime || new Date();
            // 1. Create Checkout
            const checkout = await tx.checkout.create({
                data: {
                    checkInId: data.checkInId,
                    roomCharges: data.roomCharges,
                    additionalCharges: data.additionalCharges,
                    discount: data.discount,
                    taxAmount: data.taxAmount,
                    finalAmount: data.finalAmount,
                    billingStatus: 'PAID',
                },
            });
            // 2. Update CheckIn
            await tx.checkIn.update({
                where: { id: data.checkInId },
                data: {
                    status: 'CHECKED_OUT',
                    actualCheckOutTime: checkoutTime,
                    remainingAmount: 0,
                },
            });
            // 4. Update Booking if applicable
            if (checkIn.bookingId) {
                await tx.booking.update({
                    where: { id: checkIn.bookingId },
                    data: { status: 'CHECKED_OUT' },
                });
            }
            // 5. Create final Payment record
            await tx.payment.create({
                data: {
                    checkInId: data.checkInId,
                    amount: data.finalAmount - checkIn.advancePaid,
                    paymentType: 'FULL',
                    paymentMethod: data.paymentMethod,
                    paymentStatus: 'PAID',
                    notes: data.notes || 'Final Check-Out Settlement Payment',
                },
            });
            // 6. Create Invoice record
            const invoiceNumber = `INV-${checkout.id.substring(0, 8).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
            await tx.invoice.create({
                data: {
                    checkoutId: checkout.id,
                    invoiceNumber,
                    totalAmount: data.finalAmount,
                },
            });
            return tx.checkout.findUnique({
                where: { id: checkout.id },
                include: {
                    invoice: true,
                    checkIn: {
                        include: { customer: true, room: true },
                    },
                },
            });
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
    }
}
exports.CheckoutRepository = CheckoutRepository;
