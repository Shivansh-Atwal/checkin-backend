"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerController = void 0;
const CustomerRepository_1 = require("../repositories/CustomerRepository");
const StorageService_1 = require("../services/StorageService");
const AuditLogService_1 = require("../services/AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
class CustomerController {
    static async search(req, res, next) {
        try {
            const query = (req.query.q || '');
            const customers = await CustomerRepository_1.CustomerRepository.search(query);
            res.status(200).json({
                success: true,
                data: customers,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getById(req, res, next) {
        try {
            const id = req.params.id;
            const customer = await CustomerRepository_1.CustomerRepository.findById(id);
            if (!customer) {
                return next(new errorHandler_1.AppError(404, 'Customer profile not found.'));
            }
            res.status(200).json({
                success: true,
                data: customer,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async create(req, res, next) {
        const { fullName, mobileNumber, alternateNumber, email, dob, gender, address, city, state, country, pincode, document } = req.body;
        if (!fullName || !mobileNumber) {
            return next(new errorHandler_1.AppError(400, 'Customer name and mobile number are required.'));
        }
        try {
            const existing = await CustomerRepository_1.CustomerRepository.findByMobile(mobileNumber);
            if (existing) {
                return next(new errorHandler_1.AppError(409, 'Customer with this mobile number already exists.'));
            }
            const parsedDob = dob ? new Date(dob) : undefined;
            const customer = await CustomerRepository_1.CustomerRepository.create({
                fullName,
                mobileNumber,
                alternateNumber,
                email,
                dob: parsedDob,
                gender,
                address,
                city,
                state,
                country,
                pincode,
                document,
            });
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Customer Created',
                ipAddress: req.ip,
                details: { customerId: customer?.id, mobileNumber },
            });
            res.status(201).json({
                success: true,
                data: customer,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async update(req, res, next) {
        const id = req.params.id;
        try {
            const parsedDob = req.body.dob ? new Date(req.body.dob) : undefined;
            const customer = await CustomerRepository_1.CustomerRepository.update(id, {
                ...req.body,
                dob: parsedDob,
            });
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Customer Edited',
                ipAddress: req.ip,
                details: { customerId: id, updates: req.body },
            });
            res.status(200).json({
                success: true,
                data: customer,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async uploadDocument(req, res, next) {
        if (!req.file) {
            return next(new errorHandler_1.AppError(400, 'No document file uploaded.'));
        }
        const type = (req.query.type || 'documents');
        try {
            const fileUrl = await StorageService_1.StorageService.uploadFile(req.file, type);
            res.status(200).json({
                success: true,
                data: { fileUrl },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.CustomerController = CustomerController;
