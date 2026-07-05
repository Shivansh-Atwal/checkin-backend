"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
const BookingRepository_1 = require("../repositories/BookingRepository");
const CustomerService_1 = require("./CustomerService");
const RoomService_1 = require("./RoomService");
const errorHandler_1 = require("../middleware/errorHandler");
const constants_1 = require("../constants");
const db_1 = __importDefault(require("../config/db"));
class BookingService {
    /**
     * Creates a new booking.
     * State machine: None -> RESERVED
     */
    static async createBooking(payload, tx) {
        const db = tx || db_1.default;
        return db.$transaction(async (prismaTx) => {
            // 1. Handle Customer
            const customer = await CustomerService_1.CustomerService.upsertCustomer(payload, prismaTx);
            // 2. Validate Room Availability
            const room = await prismaTx.room.findUnique({ where: { id: payload.roomId } });
            if (!room || (room.status !== constants_1.RoomStatus.AVAILABLE && room.status !== constants_1.RoomStatus.CLEANING)) {
                throw new errorHandler_1.AppError(422, 'Selected room is not available for booking.');
            }
            // 3. Update Room Status
            await RoomService_1.RoomService.updateStatus(payload.roomId, constants_1.RoomStatus.RESERVED, prismaTx);
            // 4. Create Booking
            const booking = await BookingRepository_1.BookingRepository.create({
                bookingNumber: payload.bookingNumber || `BKG-${Date.now()}`,
                registrationNumber: payload.registrationNumber,
                customer: { connect: { id: customer.id } },
                room: { connect: { id: payload.roomId } },
                checkInDate: new Date(payload.checkInDate),
                checkOutDate: new Date(payload.checkOutDate),
                numberOfGuests: Number(payload.numberOfGuests || 1),
                advancePayment: Number(payload.advancePayment || 0),
                price: Number(payload.price || 0),
                status: constants_1.BookingStatus.RESERVED,
                notes: payload.notes,
                deviceId: payload.deviceId,
                updatedBy: payload.updatedBy || payload.userId,
            }, prismaTx);
            // 5. Emit event (Notification) -> In a real app we'd dispatch an event here
            // NotificationService.emit('BOOKING_CREATED', booking);
            return booking;
        });
    }
    /**
     * Checks in a guest (converts booking or walk-in).
     * State machine: RESERVED -> CHECKED_IN or None -> CHECKED_IN
     */
    static async checkIn(payload, tx) {
        const db = tx || db_1.default;
        return db.$transaction(async (prismaTx) => {
            // 1. Handle Customer
            const customer = await CustomerService_1.CustomerService.upsertCustomer(payload, prismaTx);
            // 2. Room validation
            const room = await prismaTx.room.findUnique({ where: { id: payload.roomId } });
            if (!room)
                throw new errorHandler_1.AppError(404, 'Room not found.');
            // Allow check-in if room is AVAILABLE, CLEANING, or RESERVED (for this booking)
            if (room.status === constants_1.RoomStatus.OCCUPIED || room.status === constants_1.RoomStatus.MAINTENANCE) {
                throw new errorHandler_1.AppError(422, 'Room is currently occupied or under maintenance.');
            }
            // 3. Update Room Status
            await RoomService_1.RoomService.updateStatus(payload.roomId, constants_1.RoomStatus.OCCUPIED, prismaTx);
            // 4. Create or Update Booking
            let booking;
            if (payload.bookingId) {
                // Converting Reservation to Check-In
                booking = await BookingRepository_1.BookingRepository.findById(payload.bookingId, prismaTx);
                if (!booking)
                    throw new errorHandler_1.AppError(404, 'Booking not found');
                if (booking.status === constants_1.BookingStatus.CHECKED_IN)
                    throw new errorHandler_1.AppError(422, 'Already checked in.');
                if (booking.status === constants_1.BookingStatus.CHECKED_OUT)
                    throw new errorHandler_1.AppError(422, 'Cannot check in a checked out booking.');
                booking = await BookingRepository_1.BookingRepository.update(booking.id, {
                    status: constants_1.BookingStatus.CHECKED_IN,
                    registrationNumber: payload.registrationNumber,
                    deviceId: payload.deviceId,
                    updatedBy: payload.updatedBy || payload.userId,
                }, prismaTx);
            }
            else {
                // Walk-in Check-in
                booking = await BookingRepository_1.BookingRepository.create({
                    bookingNumber: payload.bookingNumber || `WI-${Date.now()}`,
                    registrationNumber: payload.registrationNumber,
                    customer: { connect: { id: customer.id } },
                    room: { connect: { id: payload.roomId } },
                    checkInDate: payload.checkInDate ? new Date(payload.checkInDate) : new Date(),
                    checkOutDate: new Date(payload.checkOutDate),
                    numberOfGuests: Number(payload.numberOfGuests || 1),
                    advancePayment: Number(payload.advancePayment || 0),
                    price: Number(payload.price || 0),
                    status: constants_1.BookingStatus.CHECKED_IN,
                    notes: payload.notes,
                    deviceId: payload.deviceId,
                    updatedBy: payload.updatedBy || payload.userId,
                }, prismaTx);
            }
            // 5. Create CheckIn Record (Legacy compatibility)
            const checkInRecord = await prismaTx.checkIn.create({
                data: {
                    bookingId: booking.id,
                    customerId: customer.id,
                    roomId: payload.roomId,
                    registrationNumber: payload.registrationNumber,
                    numberOfGuests: booking.numberOfGuests,
                    checkInTime: booking.checkInDate,
                    expectedCheckOutDate: booking.checkOutDate,
                    advancePaid: booking.advancePayment,
                    remainingAmount: Math.max(0, booking.price - booking.advancePayment),
                    pricePerNight: booking.price,
                    status: 'ACTIVE',
                    deviceId: payload.deviceId,
                    updatedBy: payload.updatedBy || payload.userId,
                }
            });
            return { booking, checkInRecord };
        });
    }
    /**
     * Checks out a guest.
     * State machine: CHECKED_IN -> CHECKED_OUT
     */
    static async checkOut(payload, tx) {
        const db = tx || db_1.default;
        return db.$transaction(async (prismaTx) => {
            const booking = await BookingRepository_1.BookingRepository.findById(payload.bookingId, prismaTx);
            if (!booking)
                throw new errorHandler_1.AppError(404, 'Booking not found');
            if (booking.status !== constants_1.BookingStatus.CHECKED_IN) {
                throw new errorHandler_1.AppError(422, `Cannot check out booking in status: ${booking.status}`);
            }
            // 1. Update Booking Status
            const updatedBooking = await BookingRepository_1.BookingRepository.update(booking.id, {
                status: constants_1.BookingStatus.CHECKED_OUT,
                checkOutDate: payload.checkOutTime ? new Date(payload.checkOutTime) : new Date(),
                deviceId: payload.deviceId,
                updatedBy: payload.updatedBy || payload.userId,
            }, prismaTx);
            // 2. Update Room Status
            await RoomService_1.RoomService.updateStatus(booking.roomId, constants_1.RoomStatus.CLEANING, prismaTx);
            // 3. Mark CheckIn record as complete
            const checkIn = await prismaTx.checkIn.findUnique({ where: { bookingId: booking.id } });
            if (checkIn) {
                await prismaTx.checkIn.update({
                    where: { id: checkIn.id },
                    data: {
                        status: 'COMPLETED',
                        actualCheckOutTime: new Date(),
                        deviceId: payload.deviceId,
                        updatedBy: payload.updatedBy || payload.userId,
                    }
                });
                // 4. Create Checkout Billing Record
                await prismaTx.checkout.create({
                    data: {
                        checkInId: checkIn.id,
                        roomCharges: Number(payload.roomCharges || 0),
                        additionalCharges: Number(payload.additionalCharges || 0),
                        discount: Number(payload.discount || 0),
                        taxAmount: Number(payload.taxAmount || 0),
                        finalAmount: Number(payload.finalAmount || 0),
                        billingStatus: payload.billingStatus || 'PAID',
                        deviceId: payload.deviceId,
                        updatedBy: payload.updatedBy || payload.userId,
                    }
                });
            }
            return updatedBooking;
        });
    }
    /**
     * Cancels a booking.
     * State machine: RESERVED -> CANCELLED
     */
    static async cancelBooking(bookingId, payload, tx) {
        const db = tx || db_1.default;
        return db.$transaction(async (prismaTx) => {
            const booking = await BookingRepository_1.BookingRepository.findById(bookingId, prismaTx);
            if (!booking)
                throw new errorHandler_1.AppError(404, 'Booking not found');
            if (booking.status !== constants_1.BookingStatus.RESERVED) {
                throw new errorHandler_1.AppError(422, `Cannot cancel a booking that is ${booking.status}`);
            }
            // Update booking
            const cancelledBooking = await BookingRepository_1.BookingRepository.update(booking.id, {
                status: constants_1.BookingStatus.CANCELLED,
                deviceId: payload.deviceId,
                updatedBy: payload.updatedBy || payload.userId,
            }, prismaTx);
            // Free up room
            await RoomService_1.RoomService.updateStatus(booking.roomId, constants_1.RoomStatus.AVAILABLE, prismaTx);
            return cancelledBooking;
        });
    }
    /**
     * Generic Update wrapper (used for offline updates to existing records without state changes)
     */
    static async updateBooking(bookingId, payload, tx) {
        const db = tx || db_1.default;
        return db.$transaction(async (prismaTx) => {
            let booking = await BookingRepository_1.BookingRepository.findById(bookingId, prismaTx);
            if (!booking)
                throw new errorHandler_1.AppError(404, 'Booking not found for update');
            if (payload.customerId || payload.mobileNumber) {
                const customer = await CustomerService_1.CustomerService.upsertCustomer(payload, prismaTx);
                payload.customerId = customer.id;
            }
            const updateData = {};
            if (payload.customerId)
                updateData.customer = { connect: { id: payload.customerId } };
            if (payload.roomId)
                updateData.room = { connect: { id: payload.roomId } };
            if (payload.checkInDate)
                updateData.checkInDate = new Date(payload.checkInDate);
            if (payload.checkOutDate)
                updateData.checkOutDate = new Date(payload.checkOutDate);
            if (payload.numberOfGuests)
                updateData.numberOfGuests = Number(payload.numberOfGuests);
            if (payload.price)
                updateData.price = Number(payload.price);
            if (payload.notes)
                updateData.notes = payload.notes;
            if (payload.registrationNumber)
                updateData.registrationNumber = payload.registrationNumber;
            updateData.deviceId = payload.deviceId;
            updateData.updatedBy = payload.updatedBy || payload.userId;
            // Handle room changes
            if (payload.roomId && payload.roomId !== booking.roomId) {
                // Free old room
                await RoomService_1.RoomService.updateStatus(booking.roomId, constants_1.RoomStatus.AVAILABLE, prismaTx);
                // Occupy new room
                const newRoomStatus = booking.status === constants_1.BookingStatus.CHECKED_IN ? constants_1.RoomStatus.OCCUPIED : constants_1.RoomStatus.RESERVED;
                await RoomService_1.RoomService.updateStatus(payload.roomId, newRoomStatus, prismaTx);
            }
            booking = await BookingRepository_1.BookingRepository.update(bookingId, updateData, prismaTx);
            return booking;
        });
    }
}
exports.BookingService = BookingService;
