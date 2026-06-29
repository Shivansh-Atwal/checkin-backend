"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class PaymentRepository {
    static async findById(id) {
        return db_1.default.payment.findUnique({
            where: { id },
            include: {
                checkIn: { include: { customer: true, room: true } },
                booking: { include: { customer: true, room: true } },
            },
        });
    }
    static async getAll() {
        return db_1.default.payment.findMany({
            include: {
                checkIn: { include: { customer: true, room: true, checkoutRecord: true } },
                booking: { include: { customer: true, room: true } },
            },
            orderBy: { paymentDate: 'desc' },
        });
    }
    static async getCheckInPayments(checkInId) {
        return db_1.default.payment.findMany({
            where: { checkInId },
            orderBy: { paymentDate: 'asc' },
        });
    }
    static async create(data) {
        return db_1.default.$transaction(async (tx) => {
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
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
    }
}
exports.PaymentRepository = PaymentRepository;
