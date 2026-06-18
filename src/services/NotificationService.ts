import prisma from '../config/db';

export class NotificationService {
  /**
   * Mock notification sender that logs to DB history and outputs to console
   */
  static async send({
    recipient,
    message,
    channel,
  }: {
    recipient: string;
    message: string;
    channel: 'WhatsApp' | 'SMS' | 'Email';
  }) {
    console.log(`[Notification Service] Sending via ${channel} to ${recipient}:\n"${message}"`);

    try {
      const notification = await prisma.notification.create({
        data: {
          recipient,
          message,
          channel,
          status: 'SENT',
          sentAt: new Date(),
        },
      });
      return notification;
    } catch (error) {
      console.error('Failed to save notification record:', error);
      
      // Attempt fallback write as pending or save failed state
      try {
        return await prisma.notification.create({
          data: {
            recipient,
            message,
            channel,
            status: 'FAILED',
          },
        });
      } catch (innerError) {
        console.error('Critical notification DB failure:', innerError);
      }
    }
  }

  static async sendBookingConfirmation(customerName: string, phone: string, bookingNumber: string, roomNumber: string) {
    const message = `Hello ${customerName}, your booking at HotelFlow is confirmed! Booking Ref: ${bookingNumber}. Room: ${roomNumber}. We look forward to hosting you.`;
    await this.send({ recipient: phone, message, channel: 'WhatsApp' });
    await this.send({ recipient: phone, message, channel: 'SMS' });
  }

  static async sendCheckInReminder(customerName: string, phone: string, roomNumber: string) {
    const message = `Dear ${customerName}, welcome to HotelFlow! You have successfully checked into Room ${roomNumber}. Let us know if you need anything.`;
    await this.send({ recipient: phone, message, channel: 'WhatsApp' });
  }

  static async sendCheckOutReminder(customerName: string, phone: string, amountDue: number) {
    const message = `Dear ${customerName}, your check-out is scheduled. Total remaining amount due: ₹${amountDue.toFixed(2)}. Please visit the receptionist desk.`;
    await this.send({ recipient: phone, message, channel: 'Email' });
  }

  static async sendPaymentReceipt(customerName: string, phone: string, amount: number, transactionId: string) {
    const message = `Thank you ${customerName}! We have received a payment of ₹${amount.toFixed(2)}. Transaction ID: ${transactionId}.`;
    await this.send({ recipient: phone, message, channel: 'WhatsApp' });
  }
}
