"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictResolver = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
class ConflictResolver {
    /**
     * Checks if an operation has a version conflict with the database.
     * If there is a conflict, logs it and throws an error to abort the operation.
     */
    static async validateVersion(operation, currentServerVersion, tx) {
        if (operation.version < currentServerVersion) {
            const db = tx || db_1.default;
            // Log the conflict
            await db.conflictLog.create({
                data: {
                    operationId: operation.operationId,
                    deviceId: operation.deviceId,
                    entityType: operation.entityType,
                    entityId: operation.entityId,
                    clientVersion: operation.version,
                    serverVersion: currentServerVersion,
                    clientPayload: operation.payload,
                    serverPayload: {}, // In a real app we'd serialize the current DB state here
                    resolved: false
                }
            });
            throw new errorHandler_1.AppError(409, `Version conflict on ${operation.entityType} ${operation.entityId}. Client version ${operation.version} is older than server version ${currentServerVersion}`);
        }
    }
}
exports.ConflictResolver = ConflictResolver;
