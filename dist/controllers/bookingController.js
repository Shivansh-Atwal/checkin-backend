"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingController = void 0;
const BookingRepository_1 = require("../repositories/BookingRepository");
const RoomRepository_1 = require("../repositories/RoomRepository");
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const NotificationService_1 = require("../services/NotificationService");
const AuditLogService_1 = require("../services/AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
class BookingController {
    static async getAll(req, res, next) {
        try {
            const status = req.query.status;
            const q = req.query.q;
            const bookings = await BookingRepository_1.BookingRepository.getAll({ status, search: q });
            res.status(200).json({
                success: true,
                data: bookings,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getById(req, res, next) {
        try {
            const id = req.params.id;
            const booking = await BookingRepository_1.BookingRepository.findById(id);
            if (!booking) {
                return next(new errorHandler_1.AppError(404, 'Booking not found.'));
            }
            res.status(200).json({
                success: true,
                data: booking,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async create(req, res, next) {
        const { customerId, mobileNumber, customerName, roomId, roomIds, checkInDate, checkOutDate, numberOfGuests, advancePayment, price, notes } = req.body;
        const targetRoomIds = roomIds && Array.isArray(roomIds) && roomIds.length > 0 ? roomIds : (roomId ? [roomId] : []);
        if ((!customerId && (!customerName || !mobileNumber)) || targetRoomIds.length === 0 || !checkInDate || !checkOutDate || !price) {
            return next(new errorHandler_1.AppError(400, 'Required reservation details are missing.'));
        }
        try {
            let resolvedCustomerId = customerId;
            // 1. Check/create customer if doing Walk-In style booking
            if (!resolvedCustomerId) {
                let existingCust = await CustomerRepository_1.CustomerRepository.findByMobile(mobileNumber);
                if (!existingCust) {
                    const newCust = await CustomerRepository_1.CustomerRepository.create({
                        fullName: customerName,
                        mobileNumber,
                    });
                    if (!newCust) {
                        return next(new errorHandler_1.AppError(500, 'Guest creation failed.'));
                    }
                    existingCust = newCust;
                }
                resolvedCustomerId = existingCust.id;
            }
            const createdBookings = [];
            for (let i = 0; i < targetRoomIds.length; i++) {
                const rId = targetRoomIds[i];
                // 2. Verify Room Availability
                const room = await RoomRepository_1.RoomRepository.findById(rId);
                if (!room || room.status !== 'AVAILABLE') {
                    return next(new errorHandler_1.AppError(400, `Room ${room?.roomNumber || rId} is not available for booking.`));
                }
                // 3. Create Booking
                const booking = await BookingRepository_1.BookingRepository.create({
                    customerId: resolvedCustomerId,
                    roomId: rId,
                    checkInDate: new Date(checkInDate),
                    checkOutDate: new Date(checkOutDate),
                    numberOfGuests: Math.max(1, Math.round(Number(numberOfGuests || 1) / targetRoomIds.length)),
                    advancePayment: i === 0 ? Number(advancePayment || 0) : 0,
                    price: Number(price),
                    notes: i === 0 ? notes : `Part of group booking: ${notes || ''}`,
                });
                if (!booking) {
                    return next(new errorHandler_1.AppError(500, 'Booking transaction failed.'));
                }
                createdBookings.push(booking);
            }
            const primaryBooking = createdBookings[0];
            // Send confirmation notification
            await NotificationService_1.NotificationService.sendBookingConfirmation(primaryBooking.customer.fullName, primaryBooking.customer.mobileNumber, primaryBooking.bookingNumber, primaryBooking.room.roomNumber);
            // Audit action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Booking Created',
                ipAddress: req.ip,
                details: { bookingId: primaryBooking.id, bookingNumber: primaryBooking.bookingNumber, roomIds: targetRoomIds },
            });
            res.status(201).json({
                success: true,
                data: primaryBooking,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async update(req, res, next) {
        const id = req.params.id;
        try {
            const updated = await BookingRepository_1.BookingRepository.update(id, req.body);
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Booking Updated',
                ipAddress: req.ip,
                details: { bookingId: id, updates: req.body },
            });
            res.status(200).json({
                success: true,
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async cancel(req, res, next) {
        const id = req.params.id;
        try {
            const updated = await BookingRepository_1.BookingRepository.update(id, { status: 'CANCELLED' });
            // Log audit
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Booking Updated',
                ipAddress: req.ip,
                details: { bookingId: id, status: 'CANCELLED' },
            });
            res.status(200).json({
                success: true,
                message: 'Booking cancelled successfully.',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.BookingController = BookingController;
