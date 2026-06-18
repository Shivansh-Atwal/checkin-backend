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
        const { customerId, mobileNumber, customerName, roomId, checkInDate, checkOutDate, numberOfGuests, advancePayment, price, notes } = req.body;
        if ((!customerId && (!customerName || !mobileNumber)) || !roomId || !checkInDate || !checkOutDate || !price) {
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
            // 2. Verify Room Availability
            const room = await RoomRepository_1.RoomRepository.findById(roomId);
            if (!room || room.status !== 'AVAILABLE') {
                return next(new errorHandler_1.AppError(400, 'Room is not available for booking.'));
            }
            // 3. Create Booking
            const booking = await BookingRepository_1.BookingRepository.create({
                customerId: resolvedCustomerId,
                roomId,
                checkInDate: new Date(checkInDate),
                checkOutDate: new Date(checkOutDate),
                numberOfGuests: Number(numberOfGuests || 1),
                advancePayment: Number(advancePayment || 0),
                price: Number(price),
                notes,
            });
            if (!booking) {
                return next(new errorHandler_1.AppError(500, 'Booking transaction failed.'));
            }
            // Send confirmation notification
            await NotificationService_1.NotificationService.sendBookingConfirmation(booking.customer.fullName, booking.customer.mobileNumber, booking.bookingNumber, booking.room.roomNumber);
            // Audit action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Booking Created',
                ipAddress: req.ip,
                details: { bookingId: booking.id, bookingNumber: booking.bookingNumber },
            });
            res.status(201).json({
                success: true,
                data: booking,
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
