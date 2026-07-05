"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomService = void 0;
const RoomRepository_1 = require("../repositories/RoomRepository");
const constants_1 = require("../constants");
const errorHandler_1 = require("../middleware/errorHandler");
class RoomService {
    /**
     * Only BookingService should call this to mutate room status.
     */
    static async updateStatus(roomId, status, tx) {
        const room = await RoomRepository_1.RoomRepository.findById(roomId, tx);
        if (!room) {
            throw new errorHandler_1.AppError(404, `Room ${roomId} not found.`);
        }
        // Do nothing if status is already matching
        if (room.status === status) {
            return room;
        }
        // Validations could be added here (e.g. Cannot set OCCUPIED if currently MAINTENANCE)
        if (status === constants_1.RoomStatus.OCCUPIED && room.status === constants_1.RoomStatus.MAINTENANCE) {
            throw new errorHandler_1.AppError(422, `Cannot occupy a room currently under maintenance.`);
        }
        return RoomRepository_1.RoomRepository.update(roomId, { status }, tx);
    }
}
exports.RoomService = RoomService;
