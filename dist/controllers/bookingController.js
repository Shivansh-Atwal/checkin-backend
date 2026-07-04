"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingController = void 0;
const BookingRepository_1 = require("../repositories/BookingRepository");
const RoomRepository_1 = require("../repositories/RoomRepository");
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const CheckInRepository_1 = require("../repositories/CheckInRepository");
const NotificationService_1 = require("../services/NotificationService");
const AuditLogService_1 = require("../services/AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
const RedisService_1 = require("../services/RedisService");
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
        const { customerId, mobileNumber, customerName, roomId, roomIds, checkInDate, checkOutDate, numberOfGuests, advancePayment, price, notes, registrationNumber } = req.body;
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
            const baseReg = registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`;
            const createdBookings = [];
            for (let i = 0; i < targetRoomIds.length; i++) {
                const rId = targetRoomIds[i];
                // 2. Verify Room Availability
                const room = await RoomRepository_1.RoomRepository.findById(rId);
                if (!room || room.status !== 'AVAILABLE') {
                    return next(new errorHandler_1.AppError(400, `Room ${room?.roomNumber || rId} is not available for booking.`));
                }
                const roomNumber = room ? room.roomNumber : '';
                const regNum = targetRoomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;
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
                    registrationNumber: regNum,
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
            // Invalidate dashboard stats
            await RedisService_1.RedisService.invalidateDashboardStats();
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
            if (id === 'offline') {
                const synced = await BookingController.upsertOfflineBooking(req);
                await AuditLogService_1.AuditLogService.log({
                    userId: req.user?.id,
                    userName: req.user?.fullName,
                    action: 'Offline Booking Synced',
                    ipAddress: req.ip,
                    details: {
                        clientId: req.body.clientId,
                        registrationNumber: req.body.registrationNumber,
                        serverId: synced?.id,
                    },
                });
                await RedisService_1.RedisService.invalidateDashboardStats();
                res.status(200).json({
                    success: true,
                    data: synced,
                });
                return;
            }
            const updated = await BookingRepository_1.BookingRepository.update(id, req.body);
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Booking Updated',
                ipAddress: req.ip,
                details: { bookingId: id, updates: req.body },
            });
            // Invalidate dashboard stats
            await RedisService_1.RedisService.invalidateDashboardStats();
            res.status(200).json({
                success: true,
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async delete(req, res, next) {
        const id = req.params.id;
        try {
            const result = await BookingRepository_1.BookingRepository.delete(id);
            if (result.deleted) {
                await AuditLogService_1.AuditLogService.log({
                    userId: req.user?.id,
                    userName: req.user?.fullName,
                    action: 'Booking Deleted',
                    ipAddress: req.ip,
                    details: { bookingId: id },
                });
                await RedisService_1.RedisService.invalidateDashboardStats();
            }
            res.status(200).json({
                success: true,
                message: result.deleted
                    ? 'Booking deleted successfully.'
                    : 'Booking already absent.',
                data: result,
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
            // Invalidate dashboard stats
            await RedisService_1.RedisService.invalidateDashboardStats();
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
    static async getNextReg(req, res, next) {
        try {
            const nextReg = await BookingRepository_1.BookingRepository.getNextRegistrationNumber();
            res.status(200).json({
                success: true,
                data: nextReg,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async upsertOfflineBooking(req) {
        const payload = req.body;
        const existing = await BookingRepository_1.BookingRepository.findByOfflineKey({
            id: payload.id,
            clientId: payload.clientId,
            registrationNumber: payload.registrationNumber,
        });
        if (existing) {
            return BookingRepository_1.BookingRepository.update(existing.id, BookingController.normalizeOfflineBookingPayload(payload));
        }
        let resolvedCustomerId = payload.customerId;
        if (!resolvedCustomerId) {
            if (!payload.customerName || !payload.mobileNumber) {
                throw new errorHandler_1.AppError(400, 'Required guest details are missing.');
            }
            let customer = await CustomerRepository_1.CustomerRepository.findByMobile(payload.mobileNumber);
            if (!customer) {
                const newCustomer = await CustomerRepository_1.CustomerRepository.create({
                    fullName: payload.customerName,
                    mobileNumber: payload.mobileNumber,
                    address: payload.address,
                    city: payload.city,
                    state: payload.state,
                    country: payload.country,
                    pincode: payload.pincode,
                    document: payload.document,
                });
                if (!newCustomer) {
                    throw new errorHandler_1.AppError(500, 'Customer profile creation failed.');
                }
                customer = newCustomer;
            }
            else {
                await CustomerRepository_1.CustomerRepository.update(customer.id, {
                    address: payload.address || customer.address || undefined,
                    city: payload.city || customer.city || undefined,
                    state: payload.state || customer.state || undefined,
                    country: payload.country || customer.country || undefined,
                    pincode: payload.pincode || customer.pincode || undefined,
                    document: payload.document,
                });
            }
            resolvedCustomerId = customer.id;
        }
        const roomIds = Array.isArray(payload.roomIds) && payload.roomIds.length > 0
            ? payload.roomIds
            : payload.roomId
                ? [payload.roomId]
                : [];
        if (roomIds.length === 0) {
            throw new errorHandler_1.AppError(400, 'At least one room is required.');
        }
        for (const roomId of roomIds) {
            const room = await RoomRepository_1.RoomRepository.findById(roomId);
            if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
                throw new errorHandler_1.AppError(400, `Selected room ${room?.roomNumber || roomId} is not available.`);
            }
        }
        let checkInTime;
        if (payload.checkInTime) {
            checkInTime = new Date(payload.checkInTime);
        }
        else if (payload.arrivalDate && payload.arrivalTime) {
            checkInTime = new Date(`${payload.arrivalDate}T${payload.arrivalTime}`);
        }
        else if (payload.checkInDate) {
            checkInTime = new Date(payload.checkInDate);
        }
        const checkIn = await CheckInRepository_1.CheckInRepository.createWalkIn({
            customerId: resolvedCustomerId,
            roomIds,
            numberOfGuests: Number(payload.numberOfGuests || 1),
            checkInTime,
            expectedCheckOutDate: payload.expectedCheckOutDate
                ? new Date(payload.expectedCheckOutDate)
                : payload.checkOutDate
                    ? new Date(payload.checkOutDate)
                    : undefined,
            advancePaid: Number(payload.advancePaid || payload.advancePayment || 0),
            remainingAmount: Number(payload.remainingAmount || 0),
            paymentMethod: payload.paymentMethod,
            registrationNumber: payload.registrationNumber,
            pricePerNight: Number(payload.pricePerNight || payload.price || 0),
            roomPrices: payload.roomPrices,
            extraBedsCount: Number(payload.extraBedsCount || 0),
            extraBedPrice: Number(payload.extraBedPrice || 0),
        });
        if (!checkIn) {
            throw new errorHandler_1.AppError(500, 'Offline booking sync failed.');
        }
        return checkIn;
    }
    static normalizeOfflineBookingPayload(payload) {
        const checkInDate = payload.checkInDate
            || payload.checkInTime
            || (payload.arrivalDate && payload.arrivalTime ? `${payload.arrivalDate}T${payload.arrivalTime}` : payload.arrivalDate);
        const checkOutDate = payload.checkOutDate
            || payload.expectedCheckOutDate
            || (payload.checkoutDate && payload.checkoutTime ? `${payload.checkoutDate}T${payload.checkoutTime}` : payload.checkoutDate);
        return {
            ...payload,
            checkInDate,
            checkOutDate,
            roomId: payload.roomId || (Array.isArray(payload.roomIds) ? payload.roomIds[0] : undefined),
            price: payload.price ?? payload.pricePerNight,
            advancePayment: payload.advancePayment ?? payload.advancePaid,
        };
    }
}
exports.BookingController = BookingController;
