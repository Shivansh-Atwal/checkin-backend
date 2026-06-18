"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckInRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class CheckInRepository {
    static async findById(id) {
        return db_1.default.checkIn.findUnique({
            where: { id },
            include: {
                customer: {
                    include: { documents: true },
                },
                room: true,
                booking: true,
                checkoutRecord: true,
                payments: true,
            },
        });
    }
    static async findActiveByRoomId(roomId) {
        return db_1.default.checkIn.findFirst({
            where: { roomId, status: 'ACTIVE' },
            include: { customer: true, room: true },
        });
    }
    static async getAllActive() {
        return db_1.default.checkIn.findMany({
            where: { status: 'ACTIVE' },
            include: {
                customer: {
                    include: { documents: true },
                },
                room: true,
            },
            orderBy: { checkInTime: 'desc' },
        });
    }
    static async createWalkIn(data) {
        const arrivalTime = data.checkInTime ? new Date(data.checkInTime) : new Date();
        const checkoutTime = data.expectedCheckOutDate
            ? new Date(data.expectedCheckOutDate)
            : new Date(arrivalTime.getTime() + 24 * 60 * 60 * 1000); // Default +1 day
        return db_1.default.$transaction(async (tx) => {
            // 1. Create a Booking record first for the walk-in
            const bookingNumber = `HF-B-${Math.round(Math.random() * 1000000)}`;
            const booking = await tx.booking.create({
                data: {
                    bookingNumber,
                    customerId: data.customerId,
                    roomId: data.roomIds[0],
                    checkInDate: arrivalTime,
                    checkOutDate: checkoutTime,
                    numberOfGuests: data.numberOfGuests,
                    advancePayment: data.advancePaid,
                    price: data.pricePerNight, // The booking's price is the pricePerNight
                    status: 'CHECKED_IN',
                    notes: 'Walk-in Stay',
                },
            });
            const createdCheckIns = [];
            const baseReg = data.registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`;
            for (let i = 0; i < data.roomIds.length; i++) {
                const rId = data.roomIds[i];
                // Find room number to append for multi-room checks if needed
                const room = await tx.room.findUnique({ where: { id: rId } });
                const roomNumber = room ? room.roomNumber : '';
                const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;
                // Create CheckIn record for each room
                const checkIn = await tx.checkIn.create({
                    data: {
                        registrationNumber: regNum,
                        bookingId: i === 0 ? booking.id : null, // Link booking to first checkin
                        customerId: data.customerId,
                        roomId: rId,
                        numberOfGuests: Math.max(1, Math.round(data.numberOfGuests / data.roomIds.length)), // Split guests or default
                        checkInTime: arrivalTime,
                        expectedCheckOutDate: checkoutTime,
                        advancePaid: i === 0 ? data.advancePaid : 0, // Apply full advance to first room
                        remainingAmount: i === 0 ? data.remainingAmount : 0,
                        pricePerNight: Number(data.pricePerNight),
                        status: 'ACTIVE',
                    },
                });
                createdCheckIns.push(checkIn);
                // Record payment for first check-in only
                if (i === 0 && data.advancePaid > 0) {
                    await tx.payment.create({
                        data: {
                            checkInId: checkIn.id,
                            bookingId: booking.id,
                            amount: data.advancePaid,
                            paymentType: 'ADVANCE',
                            paymentMethod: data.paymentMethod || 'Cash',
                            paymentStatus: 'PAID',
                            notes: `Walk-In Multi-Room Check-In Advance Payment (${data.roomIds.length} rooms)`,
                        },
                    });
                }
            }
            // Return primary check-in with customer and room details
            return tx.checkIn.findUnique({
                where: { id: createdCheckIns[0].id },
                include: { customer: true, room: true },
            });
        });
    }
    static async createFromBooking(data) {
        const arrivalTime = data.checkInTime ? new Date(data.checkInTime) : new Date();
        return db_1.default.$transaction(async (tx) => {
            const booking = await tx.booking.findUnique({
                where: { id: data.bookingId },
            });
            if (!booking)
                throw new Error('Booking not found');
            const checkoutTime = data.expectedCheckOutDate
                ? new Date(data.expectedCheckOutDate)
                : new Date(booking.checkOutDate);
            const createdCheckIns = [];
            const baseReg = data.registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`;
            for (let i = 0; i < data.roomIds.length; i++) {
                const rId = data.roomIds[i];
                // Find room number
                const room = await tx.room.findUnique({ where: { id: rId } });
                const roomNumber = room ? room.roomNumber : '';
                const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;
                // Create CheckIn
                const checkIn = await tx.checkIn.create({
                    data: {
                        registrationNumber: regNum,
                        bookingId: i === 0 ? data.bookingId : null, // Link booking to first checkin
                        customerId: booking.customerId,
                        roomId: rId,
                        numberOfGuests: Math.max(1, Math.round(data.numberOfGuests / data.roomIds.length)),
                        checkInTime: arrivalTime,
                        expectedCheckOutDate: checkoutTime,
                        advancePaid: i === 0 ? (data.advancePaid + booking.advancePayment) : 0,
                        remainingAmount: i === 0 ? data.remainingAmount : 0,
                        pricePerNight: Number(data.pricePerNight !== undefined ? data.pricePerNight : booking.price),
                        status: 'ACTIVE',
                    },
                });
                createdCheckIns.push(checkIn);
                if (i === 0) {
                    // Update booking status to CHECKED_IN
                    await tx.booking.update({
                        where: { id: data.bookingId },
                        data: { status: 'CHECKED_IN' },
                    });
                    // Link booking payments to first checkin
                    await tx.payment.updateMany({
                        where: { bookingId: data.bookingId },
                        data: { checkInId: checkIn.id },
                    });
                    // If additional advance is paid during arrival check-in
                    if (data.advancePaid > 0) {
                        await tx.payment.create({
                            data: {
                                checkInId: checkIn.id,
                                amount: data.advancePaid,
                                paymentType: 'PARTIAL',
                                paymentMethod: data.paymentMethod || 'Cash',
                                paymentStatus: 'PAID',
                                notes: 'Check-In Arrival Partial Payment',
                            },
                        });
                    }
                }
            }
            return tx.checkIn.findUnique({
                where: { id: createdCheckIns[0].id },
                include: { customer: true, room: true },
            });
        });
    }
}
exports.CheckInRepository = CheckInRepository;
