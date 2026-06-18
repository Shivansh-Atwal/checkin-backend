"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const db_1 = __importDefault(require("../config/db"));
class NotificationService {
    /**
     * Mock notification sender that logs to DB history and outputs to console
     */
    static async send({ recipient, message, channel, }) {
        console.log(`[Notification Service] Sending via ${channel} to ${recipient}:\n"${message}"`);
        try {
            const notification = await db_1.default.notification.create({
                data: {
                    recipient,
                    message,
                    channel,
                    status: 'SENT',
                    sentAt: new Date(),
                },
            });
            return notification;
        }
        catch (error) {
            console.error('Failed to save notification record:', error);
            // Attempt fallback write as pending or save failed state
            try {
                return await db_1.default.notification.create({
                    data: {
                        recipient,
                        message,
                        channel,
                        status: 'FAILED',
                    },
                });
            }
            catch (innerError) {
                console.error('Critical notification DB failure:', innerError);
            }
        }
    }
    static async sendBookingConfirmation(customerName, phone, bookingNumber, roomNumber) {
        const message = `Hello ${customerName}, your booking at HotelFlow is confirmed! Booking Ref: ${bookingNumber}. Room: ${roomNumber}. We look forward to hosting you.`;
        await this.send({ recipient: phone, message, channel: 'WhatsApp' });
        await this.send({ recipient: phone, message, channel: 'SMS' });
    }
    static async sendCheckInReminder(customerName, phone, roomNumber) {
        const message = `Dear ${customerName}, welcome to HotelFlow! You have successfully checked into Room ${roomNumber}. Let us know if you need anything.`;
        await this.send({ recipient: phone, message, channel: 'WhatsApp' });
    }
    static async sendCheckOutReminder(customerName, phone, amountDue) {
        const message = `Dear ${customerName}, your check-out is scheduled. Total remaining amount due: ₹${amountDue.toFixed(2)}. Please visit the receptionist desk.`;
        await this.send({ recipient: phone, message, channel: 'Email' });
    }
    static async sendPaymentReceipt(customerName, phone, amount, transactionId) {
        const message = `Thank you ${customerName}! We have received a payment of ₹${amount.toFixed(2)}. Transaction ID: ${transactionId}.`;
        await this.send({ recipient: phone, message, channel: 'WhatsApp' });
    }
}
exports.NotificationService = NotificationService;
