"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogService = void 0;
const db_1 = __importDefault(require("../config/db"));
class AuditLogService {
    static async log({ userId, userName, action, ipAddress, deviceInformation, details, }) {
        try {
            // Copy details to enrich it with room numbers if needed
            const detailsCopy = details ? { ...details } : null;
            if (detailsCopy) {
                const roomIdsToLookup = new Set();
                const collectRoomIds = (obj) => {
                    if (!obj || typeof obj !== 'object')
                        return;
                    if (obj.roomId && typeof obj.roomId === 'string' && obj.roomId.length === 36) {
                        roomIdsToLookup.add(obj.roomId);
                    }
                    if (obj.roomIds && Array.isArray(obj.roomIds)) {
                        obj.roomIds.forEach((id) => {
                            if (typeof id === 'string' && id.length === 36) {
                                roomIdsToLookup.add(id);
                            }
                        });
                    }
                    for (const key in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, key)) {
                            if (typeof obj[key] === 'object') {
                                collectRoomIds(obj[key]);
                            }
                        }
                    }
                };
                collectRoomIds(detailsCopy);
                if (roomIdsToLookup.size > 0) {
                    const rooms = await db_1.default.room.findMany({
                        where: {
                            id: { in: Array.from(roomIdsToLookup) }
                        },
                        select: {
                            id: true,
                            roomNumber: true
                        }
                    });
                    const roomMap = new Map(rooms.map(r => [r.id, r.roomNumber]));
                    const rootRoomNumbers = [];
                    if (detailsCopy.roomId && roomMap.has(detailsCopy.roomId)) {
                        rootRoomNumbers.push(roomMap.get(detailsCopy.roomId));
                    }
                    if (detailsCopy.roomIds && Array.isArray(detailsCopy.roomIds)) {
                        detailsCopy.roomIds.forEach((id) => {
                            if (roomMap.has(id)) {
                                rootRoomNumbers.push(roomMap.get(id));
                            }
                        });
                    }
                    if (rootRoomNumbers.length > 0) {
                        detailsCopy.roomNumbers = rootRoomNumbers.join(', ');
                    }
                    if (detailsCopy.updates && typeof detailsCopy.updates === 'object') {
                        const updatesCopy = { ...detailsCopy.updates };
                        if (updatesCopy.roomId && roomMap.has(updatesCopy.roomId)) {
                            updatesCopy.roomNumber = roomMap.get(updatesCopy.roomId);
                            delete updatesCopy.roomId;
                        }
                        detailsCopy.updates = updatesCopy;
                    }
                    delete detailsCopy.roomId;
                    delete detailsCopy.roomIds;
                }
            }
            await db_1.default.auditLog.create({
                data: {
                    userId: userId || null,
                    userName: userName || 'System',
                    action,
                    ipAddress: ipAddress || null,
                    deviceInformation: deviceInformation || null,
                    details: detailsCopy ? JSON.stringify(detailsCopy) : null,
                },
            });
        }
        catch (error) {
            console.error('Failed to write audit log:', error);
        }
    }
}
exports.AuditLogService = AuditLogService;
