"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = __importDefault(require("../config/db"));
const RoomRepository_1 = require("../repositories/RoomRepository");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/room-types', async (req, res, next) => {
    try {
        const rooms = await db_1.default.room.findMany({ select: { capacity: true } });
        const values = Array.from(new Set(rooms.map((room) => (room.capacity > 2 ? 'Deluxe' : 'Standard')))).sort();
        res.status(200).json({
            success: true,
            data: values.length > 0 ? values : ['Standard', 'Deluxe'],
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/categories', (req, res) => {
    res.status(200).json({
        success: true,
        data: ['Room', 'Food', 'Beverage', 'Laundry', 'Service', 'Other'],
    });
});
router.get('/room-status', (req, res) => {
    res.status(200).json({
        success: true,
        data: ['AVAILABLE', 'OCCUPIED', 'ADVANCE_BOOKED'],
    });
});
router.get('/customer-types', (req, res) => {
    res.status(200).json({
        success: true,
        data: ['Walk-In', 'Advance Booking', 'Corporate', 'Returning Guest'],
    });
});
router.get('/identity-types', (req, res) => {
    res.status(200).json({
        success: true,
        data: ['AADHAAR CARD', 'PAN CARD', 'PASSPORT', 'DRIVING LICENSE', 'VOTER ID'],
    });
});
router.get('/pricing', async (req, res, next) => {
    try {
        const rooms = await RoomRepository_1.RoomRepository.getAll();
        const pricing = rooms.map((room) => ({
            roomId: room.id,
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            capacity: room.capacity,
            pricePerNight: 0,
        }));
        res.status(200).json({ success: true, data: pricing });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
