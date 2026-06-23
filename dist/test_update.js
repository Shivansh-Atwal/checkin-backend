"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BookingRepository_1 = require("./repositories/BookingRepository");
const db_1 = __importDefault(require("./config/db"));
async function run() {
    const bookingId = 'e2e726a3-0987-482c-be71-f7e667c661cd';
    console.log('--- BEFORE UPDATE ---');
    const bookingBefore = await db_1.default.booking.findUnique({
        where: { id: bookingId },
        include: { payments: true }
    });
    console.log('Booking:', JSON.stringify(bookingBefore, null, 2));
    const checkinBefore = await db_1.default.checkIn.findUnique({
        where: { bookingId },
        include: { payments: true, checkoutRecord: true }
    });
    console.log('Checkin:', JSON.stringify(checkinBefore, null, 2));
    console.log('\nUpdating price to 1200...');
    try {
        const updated = await BookingRepository_1.BookingRepository.update(bookingId, {
            price: 1200
        });
        console.log('Update return:', JSON.stringify(updated, null, 2));
    }
    catch (err) {
        console.error('Update error:', err.message);
    }
    console.log('\n--- AFTER UPDATE ---');
    const bookingAfter = await db_1.default.booking.findUnique({
        where: { id: bookingId },
        include: { payments: true }
    });
    console.log('Booking:', JSON.stringify(bookingAfter, null, 2));
    const checkinAfter = await db_1.default.checkIn.findUnique({
        where: { bookingId },
        include: { payments: true, checkoutRecord: true }
    });
    console.log('Checkin:', JSON.stringify(checkinAfter, null, 2));
}
run().finally(() => db_1.default.$disconnect());
