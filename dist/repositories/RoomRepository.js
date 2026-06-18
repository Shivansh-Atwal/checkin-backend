"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class RoomRepository {
    static mapRoom(r) {
        if (!r)
            return null;
        let status = 'AVAILABLE';
        if (r.checkIns && r.checkIns.length > 0) {
            status = 'OCCUPIED';
        }
        else if (r.bookings && r.bookings.length > 0) {
            status = 'ADVANCE_BOOKED';
        }
        return {
            id: r.id,
            roomNumber: r.roomNumber,
            capacity: r.capacity,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            // Derived fields
            status,
            floorNumber: parseInt(r.roomNumber.charAt(0)) || 1,
            roomType: r.capacity > 2 ? 'Deluxe' : 'Standard',
            description: '',
            amenities: 'WiFi, AC',
            images: [],
            checkIns: r.checkIns || [],
            bookings: r.bookings || [],
        };
    }
    static async findById(id) {
        const room = await db_1.default.room.findUnique({
            where: { id },
            include: {
                checkIns: {
                    where: { status: 'ACTIVE' },
                    include: { customer: true },
                },
                bookings: {
                    where: { status: 'CONFIRMED' },
                    include: { customer: true },
                },
            },
        });
        return this.mapRoom(room);
    }
    static async findByRoomNumber(roomNumber) {
        const room = await db_1.default.room.findUnique({
            where: { roomNumber },
            include: {
                checkIns: {
                    where: { status: 'ACTIVE' },
                },
                bookings: {
                    where: { status: 'CONFIRMED' },
                },
            },
        });
        return this.mapRoom(room);
    }
    static async getAll(filters) {
        const rooms = await db_1.default.room.findMany({
            include: {
                checkIns: {
                    where: { status: 'ACTIVE' },
                },
                bookings: {
                    where: { status: 'CONFIRMED' },
                },
            },
            orderBy: { roomNumber: 'asc' },
        });
        let mapped = rooms.map(r => this.mapRoom(r)).filter((r) => r !== null);
        if (filters && filters.status) {
            const targetStatus = filters.status;
            mapped = mapped.filter(r => r.status === targetStatus);
        }
        if (filters && filters.roomType) {
            const targetRoomType = filters.roomType.toLowerCase();
            mapped = mapped.filter(r => r.roomType.toLowerCase() === targetRoomType);
        }
        return mapped;
    }
    static async create(data) {
        const room = await db_1.default.room.create({
            data: {
                roomNumber: data.roomNumber,
                capacity: Number(data.capacity),
            },
            include: {
                checkIns: { where: { status: 'ACTIVE' } },
                bookings: { where: { status: 'CONFIRMED' } },
            }
        });
        return this.mapRoom(room);
    }
    static async update(id, data) {
        const updateData = {};
        if (data.roomNumber !== undefined)
            updateData.roomNumber = data.roomNumber;
        if (data.capacity !== undefined)
            updateData.capacity = Number(data.capacity);
        const room = await db_1.default.room.update({
            where: { id },
            data: updateData,
            include: {
                checkIns: { where: { status: 'ACTIVE' } },
                bookings: { where: { status: 'CONFIRMED' } },
            }
        });
        return this.mapRoom(room);
    }
    static async updateStatus(id, status) {
        // Status is derived dynamically, so no database update is necessary.
        return this.findById(id);
    }
    static async delete(id) {
        return db_1.default.room.delete({
            where: { id },
        });
    }
}
exports.RoomRepository = RoomRepository;
