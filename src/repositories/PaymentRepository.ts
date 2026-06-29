import prisma from '../config/db';

export class PaymentRepository {
  static async findById(id: string) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        checkIn: { include: { customer: true, room: true } },
        booking: { include: { customer: true, room: true } },
      },
    });
  }

  static async getAll() {
    return prisma.payment.findMany({
      include: {
        checkIn: { include: { customer: true, room: true, checkoutRecord: true } },
        booking: { include: { customer: true, room: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  static async getCheckInPayments(checkInId: string) {
    return prisma.payment.findMany({
      where: { checkInId },
      orderBy: { paymentDate: 'asc' },
    });
  }

  static async create(data: {
    checkInId?: string;
    bookingId?: string;
    amount: number;
    paymentType: string;
    paymentMethod: string;
    transactionId?: string;
    notes?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          ...data,
          paymentStatus: 'COMPLETED',
        },
      });

      // If check-in payment, adjust checkin advance/remaining sums
      if (data.checkInId) {
        const checkin = await tx.checkIn.findUnique({ where: { id: data.checkInId } });
        if (checkin) {
          await tx.checkIn.update({
            where: { id: data.checkInId },
            data: {
              advancePaid: checkin.advancePaid + data.amount,
              remainingAmount: Math.max(0, checkin.remainingAmount - data.amount),
            },
          });
        }
      }

      return payment;
    },
      {
        timeout: 30000,
        maxWait: 10000,
      });
  }
}
