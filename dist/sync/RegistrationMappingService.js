"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationMappingService = void 0;
const db_1 = __importDefault(require("../config/db"));
class RegistrationMappingService {
    /**
     * Maps a temporary device-generated registration ID to a persistent server ID.
     * If already mapped, returns the existing server ID.
     */
    static async mapTempToReal(tempId, deviceId, tx) {
        const db = tx || db_1.default;
        const existing = await db.registrationMapping.findUnique({
            where: { tempRegistrationId: tempId }
        });
        if (existing) {
            return existing.realRegistrationId;
        }
        // Generate server ID. (In a real system, you might increment a sequence in Postgres)
        const realId = `REG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await db.registrationMapping.create({
            data: {
                tempRegistrationId: tempId,
                realRegistrationId: realId,
                deviceId
            }
        });
        return realId;
    }
    /**
     * Deeply scans the payload and resolves any TEMP- registration numbers
     */
    static async resolvePayload(payload, deviceId, tx) {
        const resolved = { ...payload };
        if (resolved.registrationNumber && resolved.registrationNumber.startsWith('TEMP-')) {
            resolved.registrationNumber = await this.mapTempToReal(resolved.registrationNumber, deviceId, tx);
        }
        return resolved;
    }
}
exports.RegistrationMappingService = RegistrationMappingService;
