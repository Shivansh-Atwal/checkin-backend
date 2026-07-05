"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncProcessor = void 0;
const db_1 = __importDefault(require("../config/db"));
const constants_1 = require("../constants");
const RegistrationMappingService_1 = require("./RegistrationMappingService");
const ConflictResolver_1 = require("./ConflictResolver");
const BookingService_1 = require("../services/BookingService");
const CustomerService_1 = require("../services/CustomerService");
class SyncProcessor {
    /**
     * Processes a batch of offline operations pushed from a client device.
     * Guarantees idempotency and transaction boundaries per operation.
     */
    static async processBatch(operations, deviceId) {
        const response = {
            success: true,
            message: 'Batch processed',
            processedCount: 0,
            conflicts: [],
            serverTime: new Date().toISOString(),
            syncToken: `SYNC-${Date.now()}`
        };
        // Process sequentially to maintain strict ordering
        for (const op of operations) {
            try {
                await this.processOperation(op, deviceId);
                response.processedCount++;
            }
            catch (err) {
                if (err.statusCode === 409) {
                    response.conflicts.push({
                        operationId: op.operationId,
                        message: err.message
                    });
                }
                else {
                    console.error(`[Sync] Operation ${op.operationId} failed:`, err);
                    // In a true event-sourcing system we might halt on first error or continue and mark FAILED
                    // We will mark the operation as FAILED in the DB below
                }
            }
        }
        return response;
    }
    static async processOperation(op, deviceId) {
        // 1. Idempotency Check
        const existingOp = await db_1.default.syncOperation.findUnique({
            where: { operationId: op.operationId }
        });
        if (existingOp && existingOp.status === constants_1.SyncOperationStatus.SUCCESS) {
            // Already processed successfully, ignore duplicate
            return;
        }
        // 2. Resolve temporary IDs (e.g., TEMP-0001 -> REG-2394)
        const resolvedPayload = await RegistrationMappingService_1.RegistrationMappingService.resolvePayload(op.payload, deviceId);
        // Inject device/user metadata into payload for services
        resolvedPayload.deviceId = deviceId;
        resolvedPayload.userId = op.userId;
        resolvedPayload.updatedBy = op.userId;
        // 3. Process inside a single transaction
        await db_1.default.$transaction(async (tx) => {
            // A. Save the operation attempt
            const savedOp = await tx.syncOperation.upsert({
                where: { operationId: op.operationId },
                create: {
                    operationId: op.operationId,
                    deviceId: deviceId,
                    userId: op.userId,
                    hotelId: op.hotelId,
                    entityType: op.entityType.toString(),
                    entityId: op.entityId,
                    operationType: op.operationType.toString(),
                    payload: resolvedPayload,
                    version: op.version,
                    status: constants_1.SyncOperationStatus.PENDING
                },
                update: {
                    retryCount: { increment: 1 },
                    payload: resolvedPayload
                }
            });
            try {
                // B. Version Validation for Updates (Optimistic Locking)
                if (op.operationType === 'UPDATE') {
                    // Fetch current version of the entity
                    let currentVersion = 1;
                    if (op.entityType === 'BOOKING') {
                        const b = await tx.booking.findUnique({ where: { id: op.entityId } });
                        currentVersion = b?.version || 1;
                    }
                    else if (op.entityType === 'CUSTOMER') {
                        const c = await tx.customer.findUnique({ where: { id: op.entityId } });
                        currentVersion = c?.version || 1;
                    }
                    await ConflictResolver_1.ConflictResolver.validateVersion(op, currentVersion, tx);
                }
                // C. Route to correct Service
                switch (op.operationType) {
                    case 'CHECKIN':
                        await BookingService_1.BookingService.checkIn(resolvedPayload, tx);
                        break;
                    case 'CHECKOUT':
                        await BookingService_1.BookingService.checkOut(resolvedPayload, tx);
                        break;
                    case 'UPDATE_BOOKING':
                        await BookingService_1.BookingService.updateBooking(op.entityId, resolvedPayload, tx);
                        break;
                    case 'CUSTOMER_UPDATE':
                        await CustomerService_1.CustomerService.upsertCustomer(resolvedPayload, tx);
                        break;
                    case 'CANCEL_BOOKING':
                        await BookingService_1.BookingService.cancelBooking(op.entityId, resolvedPayload, tx);
                        break;
                    default:
                        console.warn(`[Sync] Unknown operation type: ${op.operationType}`);
                        break;
                }
                // D. Mark success
                await tx.syncOperation.update({
                    where: { id: savedOp.id },
                    data: { status: constants_1.SyncOperationStatus.SUCCESS }
                });
            }
            catch (err) {
                // E. Mark failed or conflict
                const newStatus = err.statusCode === 409 ? constants_1.SyncOperationStatus.CONFLICT : constants_1.SyncOperationStatus.FAILED;
                await tx.syncOperation.update({
                    where: { id: savedOp.id },
                    data: { status: newStatus }
                });
                throw err; // rethrow to abort transaction and pass error to batch processor
            }
        });
    }
}
exports.SyncProcessor = SyncProcessor;
