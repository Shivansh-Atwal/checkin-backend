"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StayService = void 0;
const db_1 = __importDefault(require("../config/db"));
const CheckInRepository_1 = require("../repositories/CheckInRepository");
const CheckoutRepository_1 = require("../repositories/CheckoutRepository");
const PaymentRepository_1 = require("../repositories/PaymentRepository");
const RoomRepository_1 = require("../repositories/RoomRepository");
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const RedisService_1 = require("./RedisService");
const NotificationService_1 = require("./NotificationService");
const AuditLogService_1 = require("./AuditLogService");
const InvoiceService_1 = require("./InvoiceService");
const errorHandler_1 = require("../middleware/errorHandler");
class StayService {
    static async checkInWalkIn(data, context = {}) {
        // 1. Database Operations in Transaction
        const checkIn = await db_1.default.$transaction(async (tx) => {
            let resolvedCustomerId = data.customerId;
            if (!resolvedCustomerId) {
                const customerName = data.customerName;
                const mobileNumber = data.mobileNumber;
                if (!customerName || !mobileNumber) {
                    throw new errorHandler_1.AppError(400, 'Customer name and mobile number are required for new profiles.');
                }
                let existingCust = await CustomerRepository_1.CustomerRepository.findByMobile(mobileNumber, tx);
                if (!existingCust) {
                    const newCust = await CustomerRepository_1.CustomerRepository.create({
                        fullName: customerName,
                        mobileNumber: mobileNumber,
                        address: data.address,
                        city: data.city,
                        state: data.state,
                        country: data.country,
                        pincode: data.pincode,
                        document: data.document,
                    }, tx);
                    existingCust = newCust;
                }
                else {
                    await CustomerRepository_1.CustomerRepository.update(existingCust.id, {
                        address: data.address || existingCust.address || undefined,
                        city: data.city || existingCust.city || undefined,
                        state: data.state || existingCust.state || undefined,
                        country: data.country || existingCust.country || undefined,
                        pincode: data.pincode || existingCust.pincode || undefined,
                        document: data.document,
                    }, tx);
                }
                resolvedCustomerId = existingCust.id;
            }
            if (data.registrationNumber) {
                const existingReg = await tx.checkIn.findFirst({
                    where: {
                        OR: [
                            { registrationNumber: data.registrationNumber },
                            { registrationNumber: { startsWith: `${data.registrationNumber}-` } }
                        ]
                    }
                });
                if (existingReg) {
                    throw new errorHandler_1.AppError(400, `Registration number '${data.registrationNumber}' is already in use.`);
                }
            }
            let roomIdsToAllocate = [];
            if (data.roomIds && Array.isArray(data.roomIds) && data.roomIds.length > 0) {
                roomIdsToAllocate = data.roomIds;
            }
            else {
                const requestedRoomsCount = Math.max(1, Number(data.numberOfRooms || 1));
                const availableRooms = await RoomRepository_1.RoomRepository.getAll({ status: 'AVAILABLE' }, tx);
                let primaryRoomId = data.roomId;
                if (!primaryRoomId) {
                    if (availableRooms.length === 0) {
                        throw new errorHandler_1.AppError(400, 'No rooms are currently available.');
                    }
                    primaryRoomId = availableRooms[0].id;
                }
                const primaryRoomIdStr = primaryRoomId;
                const room = await RoomRepository_1.RoomRepository.findById(primaryRoomIdStr, tx);
                if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
                    throw new errorHandler_1.AppError(400, 'Selected room is not available.');
                }
                const isSelectedRoomAvailable = room.status === 'AVAILABLE';
                const neededFreeRooms = isSelectedRoomAvailable ? requestedRoomsCount : requestedRoomsCount - 1;
                if (availableRooms.length < neededFreeRooms) {
                    throw new errorHandler_1.AppError(400, 'Not enough rooms are free.');
                }
                roomIdsToAllocate = [primaryRoomIdStr];
                const otherFreeRooms = availableRooms.filter((r) => r.id !== primaryRoomIdStr);
                for (let i = 0; i < requestedRoomsCount - 1; i++) {
                    if (otherFreeRooms[i]) {
                        roomIdsToAllocate.push(otherFreeRooms[i].id);
                    }
                }
            }
            // Verify rooms
            for (const rId of roomIdsToAllocate) {
                const room = await RoomRepository_1.RoomRepository.findById(rId, tx);
                if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
                    throw new errorHandler_1.AppError(400, `Selected room ${room?.roomNumber || rId} is not available.`);
                }
            }
            let customCheckInTime = undefined;
            if (data.arrivalDate && data.arrivalTime) {
                customCheckInTime = new Date(`${data.arrivalDate}T${data.arrivalTime}`);
            }
            else if (data.arrivalDate) {
                customCheckInTime = new Date(data.arrivalDate);
            }
            return CheckInRepository_1.CheckInRepository.createWalkIn({
                customerId: resolvedCustomerId,
                roomIds: roomIdsToAllocate,
                numberOfGuests: Number(data.numberOfGuests || 1),
                checkInTime: customCheckInTime,
                expectedCheckOutDate: data.expectedCheckOutDate ? new Date(data.expectedCheckOutDate) : undefined,
                advancePaid: Number(data.advancePaid || 0),
                remainingAmount: Number(data.remainingAmount || 0),
                paymentMethod: data.paymentMethod,
                registrationNumber: data.registrationNumber,
                pricePerNight: Number(data.pricePerNight || 0),
                roomPrices: data.roomPrices,
                extraBedsCount: Number(data.extraBedsCount || 0),
                extraBedPrice: Number(data.extraBedPrice || 0),
            }, tx);
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        if (!checkIn) {
            throw new errorHandler_1.AppError(500, 'Walk-in check-in failed.');
        }
        // 2. Non-blocking Post-save Background tasks
        Promise.allSettled([
            NotificationService_1.NotificationService.sendCheckInReminder(checkIn.customer.fullName, checkIn.customer.mobileNumber, checkIn.room.roomNumber),
            AuditLogService_1.AuditLogService.log({
                userId: context.userId,
                userName: context.userName,
                action: 'Customer Check-in',
                ipAddress: context.ipAddress,
                deviceInformation: context.deviceInformation,
                details: { checkInId: checkIn.id, roomIds: data.roomIds || [data.roomId] },
            }),
            RedisService_1.RedisService.invalidateDashboardStats(),
        ]).catch((err) => {
            console.warn('Background tasks failed after walk-in check-in:', err);
        });
        return checkIn;
    }
    static async checkInBooking(data, context = {}) {
        const checkIn = await db_1.default.$transaction(async (tx) => {
            const booking = await tx.booking.findUnique({ where: { id: data.bookingId } });
            if (!booking) {
                throw new errorHandler_1.AppError(404, 'Booking not found.');
            }
            // Update customer details if provided
            if (data.address || data.city || data.state || data.country || data.pincode || data.document) {
                await CustomerRepository_1.CustomerRepository.update(booking.customerId, {
                    address: data.address || undefined,
                    city: data.city || undefined,
                    state: data.state || undefined,
                    country: data.country || undefined,
                    pincode: data.pincode || undefined,
                    document: data.document,
                }, tx);
            }
            if (data.registrationNumber) {
                const existingReg = await tx.checkIn.findFirst({
                    where: {
                        OR: [
                            { registrationNumber: data.registrationNumber },
                            { registrationNumber: { startsWith: `${data.registrationNumber}-` } }
                        ]
                    }
                });
                if (existingReg) {
                    throw new errorHandler_1.AppError(400, `Registration number '${data.registrationNumber}' is already in use.`);
                }
            }
            let roomIdsToAllocate = [];
            if (data.roomIds && Array.isArray(data.roomIds) && data.roomIds.length > 0) {
                roomIdsToAllocate = data.roomIds;
            }
            else {
                const requestedRoomsCount = Math.max(1, Number(data.numberOfRooms || 1));
                const availableRooms = await RoomRepository_1.RoomRepository.getAll({ status: 'AVAILABLE' }, tx);
                const bookingRoom = await RoomRepository_1.RoomRepository.findById(booking.roomId, tx);
                if (!bookingRoom) {
                    throw new errorHandler_1.AppError(404, 'Room associated with the booking not found.');
                }
                if (bookingRoom.status !== 'AVAILABLE' && bookingRoom.status !== 'ADVANCE_BOOKED') {
                    throw new errorHandler_1.AppError(400, `Room ${bookingRoom.roomNumber} is currently occupied.`);
                }
                roomIdsToAllocate = [booking.roomId];
                const otherFreeRooms = availableRooms.filter((r) => r.id !== booking.roomId);
                for (let i = 0; i < requestedRoomsCount - 1; i++) {
                    if (otherFreeRooms[i]) {
                        roomIdsToAllocate.push(otherFreeRooms[i].id);
                    }
                }
            }
            // Verify rooms
            for (const rId of roomIdsToAllocate) {
                const room = await RoomRepository_1.RoomRepository.findById(rId, tx);
                if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
                    throw new errorHandler_1.AppError(400, `Selected room ${room?.roomNumber || rId} is not available.`);
                }
            }
            let customCheckInTime = undefined;
            if (data.arrivalDate && data.arrivalTime) {
                customCheckInTime = new Date(`${data.arrivalDate}T${data.arrivalTime}`);
            }
            else if (data.arrivalDate) {
                customCheckInTime = new Date(data.arrivalDate);
            }
            return CheckInRepository_1.CheckInRepository.createFromBooking({
                bookingId: data.bookingId,
                roomIds: roomIdsToAllocate,
                numberOfGuests: Number(data.numberOfGuests || 1),
                checkInTime: customCheckInTime,
                expectedCheckOutDate: data.expectedCheckOutDate ? new Date(data.expectedCheckOutDate) : undefined,
                advancePaid: Number(data.advancePaid || 0),
                remainingAmount: Number(data.remainingAmount || 0),
                paymentMethod: data.paymentMethod,
                registrationNumber: data.registrationNumber,
                pricePerNight: data.pricePerNight !== undefined ? Number(data.pricePerNight) : undefined,
                roomPrices: data.roomPrices,
                extraBedsCount: data.extraBedsCount !== undefined ? Number(data.extraBedsCount) : undefined,
                extraBedPrice: data.extraBedPrice !== undefined ? Number(data.extraBedPrice) : undefined,
            }, tx);
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        if (!checkIn) {
            throw new errorHandler_1.AppError(500, 'Check-in from booking failed.');
        }
        // Post-save background tasks
        Promise.allSettled([
            NotificationService_1.NotificationService.sendCheckInReminder(checkIn.customer.fullName, checkIn.customer.mobileNumber, checkIn.room.roomNumber),
            AuditLogService_1.AuditLogService.log({
                userId: context.userId,
                userName: context.userName,
                action: 'Customer Check-in',
                ipAddress: context.ipAddress,
                deviceInformation: context.deviceInformation,
                details: { checkInId: checkIn.id, bookingId: data.bookingId, roomIds: data.roomIds || [checkIn.roomId] },
            }),
            RedisService_1.RedisService.invalidateDashboardStats(),
        ]).catch((err) => {
            console.warn('Background tasks failed after booking check-in:', err);
        });
        return checkIn;
    }
    static async addPreviousStay(data, context = {}) {
        const checkInTimeObj = new Date(`${data.arrivalDate}T${data.arrivalTime}`);
        const checkOutTimeObj = new Date(`${data.checkoutDate}T${data.checkoutTime}`);
        if (checkOutTimeObj.getTime() <= checkInTimeObj.getTime()) {
            throw new errorHandler_1.AppError(400, 'Check-out date/time must be after check-in date/time.');
        }
        const checkIn = await db_1.default.$transaction(async (tx) => {
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
                        address: data.address,
                        city: data.city,
                        state: data.state,
                        country: data.country,
                        pincode: data.pincode,
                        document: data.document,
                    }, tx);
                    existingCust = newCust;
                }
                else {
                    await CustomerRepository_1.CustomerRepository.update(existingCust.id, {
                        address: data.address || existingCust.address || undefined,
                        city: data.city || existingCust.city || undefined,
                        state: data.state || existingCust.state || undefined,
                        country: data.country || existingCust.country || undefined,
                        pincode: data.pincode || existingCust.pincode || undefined,
                        document: data.document,
                    }, tx);
                }
                resolvedCustomerId = existingCust.id;
            }
            if (data.registrationNumber) {
                const existingReg = await tx.checkIn.findFirst({
                    where: {
                        OR: [
                            { registrationNumber: data.registrationNumber },
                            { registrationNumber: { startsWith: `${data.registrationNumber}-` } }
                        ]
                    }
                });
                if (existingReg) {
                    throw new errorHandler_1.AppError(400, `Registration number '${data.registrationNumber}' is already in use.`);
                }
            }
            return CheckInRepository_1.CheckInRepository.createPreviousStay({
                customerId: resolvedCustomerId,
                roomIds: data.roomIds,
                numberOfGuests: Number(data.numberOfGuests || 1),
                checkInTime: checkInTimeObj,
                expectedCheckOutDate: checkOutTimeObj,
                advancePaid: Number(data.advancePaid || 0),
                remainingAmount: Number(data.remainingAmount || 0),
                paymentMethod: data.paymentMethod,
                registrationNumber: data.registrationNumber,
                pricePerNight: Number(data.pricePerNight || 0),
                roomPrices: data.roomPrices,
                extraBedsCount: Number(data.extraBedsCount || 0),
                extraBedPrice: Number(data.extraBedPrice || 0),
            }, tx);
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        if (!checkIn) {
            throw new errorHandler_1.AppError(500, 'Adding previous stay record failed.');
        }
        // Post-save background tasks (such as html generation & invoice pdf url updating)
        // Run outside of critical transaction
        (async () => {
            try {
                const createdCheckIns = await db_1.default.checkIn.findMany({
                    where: {
                        customerId: checkIn.customerId,
                        checkInTime: checkInTimeObj,
                        status: 'CHECKED_OUT',
                    },
                    include: {
                        checkoutRecord: true,
                    }
                });
                for (const ci of createdCheckIns) {
                    if (ci.checkoutRecord) {
                        try {
                            const invoiceUrl = await InvoiceService_1.InvoiceService.generateInvoiceHTML(ci.checkoutRecord.id);
                            await db_1.default.invoice.update({
                                where: { checkoutId: ci.checkoutRecord.id },
                                data: { pdfUrl: invoiceUrl },
                            });
                        }
                        catch (invErr) {
                            console.error('Failed to generate historical invoice:', invErr);
                        }
                    }
                }
            }
            catch (err) {
                console.error('Previous stay post-save tasks error:', err);
            }
        })();
        Promise.allSettled([
            AuditLogService_1.AuditLogService.log({
                userId: context.userId,
                userName: context.userName,
                action: 'Add Previous Stay',
                ipAddress: context.ipAddress,
                details: { checkInId: checkIn.id, roomIds: data.roomIds },
            }),
            RedisService_1.RedisService.invalidateDashboardStats(),
        ]).catch((err) => {
            console.warn('Background tasks failed after previous stay check-in:', err);
        });
        return checkIn;
    }
    static async checkout(data, context = {}) {
        let checkoutTimeObj = new Date();
        if (data.checkoutDate && data.checkoutTime) {
            checkoutTimeObj = new Date(`${data.checkoutDate}T${data.checkoutTime}`);
        }
        else if (data.checkoutDate) {
            checkoutTimeObj = new Date(data.checkoutDate);
        }
        // 1. Run database operations in transaction
        const { checkoutRecords, aggregateAmount, checkIn } = await db_1.default.$transaction(async (tx) => {
            const checkIn = await CheckInRepository_1.CheckInRepository.findById(data.checkInId, tx);
            if (!checkIn || checkIn.status !== 'ACTIVE') {
                throw new errorHandler_1.AppError(400, 'Stay record is not active or already checked out.');
            }
            // Fetch all active stays for the same customer to support grouped checkouts
            const activeStays = await tx.checkIn.findMany({
                where: {
                    customerId: checkIn.customerId,
                    status: 'ACTIVE',
                },
                include: {
                    room: true,
                    extraCharges: true,
                },
            });
            const checkoutRecords = [];
            let aggregateAmount = 0;
            for (const stay of activeStays) {
                const isPrimary = stay.id === data.checkInId;
                const diffMs = checkoutTimeObj.getTime() - new Date(stay.checkInTime).getTime();
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const nights = Math.max(1, diffDays);
                const extraBedCost = Number(stay.extraBedsCount || 0) * Number(stay.extraBedPrice || 0) * nights;
                const extraSum = (stay.extraCharges?.reduce((sum, item) => sum + item.amount, 0) || 0) + extraBedCost;
                const roomBill = InvoiceService_1.InvoiceService.calculateStayBill({
                    pricePerNight: stay.pricePerNight,
                    checkInTime: stay.checkInTime,
                    expectedCheckOutDate: checkoutTimeObj,
                    additionalCharges: extraSum,
                    discount: 0,
                    taxRate: Number(data.taxRate !== undefined ? data.taxRate : 0.0),
                });
                const checkoutRecord = await CheckoutRepository_1.CheckoutRepository.create({
                    checkInId: stay.id,
                    roomCharges: roomBill.roomCharges,
                    additionalCharges: extraSum,
                    discount: 0,
                    taxAmount: roomBill.taxAmount,
                    finalAmount: roomBill.finalAmount,
                    paymentMethod: data.paymentMethod,
                    notes: isPrimary ? data.notes : 'Multi-room checkout aggregate stay',
                    actualCheckOutTime: checkoutTimeObj,
                }, tx);
                if (!checkoutRecord) {
                    throw new errorHandler_1.AppError(500, `Checkout creation failed for stay ${stay.id}`);
                }
                aggregateAmount += roomBill.finalAmount;
                checkoutRecords.push({
                    id: checkoutRecord.id,
                    roomId: stay.roomId,
                    roomNumber: stay.room.roomNumber,
                });
            }
            return { checkoutRecords, aggregateAmount, checkIn };
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        // 2. Run post-save background tasks outside transaction
        (async () => {
            try {
                const finalRecords = [];
                for (const record of checkoutRecords) {
                    // Generate invoice HTML file asynchronously
                    const invoiceUrl = await InvoiceService_1.InvoiceService.generateInvoiceHTML(record.id);
                    await db_1.default.invoice.update({
                        where: { checkoutId: record.id },
                        data: { pdfUrl: invoiceUrl },
                    });
                    finalRecords.push({ ...record, invoiceUrl });
                }
                // Send payment receipt notification
                await NotificationService_1.NotificationService.sendPaymentReceipt(checkIn.customer.fullName, checkIn.customer.mobileNumber, aggregateAmount, `INV-${checkoutRecords[0].id.substring(0, 8).toUpperCase()}`);
                // Audit log
                await AuditLogService_1.AuditLogService.log({
                    userId: context.userId,
                    userName: context.userName,
                    action: 'Customer Checkout',
                    ipAddress: context.ipAddress,
                    details: { checkInId: data.checkInId, roomIds: checkoutRecords.map((r) => r.roomId) },
                });
                await RedisService_1.RedisService.invalidateDashboardStats();
            }
            catch (backgroundError) {
                console.error('Checkout post-save tasks error:', backgroundError);
            }
        })();
        return { checkoutRecords, aggregateAmount };
    }
    static async collectPartialPayment(data, context = {}) {
        const payment = await db_1.default.$transaction(async (tx) => {
            return PaymentRepository_1.PaymentRepository.create(data, tx);
        }, {
            timeout: 30000,
            maxWait: 10000,
        });
        // Background Tasks
        Promise.allSettled([
            RedisService_1.RedisService.invalidateDashboardStats(),
            AuditLogService_1.AuditLogService.log({
                userId: context.userId,
                userName: context.userName,
                action: 'Collect Payment',
                ipAddress: context.ipAddress,
                details: { checkInId: data.checkInId, bookingId: data.bookingId, amount: data.amount },
            }),
        ]).catch((err) => {
            console.warn('Background tasks failed after payment collection:', err);
        });
        return payment;
    }
}
exports.StayService = StayService;
