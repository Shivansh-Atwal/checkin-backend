"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
const db_1 = __importDefault(require("../config/db"));
const BookingRepository_1 = require("../repositories/BookingRepository");
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const RedisService_1 = require("./RedisService");
const NotificationService_1 = require("./NotificationService");
const AuditLogService_1 = require("./AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
class BookingService {
    static async createBooking(data, context = {}) {
        const targetRoomIds = data.roomIds && Array.isArray(data.roomIds) && data.roomIds.length > 0
            ? data.roomIds
            : (data.roomId ? [data.roomId] : []);
        if (targetRoomIds.length === 0) {
            throw new errorHandler_1.AppError(400, 'At least one room must be allocated.');
        }
        const checkInDateObj = new Date(data.checkInDate);
        const checkOutDateObj = new Date(data.checkOutDate);
        // 1. Run database operations in transaction
        const createdBookings = await db_1.default.$transaction(async (tx) => {
            let resolvedCustomerId = data.customerId;
            if (!resolvedCustomerId) {
                if (!data.customerName || !data.mobileNumber) {
                    throw new errorHandler_1.AppError(400, 'Customer name and mobile number are required for new profiles.');
                }
                let existingCust = await CustomerRepository_1.CustomerRepository.findByMobile(data.mobileNumber, tx);
                if (!existingCust) {
                    const newCust = await CustomerRepository_1.CustomerRepository.create({
                        fullName: data.customerName,
                        mobileNumber: data.mobileNumber,
                    }, tx);
                    existingCust = newCust;
                }
                resolvedCustomerId = existingCust.id;
            }
            const baseReg = data.registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`;
            const list = [];
            // Bulk query rooms to avoid loop queries
            const rooms = await tx.room.findMany({
                where: { id: { in: targetRoomIds } },
                select: { id: true, roomNumber: true }
            });
            const roomMap = new Map(rooms.map(r => [r.id, r.roomNumber]));
            for (let i = 0; i < targetRoomIds.length; i++) {
                const rId = targetRoomIds[i];
                const roomNumber = roomMap.get(rId) || '';
                // Verify room availability
                const overlappingBooking = await tx.booking.findFirst({
                    where: {
                        roomId: rId,
                        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
                        OR: [
                            {
                                checkInDate: { lte: checkInDateObj },
                                checkOutDate: { gt: checkInDateObj },
                            },
                            {
                                checkInDate: { lt: checkOutDateObj },
                                checkOutDate: { gte: checkOutDateObj },
                            },
                        ],
                    },
                });
                if (overlappingBooking) {
                    throw new errorHandler_1.AppError(400, `Room ${roomNumber || rId} is already booked for the selected dates.`);
                }
                const regNum = targetRoomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;
                const booking = await BookingRepository_1.BookingRepository.create({
                    customerId: resolvedCustomerId,
                    roomId: rId,
                    checkInDate: checkInDateObj,
                    checkOutDate: checkOutDateObj,
                    numberOfGuests: Math.max(1, Math.round(Number(data.numberOfGuests || 1) / targetRoomIds.length)),
                    advancePayment: i === 0 ? Number(data.advancePayment || 0) : 0,
                    price: Number(data.price),
                    notes: i === 0 ? data.notes : `Part of group booking: ${data.notes || ''}`,
                    registrationNumber: regNum,
                }, tx);
                if (!booking) {
                    throw new errorHandler_1.AppError(500, 'Booking transaction failed.');
                }
                list.push(booking);
            }
            return list;
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        const primaryBooking = createdBookings[0];
        // 2. Post-save non-blocking background tasks
        Promise.allSettled([
            (async () => {
                if (primaryBooking.customer && primaryBooking.room) {
                    await NotificationService_1.NotificationService.sendBookingConfirmation(primaryBooking.customer.fullName, primaryBooking.customer.mobileNumber, primaryBooking.bookingNumber, primaryBooking.room.roomNumber);
                }
            })(),
            AuditLogService_1.AuditLogService.log({
                userId: context.userId,
                userName: context.userName,
                action: 'Booking Created',
                ipAddress: context.ipAddress,
                details: { bookingId: primaryBooking.id, bookingNumber: primaryBooking.bookingNumber, roomIds: targetRoomIds },
            }),
            RedisService_1.RedisService.invalidateDashboardStats(),
        ]).catch((err) => {
            console.warn('Booking create background tasks failed:', err);
        });
        return primaryBooking;
    }
    static async updateBooking(id, data, context = {}) {
        const booking = await db_1.default.$transaction(async (tx) => {
            return BookingRepository_1.BookingRepository.update(id, data, tx);
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        if (!booking) {
            throw new errorHandler_1.AppError(404, 'Booking not found');
        }
        // Post-save background tasks
        Promise.allSettled([
            RedisService_1.RedisService.invalidateDashboardStats(),
            AuditLogService_1.AuditLogService.log({
                userId: context.userId,
                userName: context.userName,
                action: 'Booking Updated',
                ipAddress: context.ipAddress,
                deviceInformation: context.deviceInformation,
                details: { bookingId: id, updates: data },
            }),
        ]).catch((err) => {
            console.warn('Booking update background tasks failed:', err);
        });
        return booking;
    }
}
exports.BookingService = BookingService;
