"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerService = void 0;
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const errorHandler_1 = require("../middleware/errorHandler");
class CustomerService {
    /**
     * Safely finds, updates, or creates a customer using mobileNumber as the unique key.
     * Enforces normalization and strict deduplication.
     */
    static async upsertCustomer(payload, tx) {
        if (!payload.mobileNumber) {
            throw new errorHandler_1.AppError(400, 'Mobile number is required for customer operations.');
        }
        const normalizedData = {
            fullName: payload.fullName?.toUpperCase() || payload.customerName?.toUpperCase(),
            mobileNumber: payload.mobileNumber,
            email: payload.email,
            address: payload.address?.toUpperCase(),
            city: payload.city?.toUpperCase(),
            state: payload.state?.toUpperCase(),
            country: payload.country?.toUpperCase(),
            pincode: payload.pincode,
            deviceId: payload.deviceId,
            updatedBy: payload.updatedBy || payload.userId,
        };
        let customer = await CustomerRepository_1.CustomerRepository.findByMobile(payload.mobileNumber, tx);
        if (customer) {
            // Update existing customer, but preserve fields if payload omits them
            const updateData = {};
            for (const [key, value] of Object.entries(normalizedData)) {
                if (value !== undefined && value !== null) {
                    updateData[key] = value;
                }
            }
            customer = await CustomerRepository_1.CustomerRepository.update(customer.id, updateData, tx);
        }
        else {
            // Create new customer
            if (!normalizedData.fullName) {
                throw new errorHandler_1.AppError(400, 'Full name is required for new customers.');
            }
            customer = await CustomerRepository_1.CustomerRepository.create(normalizedData, tx);
        }
        // Handle Document if provided
        if (payload.document) {
            const docPayload = payload.document;
            // In a real scenario we'd have a CustomerDocumentRepository.
            // For now we assume Prisma handles it directly on the customer relation if we had built it that way,
            // but since we split it, we should use tx to upsert document.
            const db = tx || (await Promise.resolve().then(() => __importStar(require('../config/db')))).default;
            const existingDoc = await db.customerDocument.findFirst({
                where: { customerId: customer.id }
            });
            const docData = {
                idType: docPayload.idType?.toUpperCase(),
                idNumber: docPayload.idNumber?.toUpperCase(),
                frontImageUrl: docPayload.frontImageUrl,
                backImageUrl: docPayload.backImageUrl,
                deviceId: payload.deviceId,
                updatedBy: payload.updatedBy || payload.userId,
            };
            if (existingDoc) {
                await db.customerDocument.update({
                    where: { id: existingDoc.id },
                    data: docData
                });
            }
            else {
                await db.customerDocument.create({
                    data: {
                        customerId: customer.id,
                        ...docData
                    }
                });
            }
        }
        return customer;
    }
}
exports.CustomerService = CustomerService;
