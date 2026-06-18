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
            await db_1.default.auditLog.create({
                data: {
                    userId: userId || null,
                    userName: userName || 'System',
                    action,
                    ipAddress: ipAddress || null,
                    deviceInformation: deviceInformation || null,
                    details: details ? JSON.stringify(details) : null,
                },
            });
        }
        catch (error) {
            console.error('Failed to write audit log:', error);
        }
    }
}
exports.AuditLogService = AuditLogService;
