"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class BookingRepository {
    static async findById(id) {
        return db_1.default.booking.findUnique({
            where: { id },
            include: {
                customer: true,
                room: true,
                payments: true,
                checkInRecord: true,
            },
        });
    }
    static async findByBookingNumber(bookingNumber) {
        return db_1.default.booking.findUnique({
            where: { bookingNumber },
            include: {
                customer: true,
                room: true,
            },
        });
    }
    static async getAll(filters) {
        const bookingWhereClause = {};
        const checkInWhereClause = { bookingId: null };
        if (filters?.status) {
            bookingWhereClause.status = filters.status;
            if (filters.status === 'CHECKED_IN') {
                checkInWhereClause.status = 'ACTIVE';
            }
            else if (filters.status === 'CHECKED_OUT') {
                checkInWhereClause.status = 'CHECKED_OUT';
            }
            else {
                checkInWhereClause.status = 'IMPOSSIBLE_STATUS';
            }
        }
        if (filters?.search) {
            const q = filters.search;
            bookingWhereClause.OR = [
                { bookingNumber: { contains: q } },
                { customer: { fullName: { contains: q } } },
                { customer: { mobileNumber: { contains: q } } },
                { room: { roomNumber: { contains: q } } },
            ];
            checkInWhereClause.OR = [
                { customer: { fullName: { contains: q } } },
                { customer: { mobileNumber: { contains: q } } },
                { room: { roomNumber: { contains: q } } },
            ];
        }
        const [bookings, checkIns] = await Promise.all([
            db_1.default.booking.findMany({
                where: bookingWhereClause,
                include: {
                    customer: true,
                    room: true,
                    checkInRecord: true,
                },
                orderBy: { checkInDate: 'asc' },
            }),
            db_1.default.checkIn.findMany({
                where: checkInWhereClause,
                include: {
                    customer: true,
                    room: true,
                },
                orderBy: { checkInTime: 'asc' },
            })
        ]);
        const mappedBookings = bookings.map(b => ({
            ...b,
            registrationNumber: b.checkInRecord?.registrationNumber || null,
        }));
        const mappedCheckIns = checkIns.map(c => ({
            id: c.id,
            bookingNumber: `HF-W-${c.id.substring(0, 6).toUpperCase()}`,
            checkInDate: c.checkInTime,
            checkOutDate: c.actualCheckOutTime || c.expectedCheckOutDate,
            numberOfGuests: c.numberOfGuests,
            advancePayment: c.advancePaid,
            price: c.remainingAmount + c.advancePaid,
            status: c.status === 'ACTIVE' ? 'CHECKED_IN' : 'CHECKED_OUT',
            notes: 'Walk-in Stay',
            customerId: c.customerId,
            roomId: c.roomId,
            customer: c.customer,
            room: c.room,
            registrationNumber: c.registrationNumber,
        }));
        const allRecords = [...mappedBookings, ...mappedCheckIns];
        allRecords.sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());
        return allRecords;
    }
    static async search(query) {
        return db_1.default.booking.findMany({
            where: {
                OR: [
                    { bookingNumber: { contains: query } },
                    { customer: { fullName: { contains: query } } },
                    { customer: { mobileNumber: { contains: query } } },
                ],
            },
            include: {
                customer: true,
                room: true,
            },
        });
    }
    static async create(data) {
        const bookingNumber = `HF-B-${Math.round(Math.random() * 1000000)}`;
        return db_1.default.$transaction(async (tx) => {
            const booking = await tx.booking.create({
                data: {
                    bookingNumber,
                    customerId: data.customerId,
                    roomId: data.roomId,
                    checkInDate: new Date(data.checkInDate),
                    checkOutDate: new Date(data.checkOutDate),
                    numberOfGuests: data.numberOfGuests,
                    advancePayment: data.advancePayment,
                    price: data.price,
                    status: 'CONFIRMED',
                    notes: data.notes || null,
                },
            });
            // If advance payment is collected, create a payment record
            if (data.advancePayment > 0) {
                await tx.payment.create({
                    data: {
                        bookingId: booking.id,
                        amount: data.advancePayment,
                        paymentType: 'ADVANCE',
                        paymentMethod: 'Cash', // Default
                        paymentStatus: 'PAID',
                        notes: 'Advance Booking Payment',
                    },
                });
            }
            return tx.booking.findUnique({
                where: { id: booking.id },
                include: { customer: true, room: true },
            });
        });
    }
    static async update(id, data) {
        return db_1.default.$transaction(async (tx) => {
            const oldBooking = await tx.booking.findUnique({
                where: { id },
                include: { customer: true }
            });
            if (!oldBooking) {
                // Check if this is a legacy walk-in stay (CheckIn record with bookingId = null)
                const oldCheckIn = await tx.checkIn.findUnique({
                    where: { id },
                    include: { customer: true }
                });
                if (!oldCheckIn)
                    throw new Error('Record not found');
                // 1. Update customer details if provided
                if (data.customerName !== undefined ||
                    data.mobileNumber !== undefined ||
                    data.address !== undefined ||
                    data.city !== undefined ||
                    data.state !== undefined ||
                    data.country !== undefined ||
                    data.pincode !== undefined) {
                    const custUpdates = {};
                    if (data.customerName !== undefined)
                        custUpdates.fullName = data.customerName;
                    if (data.mobileNumber !== undefined)
                        custUpdates.mobileNumber = data.mobileNumber;
                    if (data.address !== undefined)
                        custUpdates.address = data.address;
                    if (data.city !== undefined)
                        custUpdates.city = data.city;
                    if (data.state !== undefined)
                        custUpdates.state = data.state;
                    if (data.country !== undefined)
                        custUpdates.country = data.country;
                    if (data.pincode !== undefined)
                        custUpdates.pincode = data.pincode;
                    await tx.customer.update({
                        where: { id: oldCheckIn.customerId },
                        data: custUpdates,
                    });
                }
                // 2. Validate room status if room is changing
                if (data.roomId && data.roomId !== oldCheckIn.roomId) {
                    const activeStay = await tx.checkIn.findFirst({
                        where: { roomId: data.roomId, status: 'ACTIVE' },
                        include: { room: true }
                    });
                    if (activeStay) {
                        throw new Error(`Room ${activeStay.room.roomNumber} is currently occupied.`);
                    }
                }
                // 3. Update CheckIn record
                const checkInUpdates = {};
                if (data.roomId !== undefined)
                    checkInUpdates.roomId = data.roomId;
                if (data.numberOfGuests !== undefined)
                    checkInUpdates.numberOfGuests = Number(data.numberOfGuests);
                if (data.checkInDate !== undefined)
                    checkInUpdates.checkInTime = new Date(data.checkInDate);
                if (data.checkOutDate !== undefined)
                    checkInUpdates.expectedCheckOutDate = new Date(data.checkOutDate);
                if (data.advancePayment !== undefined)
                    checkInUpdates.advancePaid = Number(data.advancePayment);
                if (data.registrationNumber !== undefined)
                    checkInUpdates.registrationNumber = data.registrationNumber;
                if (data.price !== undefined ||
                    data.advancePayment !== undefined ||
                    data.checkInDate !== undefined ||
                    data.checkOutDate !== undefined) {
                    const checkInTime = data.checkInDate ? new Date(data.checkInDate) : oldCheckIn.checkInTime;
                    const checkOutTime = data.checkOutDate ? new Date(data.checkOutDate) : (oldCheckIn.actualCheckOutTime || oldCheckIn.expectedCheckOutDate);
                    const diffMs = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
                    const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    const finalPrice = data.price !== undefined ? Number(data.price) : oldCheckIn.pricePerNight;
                    const finalAdvance = data.advancePayment !== undefined ? Number(data.advancePayment) : oldCheckIn.advancePaid;
                    checkInUpdates.pricePerNight = finalPrice;
                    checkInUpdates.remainingAmount = Math.max(0, (finalPrice * nights) - finalAdvance);
                }
                const updatedCheckIn = await tx.checkIn.update({
                    where: { id },
                    data: checkInUpdates,
                    include: { customer: true, room: true }
                });
                // Return mapped to Booking schema
                return {
                    id: updatedCheckIn.id,
                    bookingNumber: `HF-W-${updatedCheckIn.id.substring(0, 6).toUpperCase()}`,
                    checkInDate: updatedCheckIn.checkInTime,
                    checkOutDate: updatedCheckIn.actualCheckOutTime || updatedCheckIn.expectedCheckOutDate,
                    numberOfGuests: updatedCheckIn.numberOfGuests,
                    advancePayment: updatedCheckIn.advancePaid,
                    price: updatedCheckIn.remainingAmount + updatedCheckIn.advancePaid,
                    status: updatedCheckIn.status === 'ACTIVE' ? 'CHECKED_IN' : 'CHECKED_OUT',
                    notes: 'Walk-in Stay',
                    customerId: updatedCheckIn.customerId,
                    roomId: updatedCheckIn.roomId,
                    customer: updatedCheckIn.customer,
                    room: updatedCheckIn.room,
                    registrationNumber: updatedCheckIn.registrationNumber,
                };
            }
            // 1. Update customer details if provided
            if (data.customerName !== undefined ||
                data.mobileNumber !== undefined ||
                data.address !== undefined ||
                data.city !== undefined ||
                data.state !== undefined ||
                data.country !== undefined ||
                data.pincode !== undefined) {
                const custUpdates = {};
                if (data.customerName !== undefined)
                    custUpdates.fullName = data.customerName;
                if (data.mobileNumber !== undefined)
                    custUpdates.mobileNumber = data.mobileNumber;
                if (data.address !== undefined)
                    custUpdates.address = data.address;
                if (data.city !== undefined)
                    custUpdates.city = data.city;
                if (data.state !== undefined)
                    custUpdates.state = data.state;
                if (data.country !== undefined)
                    custUpdates.country = data.country;
                if (data.pincode !== undefined)
                    custUpdates.pincode = data.pincode;
                await tx.customer.update({
                    where: { id: oldBooking.customerId },
                    data: custUpdates,
                });
            }
            // 2. Validate room status if room is changing
            if (data.roomId && data.roomId !== oldBooking.roomId) {
                const activeStay = await tx.checkIn.findFirst({
                    where: { roomId: data.roomId, status: 'ACTIVE' },
                    include: { room: true }
                });
                if (activeStay) {
                    throw new Error(`Room ${activeStay.room.roomNumber} is currently occupied.`);
                }
            }
            // 3. Perform Booking Update
            const bookingUpdates = {};
            if (data.checkInDate !== undefined)
                bookingUpdates.checkInDate = new Date(data.checkInDate);
            if (data.checkOutDate !== undefined)
                bookingUpdates.checkOutDate = new Date(data.checkOutDate);
            if (data.numberOfGuests !== undefined)
                bookingUpdates.numberOfGuests = Number(data.numberOfGuests);
            if (data.advancePayment !== undefined)
                bookingUpdates.advancePayment = Number(data.advancePayment);
            if (data.price !== undefined)
                bookingUpdates.price = Number(data.price);
            if (data.roomId !== undefined)
                bookingUpdates.roomId = data.roomId;
            if (data.status !== undefined)
                bookingUpdates.status = data.status;
            if (data.notes !== undefined)
                bookingUpdates.notes = data.notes;
            const updated = await tx.booking.update({
                where: { id },
                data: bookingUpdates,
            });
            // 5. Cascade updates to active CheckIn records if booking is currently checked-in
            const activeCheckIn = await tx.checkIn.findUnique({
                where: { bookingId: id },
            });
            if (activeCheckIn && activeCheckIn.status === 'ACTIVE') {
                const checkInUpdates = {};
                if (data.roomId !== undefined)
                    checkInUpdates.roomId = data.roomId;
                if (data.numberOfGuests !== undefined)
                    checkInUpdates.numberOfGuests = Number(data.numberOfGuests);
                if (data.checkInDate !== undefined)
                    checkInUpdates.checkInTime = new Date(data.checkInDate);
                if (data.checkOutDate !== undefined)
                    checkInUpdates.expectedCheckOutDate = new Date(data.checkOutDate);
                if (data.advancePayment !== undefined)
                    checkInUpdates.advancePaid = Number(data.advancePayment);
                if (data.registrationNumber !== undefined)
                    checkInUpdates.registrationNumber = data.registrationNumber;
                if (data.price !== undefined ||
                    data.advancePayment !== undefined ||
                    data.checkInDate !== undefined ||
                    data.checkOutDate !== undefined) {
                    const checkInTime = data.checkInDate ? new Date(data.checkInDate) : activeCheckIn.checkInTime;
                    const checkOutTime = data.checkOutDate ? new Date(data.checkOutDate) : activeCheckIn.expectedCheckOutDate;
                    const diffMs = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
                    const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                    const finalPrice = data.price !== undefined ? Number(data.price) : activeCheckIn.pricePerNight;
                    const finalAdvance = data.advancePayment !== undefined ? Number(data.advancePayment) : activeCheckIn.advancePaid;
                    checkInUpdates.pricePerNight = finalPrice;
                    checkInUpdates.remainingAmount = Math.max(0, (finalPrice * nights) - finalAdvance);
                }
                if (Object.keys(checkInUpdates).length > 0) {
                    await tx.checkIn.update({
                        where: { id: activeCheckIn.id },
                        data: checkInUpdates,
                    });
                }
            }
            return tx.booking.findUnique({
                where: { id },
                include: { customer: true, room: true },
            });
        });
    }
}
exports.BookingRepository = BookingRepository;
