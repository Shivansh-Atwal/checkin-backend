"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncController = void 0;
const SyncProcessor_1 = require("../sync/SyncProcessor");
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
class SyncController {
    /**
     * POST /api/sync/push
     * Receives operations from devices and processes them.
     */
    static async push(req, res, next) {
        try {
            const deviceId = req.headers['x-device-id'];
            if (!deviceId) {
                throw new errorHandler_1.AppError(401, 'x-device-id header is required for sync push.');
            }
            const body = req.body;
            if (!body.operations || !Array.isArray(body.operations)) {
                throw new errorHandler_1.AppError(400, 'Invalid sync payload. Expected "operations" array.');
            }
            // Record device sync time
            await db_1.default.device.upsert({
                where: { deviceId },
                create: {
                    deviceId,
                    lastSync: new Date(),
                },
                update: {
                    lastSync: new Date()
                }
            });
            const result = await SyncProcessor_1.SyncProcessor.processBatch(body.operations, deviceId);
            const standardResponse = {
                success: true,
                message: 'Sync push completed',
                data: result,
                serverTime: result.serverTime,
                syncToken: result.syncToken
            };
            res.status(200).json(standardResponse);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/sync/pull
     * Returns deltas since lastSyncToken
     */
    static async pull(req, res, next) {
        try {
            const deviceId = req.headers['x-device-id'];
            if (!deviceId)
                throw new errorHandler_1.AppError(401, 'x-device-id header required.');
            const lastSyncToken = req.query.lastSyncToken;
            // In a full implementation, we'd query the DB for records updated after the timestamp of lastSyncToken
            // and map them back to Operations to send to the client.
            const standardResponse = {
                success: true,
                message: 'Pull successful',
                data: {
                    operations: [] // Replace with actual pulled operations
                },
                serverTime: new Date().toISOString(),
                syncToken: `SYNC-${Date.now()}`
            };
            res.status(200).json(standardResponse);
        }
        catch (err) {
            next(err);
        }
    }
    /**
     * GET /api/sync/bootstrap
     * Returns a complete initial state for a new device.
     */
    static async bootstrap(req, res, next) {
        try {
            const standardResponse = {
                success: true,
                message: 'Bootstrap data generated',
                data: {
                    rooms: await db_1.default.room.findMany({ where: { deletedAt: null } }),
                    customers: await db_1.default.customer.findMany({ where: { deletedAt: null } }),
                    bookings: await db_1.default.booking.findMany({ where: { deletedAt: null } }),
                    checkIns: await db_1.default.checkIn.findMany({ where: { deletedAt: null } }),
                },
                serverTime: new Date().toISOString(),
                syncToken: `SYNC-${Date.now()}`
            };
            res.status(200).json(standardResponse);
        }
        catch (err) {
            next(err);
        }
    }
}
exports.SyncController = SyncController;
