"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addExtraChargeSchema = exports.partialPaymentSchema = exports.checkoutSchema = exports.addPreviousStaySchema = exports.checkInBookingSchema = exports.checkInWalkInSchema = void 0;
const zod_1 = require("zod");
exports.checkInWalkInSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().uuid().optional().nullable(),
        customerName: zod_1.z.string().min(2).optional(),
        mobileNumber: zod_1.z.string().min(5).max(15).optional(),
        roomId: zod_1.z.string().uuid().optional(),
        roomIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
        numberOfGuests: zod_1.z.number().int().min(1).optional(),
        numberOfRooms: zod_1.z.number().int().min(1).optional(),
        arrivalDate: zod_1.z.string().optional().nullable(),
        arrivalTime: zod_1.z.string().optional().nullable(),
        expectedCheckOutDate: zod_1.z.string().optional().nullable(),
        advancePaid: zod_1.z.number().nonnegative().optional(),
        remainingAmount: zod_1.z.number().nonnegative().optional(),
        paymentMethod: zod_1.z.string().optional().nullable(),
        pincode: zod_1.z.string().optional().nullable(),
        state: zod_1.z.string().optional().nullable(),
        country: zod_1.z.string().optional().nullable(),
        address: zod_1.z.string().optional().nullable(),
        city: zod_1.z.string().optional().nullable(),
        registrationNumber: zod_1.z.string().optional().nullable(),
        pricePerNight: zod_1.z.number().nonnegative().optional(),
        roomPrices: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
        extraBedsCount: zod_1.z.number().int().nonnegative().optional(),
        extraBedPrice: zod_1.z.number().nonnegative().optional(),
        document: zod_1.z.object({
            idType: zod_1.z.string().optional(),
            idNumber: zod_1.z.string().optional(),
            frontImageUrl: zod_1.z.string().optional().nullable(),
            backImageUrl: zod_1.z.string().optional().nullable(),
            customerPhotoUrl: zod_1.z.string().optional().nullable(),
        }).optional(),
    }).refine(data => data.customerId || (data.customerName && data.mobileNumber), {
        message: "Either customerId or both customerName and mobileNumber must be provided",
        path: ["customerId"]
    })
});
exports.checkInBookingSchema = zod_1.z.object({
    body: zod_1.z.object({
        bookingId: zod_1.z.string().uuid(),
        numberOfRooms: zod_1.z.number().int().min(1).optional(),
        roomIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
        arrivalDate: zod_1.z.string().optional().nullable(),
        arrivalTime: zod_1.z.string().optional().nullable(),
        expectedCheckOutDate: zod_1.z.string().optional().nullable(),
        numberOfGuests: zod_1.z.number().int().min(1).optional(),
        advancePaid: zod_1.z.number().nonnegative().optional(),
        remainingAmount: zod_1.z.number().nonnegative().optional(),
        paymentMethod: zod_1.z.string().optional().nullable(),
        registrationNumber: zod_1.z.string().optional().nullable(),
        pricePerNight: zod_1.z.number().nonnegative().optional(),
        address: zod_1.z.string().optional().nullable(),
        city: zod_1.z.string().optional().nullable(),
        state: zod_1.z.string().optional().nullable(),
        country: zod_1.z.string().optional().nullable(),
        pincode: zod_1.z.string().optional().nullable(),
        roomPrices: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
        extraBedsCount: zod_1.z.number().int().nonnegative().optional(),
        extraBedPrice: zod_1.z.number().nonnegative().optional(),
        document: zod_1.z.object({
            idType: zod_1.z.string().optional(),
            idNumber: zod_1.z.string().optional(),
            frontImageUrl: zod_1.z.string().optional().nullable(),
            backImageUrl: zod_1.z.string().optional().nullable(),
            customerPhotoUrl: zod_1.z.string().optional().nullable(),
        }).optional(),
    })
});
exports.addPreviousStaySchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().uuid().optional().nullable(),
        customerName: zod_1.z.string().min(2).optional(),
        mobileNumber: zod_1.z.string().min(5).max(15).optional(),
        numberOfGuests: zod_1.z.number().int().min(1).optional(),
        arrivalDate: zod_1.z.string(),
        arrivalTime: zod_1.z.string(),
        checkoutDate: zod_1.z.string(),
        checkoutTime: zod_1.z.string(),
        advancePaid: zod_1.z.number().nonnegative().optional(),
        remainingAmount: zod_1.z.number().nonnegative().optional(),
        paymentMethod: zod_1.z.string().optional().nullable(),
        pincode: zod_1.z.string().optional().nullable(),
        state: zod_1.z.string().optional().nullable(),
        country: zod_1.z.string().optional().nullable(),
        address: zod_1.z.string().optional().nullable(),
        city: zod_1.z.string().optional().nullable(),
        registrationNumber: zod_1.z.string().optional().nullable(),
        pricePerNight: zod_1.z.number().nonnegative().optional(),
        roomIds: zod_1.z.array(zod_1.z.string().uuid()),
        roomPrices: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
        extraBedsCount: zod_1.z.number().int().nonnegative().optional(),
        extraBedPrice: zod_1.z.number().nonnegative().optional(),
        document: zod_1.z.object({
            idType: zod_1.z.string().optional(),
            idNumber: zod_1.z.string().optional(),
            frontImageUrl: zod_1.z.string().optional().nullable(),
            backImageUrl: zod_1.z.string().optional().nullable(),
            customerPhotoUrl: zod_1.z.string().optional().nullable(),
        }).optional(),
    }).refine(data => data.customerId || (data.customerName && data.mobileNumber), {
        message: "Either customerId or both customerName and mobileNumber must be provided",
        path: ["customerId"]
    })
});
exports.checkoutSchema = zod_1.z.object({
    body: zod_1.z.object({
        checkInId: zod_1.z.string().uuid(),
        roomCharges: zod_1.z.number().nonnegative(),
        additionalCharges: zod_1.z.number().nonnegative().optional(),
        discount: zod_1.z.number().nonnegative().optional(),
        taxAmount: zod_1.z.number().nonnegative().optional(),
        finalAmount: zod_1.z.number().nonnegative(),
        paymentMethod: zod_1.z.string(),
        transactionId: zod_1.z.string().optional().nullable(),
        paymentNotes: zod_1.z.string().optional().nullable(),
    })
});
exports.partialPaymentSchema = zod_1.z.object({
    body: zod_1.z.object({
        checkInId: zod_1.z.string().uuid().optional().nullable(),
        bookingId: zod_1.z.string().uuid().optional().nullable(),
        amount: zod_1.z.number().positive(),
        paymentMethod: zod_1.z.string(),
        transactionId: zod_1.z.string().optional().nullable(),
        notes: zod_1.z.string().optional().nullable(),
    }).refine(data => data.checkInId || data.bookingId, {
        message: "Either checkInId or bookingId must be provided",
        path: ["checkInId"]
    })
});
exports.addExtraChargeSchema = zod_1.z.object({
    body: zod_1.z.object({
        itemName: zod_1.z.string().min(1),
        amount: zod_1.z.number().nonnegative(),
        quantity: zod_1.z.number().int().positive().optional(),
    })
});
