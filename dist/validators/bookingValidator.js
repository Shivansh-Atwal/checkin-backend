"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBookingSchema = exports.createBookingSchema = void 0;
const zod_1 = require("zod");
exports.createBookingSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().uuid().optional().nullable(),
        mobileNumber: zod_1.z.string().min(5).max(15).optional(),
        customerName: zod_1.z.string().min(2).optional(),
        roomId: zod_1.z.string().uuid().optional(),
        roomIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
        checkInDate: zod_1.z.string(),
        checkOutDate: zod_1.z.string(),
        numberOfGuests: zod_1.z.number().int().min(1).optional(),
        advancePayment: zod_1.z.number().nonnegative().optional(),
        price: zod_1.z.number().positive(),
        notes: zod_1.z.string().optional().nullable(),
        registrationNumber: zod_1.z.string().optional().nullable(),
    }).refine(data => data.customerId || (data.customerName && data.mobileNumber), {
        message: "Either customerId or both customerName and mobileNumber must be provided",
        path: ["customerId"]
    })
});
exports.updateBookingSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().uuid().optional().nullable(),
        roomId: zod_1.z.string().uuid().optional(),
        checkInDate: zod_1.z.string().optional(),
        checkOutDate: zod_1.z.string().optional(),
        numberOfGuests: zod_1.z.number().int().min(1).optional(),
        advancePayment: zod_1.z.number().nonnegative().optional(),
        price: zod_1.z.number().positive().optional(),
        notes: zod_1.z.string().optional().nullable(),
        status: zod_1.z.string().optional(),
        customerName: zod_1.z.string().optional(),
        mobileNumber: zod_1.z.string().optional(),
        address: zod_1.z.string().optional().nullable(),
        city: zod_1.z.string().optional().nullable(),
        state: zod_1.z.string().optional().nullable(),
        country: zod_1.z.string().optional().nullable(),
        pincode: zod_1.z.string().optional().nullable(),
        registrationNumber: zod_1.z.string().optional().nullable(),
        document: zod_1.z.object({
            idType: zod_1.z.string().optional(),
            idNumber: zod_1.z.string().optional(),
            frontImageUrl: zod_1.z.string().optional().nullable(),
            backImageUrl: zod_1.z.string().optional().nullable(),
            customerPhotoUrl: zod_1.z.string().optional().nullable(),
        }).optional(),
    })
});
