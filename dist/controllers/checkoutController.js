"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutController = void 0;
const CheckInRepository_1 = require("../repositories/CheckInRepository");
const CheckoutRepository_1 = require("../repositories/CheckoutRepository");
const RoomRepository_1 = require("../repositories/RoomRepository");
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const PaymentRepository_1 = require("../repositories/PaymentRepository");
const InvoiceService_1 = require("../services/InvoiceService");
const NotificationService_1 = require("../services/NotificationService");
const AuditLogService_1 = require("../services/AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = __importDefault(require("../config/db"));
class CheckoutController {
    static async getActiveCheckIns(req, res, next) {
        try {
            const checkins = await CheckInRepository_1.CheckInRepository.getAllActive();
            res.status(200).json({
                success: true,
                data: checkins,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async checkInWalkIn(req, res, next) {
        const { customerId, customerName, mobileNumber, roomId, numberOfGuests, numberOfRooms, // Added to ask for number of rooms
        arrivalDate, arrivalTime, expectedCheckOutDate, advancePaid, remainingAmount, paymentMethod, pincode, state, country, address, city, registrationNumber, pricePerNight, } = req.body;
        if (!customerId && (!customerName || !mobileNumber)) {
            return next(new errorHandler_1.AppError(400, 'Required guest check-in details are missing.'));
        }
        try {
            let resolvedCustomerId = customerId;
            if (!resolvedCustomerId) {
                let existingCust = await CustomerRepository_1.CustomerRepository.findByMobile(mobileNumber);
                if (!existingCust) {
                    const newCust = await CustomerRepository_1.CustomerRepository.create({
                        fullName: customerName,
                        mobileNumber,
                        address,
                        city,
                        state,
                        country,
                        pincode,
                    });
                    if (!newCust) {
                        return next(new errorHandler_1.AppError(500, 'Customer profile creation failed.'));
                    }
                    existingCust = newCust;
                }
                else {
                    // Update address details for existing guest if provided
                    await CustomerRepository_1.CustomerRepository.update(existingCust.id, {
                        address: address || existingCust.address || undefined,
                        city: city || existingCust.city || undefined,
                        state: state || existingCust.state || undefined,
                        country: country || existingCust.country || undefined,
                        pincode: pincode || existingCust.pincode || undefined,
                    });
                }
                resolvedCustomerId = existingCust.id;
            }
            if (registrationNumber) {
                const existingReg = await db_1.default.checkIn.findFirst({
                    where: {
                        OR: [
                            { registrationNumber: registrationNumber },
                            { registrationNumber: { startsWith: `${registrationNumber}-` } }
                        ]
                    }
                });
                if (existingReg) {
                    return next(new errorHandler_1.AppError(400, `Registration number '${registrationNumber}' is already in use.`));
                }
            }
            // 1. Fetch available rooms to verify capacity
            const requestedRoomsCount = Math.max(1, Number(numberOfRooms || 1));
            const availableRooms = await RoomRepository_1.RoomRepository.getAll({ status: 'AVAILABLE' });
            // Automatically allocate first free room if not provided
            let primaryRoomId = roomId;
            if (!primaryRoomId) {
                if (availableRooms.length === 0) {
                    return next(new errorHandler_1.AppError(400, 'No rooms are currently available.'));
                }
                primaryRoomId = availableRooms[0].id;
            }
            const room = await RoomRepository_1.RoomRepository.findById(primaryRoomId);
            if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
                return next(new errorHandler_1.AppError(400, 'Selected room is not available.'));
            }
            // If the selected room is AVAILABLE, it is already counted in availableRooms.
            // If it is ADVANCE_BOOKED, we need it plus (requestedRoomsCount - 1) other AVAILABLE rooms.
            const isSelectedRoomAvailable = room.status === 'AVAILABLE';
            const neededFreeRooms = isSelectedRoomAvailable ? requestedRoomsCount : requestedRoomsCount - 1;
            const totalFreeRoomsCount = isSelectedRoomAvailable ? availableRooms.length : availableRooms.length + 1;
            if (availableRooms.length < neededFreeRooms) {
                return next(new errorHandler_1.AppError(400, `Not enough rooms are free. Only ${totalFreeRoomsCount} rooms are currently free.`));
            }
            // Compile allocation list
            const roomIdsToAllocate = [primaryRoomId];
            const otherFreeRooms = availableRooms.filter((r) => r.id !== primaryRoomId);
            for (let i = 0; i < requestedRoomsCount - 1; i++) {
                if (otherFreeRooms[i]) {
                    roomIdsToAllocate.push(otherFreeRooms[i].id);
                }
            }
            // Build custom checkInTime Date object if provided
            let customCheckInTime = undefined;
            if (arrivalDate && arrivalTime) {
                customCheckInTime = new Date(`${arrivalDate}T${arrivalTime}`);
            }
            else if (arrivalDate) {
                customCheckInTime = new Date(arrivalDate);
            }
            const checkIn = await CheckInRepository_1.CheckInRepository.createWalkIn({
                customerId: resolvedCustomerId,
                roomIds: roomIdsToAllocate,
                numberOfGuests: Number(numberOfGuests || 1),
                checkInTime: customCheckInTime,
                expectedCheckOutDate: expectedCheckOutDate ? new Date(expectedCheckOutDate) : undefined,
                advancePaid: Number(advancePaid || 0),
                remainingAmount: Number(remainingAmount || 0),
                paymentMethod,
                registrationNumber,
                pricePerNight: Number(pricePerNight || 0),
            });
            if (!checkIn) {
                return next(new errorHandler_1.AppError(500, 'Walk-in check-in failed.'));
            }
            // Send greeting notification
            await NotificationService_1.NotificationService.sendCheckInReminder(checkIn.customer.fullName, checkIn.customer.mobileNumber, checkIn.room.roomNumber);
            // Audit log
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Customer Check-in',
                ipAddress: req.ip,
                details: { checkInId: checkIn.id, roomNumbers: roomIdsToAllocate.length },
            });
            res.status(201).json({
                success: true,
                data: checkIn,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async checkInBooking(req, res, next) {
        const { bookingId, numberOfRooms, // Added to ask for number of rooms
        arrivalDate, arrivalTime, expectedCheckOutDate, numberOfGuests, advancePaid, remainingAmount, paymentMethod, registrationNumber, pricePerNight, } = req.body;
        if (!bookingId) {
            return next(new errorHandler_1.AppError(400, 'Booking ID is required.'));
        }
        try {
            const booking = await db_1.default.booking.findUnique({ where: { id: bookingId } });
            if (!booking) {
                return next(new errorHandler_1.AppError(404, 'Booking not found.'));
            }
            if (registrationNumber) {
                const existingReg = await db_1.default.checkIn.findFirst({
                    where: {
                        OR: [
                            { registrationNumber: registrationNumber },
                            { registrationNumber: { startsWith: `${registrationNumber}-` } }
                        ]
                    }
                });
                if (existingReg) {
                    return next(new errorHandler_1.AppError(400, `Registration number '${registrationNumber}' is already in use.`));
                }
            }
            const requestedRoomsCount = Math.max(1, Number(numberOfRooms || 1));
            const availableRooms = await RoomRepository_1.RoomRepository.getAll({ status: 'AVAILABLE' });
            const bookingRoom = await RoomRepository_1.RoomRepository.findById(booking.roomId);
            if (!bookingRoom) {
                return next(new errorHandler_1.AppError(404, 'Room associated with the booking not found.'));
            }
            if (bookingRoom.status !== 'AVAILABLE' && bookingRoom.status !== 'ADVANCE_BOOKED') {
                return next(new errorHandler_1.AppError(400, `Room ${bookingRoom.roomNumber} is currently ${bookingRoom.status.toLowerCase().replace('_', ' ')}. Please edit the booking to select a different room first.`));
            }
            const isBookingRoomAvailable = bookingRoom.status === 'AVAILABLE';
            const neededFreeRooms = isBookingRoomAvailable ? requestedRoomsCount : requestedRoomsCount - 1;
            const totalFreeRoomsCount = isBookingRoomAvailable ? availableRooms.length : availableRooms.length + 1;
            if (availableRooms.length < neededFreeRooms) {
                return next(new errorHandler_1.AppError(400, `Not enough rooms are free. Only ${totalFreeRoomsCount} rooms are currently free.`));
            }
            // Compile allocation list
            const roomIdsToAllocate = [booking.roomId];
            const otherFreeRooms = availableRooms.filter((r) => r.id !== booking.roomId);
            for (let i = 0; i < requestedRoomsCount - 1; i++) {
                if (otherFreeRooms[i]) {
                    roomIdsToAllocate.push(otherFreeRooms[i].id);
                }
            }
            // Build custom checkInTime Date object if provided
            let customCheckInTime = undefined;
            if (arrivalDate && arrivalTime) {
                customCheckInTime = new Date(`${arrivalDate}T${arrivalTime}`);
            }
            else if (arrivalDate) {
                customCheckInTime = new Date(arrivalDate);
            }
            const checkIn = await CheckInRepository_1.CheckInRepository.createFromBooking({
                bookingId,
                roomIds: roomIdsToAllocate,
                numberOfGuests: Number(numberOfGuests || 1),
                checkInTime: customCheckInTime,
                expectedCheckOutDate: expectedCheckOutDate ? new Date(expectedCheckOutDate) : undefined,
                advancePaid: Number(advancePaid || 0),
                remainingAmount: Number(remainingAmount || 0),
                paymentMethod,
                registrationNumber,
                pricePerNight: pricePerNight !== undefined ? Number(pricePerNight) : undefined,
            });
            if (!checkIn) {
                return next(new errorHandler_1.AppError(500, 'Check-in from booking failed.'));
            }
            // Send checkin confirmation
            await NotificationService_1.NotificationService.sendCheckInReminder(checkIn.customer.fullName, checkIn.customer.mobileNumber, checkIn.room.roomNumber);
            // Audit log
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Customer Check-in',
                ipAddress: req.ip,
                details: { checkInId: checkIn.id, bookingId, roomNumbers: roomIdsToAllocate.length },
            });
            res.status(201).json({
                success: true,
                data: checkIn,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async previewBill(req, res, next) {
        const checkInId = req.params.checkInId;
        try {
            const checkIn = await CheckInRepository_1.CheckInRepository.findById(checkInId);
            if (!checkIn || checkIn.status !== 'ACTIVE') {
                return next(new errorHandler_1.AppError(404, 'No active stay record found.'));
            }
            const additionalCharges = Number(req.query.additionalCharges || 0);
            const discount = 0; // Force 0 discount
            const taxRate = Number(req.query.taxRate !== undefined ? req.query.taxRate : 0.0); // Default to 0.0 (no tax)
            const checkoutDate = req.query.checkoutDate;
            const checkoutTime = req.query.checkoutTime;
            let checkoutTimeObj = new Date();
            if (checkoutDate && checkoutTime) {
                checkoutTimeObj = new Date(`${checkoutDate}T${checkoutTime}`);
            }
            else if (checkoutDate) {
                checkoutTimeObj = new Date(checkoutDate);
            }
            // Fetch all active stays for the same customer
            const activeStays = await db_1.default.checkIn.findMany({
                where: {
                    customerId: checkIn.customerId,
                    status: 'ACTIVE',
                },
                include: {
                    room: true,
                    customer: true,
                },
            });
            let totalRoomCharges = 0;
            let totalNights = 0;
            let totalAdvancePaid = 0;
            const stayDetails = activeStays.map((stay) => {
                const calc = InvoiceService_1.InvoiceService.calculateStayBill({
                    pricePerNight: stay.pricePerNight,
                    checkInTime: stay.checkInTime,
                    expectedCheckOutDate: checkoutTimeObj,
                    additionalCharges: 0,
                    discount: 0,
                    taxRate: 0,
                });
                totalRoomCharges += calc.roomCharges;
                totalNights = Math.max(totalNights, calc.nights);
                totalAdvancePaid += stay.advancePaid;
                return {
                    id: stay.id,
                    roomNumber: stay.room.roomNumber,
                    roomType: stay.room.capacity > 2 ? 'Deluxe' : 'Standard',
                    pricePerNight: stay.pricePerNight,
                    nights: calc.nights,
                    roomCharges: calc.roomCharges,
                    advancePaid: stay.advancePaid,
                };
            });
            const subtotal = totalRoomCharges + additionalCharges - discount;
            const taxAmount = subtotal * taxRate;
            const finalAmount = Math.max(0, subtotal + taxAmount);
            res.status(200).json({
                success: true,
                data: {
                    checkIn,
                    allStays: activeStays,
                    calculations: {
                        nights: totalNights,
                        roomCharges: totalRoomCharges,
                        subtotal,
                        taxAmount,
                        finalAmount,
                        advancePaid: totalAdvancePaid,
                        stayDetails,
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async checkout(req, res, next) {
        const { checkInId, additionalCharges, discount: dummyDiscount, // ignore and rename
        taxRate, paymentMethod, notes, checkoutDate, checkoutTime, } = req.body;
        const discount = 0; // Force 0 discount
        if (!checkInId || !paymentMethod) {
            return next(new errorHandler_1.AppError(400, 'CheckIn ID and payment method are required.'));
        }
        try {
            const checkIn = await CheckInRepository_1.CheckInRepository.findById(checkInId);
            if (!checkIn || checkIn.status !== 'ACTIVE') {
                return next(new errorHandler_1.AppError(400, 'Stay record is not active or already checked out.'));
            }
            let checkoutTimeObj = new Date();
            if (checkoutDate && checkoutTime) {
                checkoutTimeObj = new Date(`${checkoutDate}T${checkoutTime}`);
            }
            else if (checkoutDate) {
                checkoutTimeObj = new Date(checkoutDate);
            }
            // Fetch all active stays for the same customer
            const activeStays = await db_1.default.checkIn.findMany({
                where: {
                    customerId: checkIn.customerId,
                    status: 'ACTIVE',
                },
                include: {
                    room: true,
                },
            });
            // Checkout each active stay in a loop
            const checkoutRecords = [];
            let aggregateAmount = 0;
            for (const stay of activeStays) {
                const isPrimary = stay.id === checkInId;
                // Calculate stay bill for this specific room
                const roomBill = InvoiceService_1.InvoiceService.calculateStayBill({
                    pricePerNight: stay.pricePerNight,
                    checkInTime: stay.checkInTime,
                    expectedCheckOutDate: checkoutTimeObj,
                    additionalCharges: isPrimary ? Number(additionalCharges || 0) : 0,
                    discount: 0,
                    taxRate: Number(taxRate !== undefined ? taxRate : 0.0),
                });
                // Checkout stay
                const checkoutRecord = await CheckoutRepository_1.CheckoutRepository.create({
                    checkInId: stay.id,
                    roomCharges: roomBill.roomCharges,
                    additionalCharges: isPrimary ? Number(additionalCharges || 0) : 0,
                    discount: 0,
                    taxAmount: roomBill.taxAmount,
                    finalAmount: roomBill.finalAmount,
                    paymentMethod,
                    notes: isPrimary ? notes : `Multi-room checkout aggregate stay`,
                    actualCheckOutTime: checkoutTimeObj,
                });
                if (!checkoutRecord) {
                    return next(new errorHandler_1.AppError(500, `Checkout for Room ${stay.room.roomNumber} failed.`));
                }
                // Generate invoice HTML file and update path
                const invoiceUrl = await InvoiceService_1.InvoiceService.generateInvoiceHTML(checkoutRecord.id);
                await db_1.default.invoice.update({
                    where: { checkoutId: checkoutRecord.id },
                    data: { pdfUrl: invoiceUrl },
                });
                aggregateAmount += roomBill.finalAmount;
                checkoutRecords.push({
                    roomId: stay.roomId,
                    roomNumber: stay.room.roomNumber,
                    checkoutId: checkoutRecord.id,
                    invoiceUrl,
                });
            }
            // Send checkout receipt notification
            await NotificationService_1.NotificationService.sendPaymentReceipt(checkIn.customer.fullName, checkIn.customer.mobileNumber, aggregateAmount, `INV-${checkoutRecords[0].checkoutId.substring(0, 8).toUpperCase()}`);
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Payment Collected',
                ipAddress: req.ip,
                details: { checkoutStaysCount: activeStays.length, customerId: checkIn.customerId },
            });
            res.status(200).json({
                success: true,
                data: {
                    checkout: checkoutRecords[0], // primary checkout
                    allCheckouts: checkoutRecords,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async collectPartialPayment(req, res, next) {
        const { checkInId, bookingId, amount, paymentMethod, notes } = req.body;
        if (!amount || !paymentMethod) {
            return next(new errorHandler_1.AppError(400, 'Payment amount and method are required.'));
        }
        try {
            const payment = await PaymentRepository_1.PaymentRepository.create({
                checkInId,
                bookingId,
                amount: Number(amount),
                paymentType: 'PARTIAL',
                paymentMethod,
                transactionId: `TXN-${Math.round(Math.random() * 10000000)}`,
                notes,
            });
            // Audit log
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Payment Collected',
                ipAddress: req.ip,
                details: { paymentId: payment.id, amount },
            });
            res.status(200).json({
                success: true,
                data: payment,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getPaymentLedger(req, res, next) {
        try {
            const payments = await PaymentRepository_1.PaymentRepository.getAll();
            res.status(200).json({
                success: true,
                data: payments,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.CheckoutController = CheckoutController;
