"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncController = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
class SyncController {
    static async getDelta(req, res, next) {
        const lastSyncedAtStr = req.query.lastSyncedAt;
        if (!lastSyncedAtStr) {
            return next(new errorHandler_1.AppError(400, 'lastSyncedAt query parameter is required.'));
        }
        try {
            const lastSyncedAt = new Date(lastSyncedAtStr);
            if (isNaN(lastSyncedAt.getTime())) {
                return next(new errorHandler_1.AppError(400, 'Invalid lastSyncedAt timestamp format.'));
            }
            const serverTime = new Date().toISOString();
            // Pull updated/created records
            const [rooms, customers, bookings, checkins, checkouts, payments, inventory, auditlogs] = await Promise.all([
                db_1.default.room.findMany({
                    where: { updatedAt: { gte: lastSyncedAt } },
                }),
                db_1.default.customer.findMany({
                    where: { updatedAt: { gte: lastSyncedAt } },
                }),
                db_1.default.booking.findMany({
                    where: { updatedAt: { gte: lastSyncedAt } },
                }),
                db_1.default.checkIn.findMany({
                    where: { updatedAt: { gte: lastSyncedAt } },
                }),
                db_1.default.checkout.findMany({
                    where: { createdAt: { gte: lastSyncedAt } },
                }),
                db_1.default.payment.findMany({
                    where: { createdAt: { gte: lastSyncedAt } },
                }),
                db_1.default.inventoryItem.findMany({
                    where: { updatedAt: { gte: lastSyncedAt } },
                }),
                db_1.default.auditLog.findMany({
                    where: { timestamp: { gte: lastSyncedAt } },
                    take: 100,
                }),
            ]);
            // Extract deletions from AuditLogs since lastSyncedAt
            const deletedLogs = await db_1.default.auditLog.findMany({
                where: {
                    action: { contains: 'Deleted' },
                    timestamp: { gte: lastSyncedAt },
                },
            });
            const deleted = deletedLogs
                .map((log) => {
                let id = '';
                let type = '';
                try {
                    const details = log.details ? JSON.parse(log.details) : {};
                    if (log.action === 'Room Deleted') {
                        type = 'Room';
                        id = details.roomId || '';
                    }
                    else if (log.action === 'Booking Deleted') {
                        type = 'Booking';
                        id = details.bookingId || '';
                    }
                }
                catch (e) {
                    console.error('Failed to parse audit log details for deletions:', e);
                }
                return { id, type };
            })
                .filter((item) => item.id !== '' && item.type !== '');
            res.status(200).json({
                success: true,
                data: {
                    delta: {
                        rooms,
                        customers,
                        bookings,
                        checkins,
                        checkouts,
                        payments,
                        inventory,
                        auditlogs,
                        deleted,
                    },
                    serverTime,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SyncController = SyncController;
