"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomController = void 0;
const RoomRepository_1 = require("../repositories/RoomRepository");
const StorageService_1 = require("../services/StorageService");
const AuditLogService_1 = require("../services/AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
class RoomController {
    static async getAll(req, res, next) {
        try {
            const status = req.query.status;
            const roomType = req.query.roomType;
            const rooms = await RoomRepository_1.RoomRepository.getAll({ status, roomType });
            res.status(200).json({
                success: true,
                data: rooms,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getById(req, res, next) {
        try {
            const id = req.params.id;
            const room = await RoomRepository_1.RoomRepository.findById(id);
            if (!room) {
                return next(new errorHandler_1.AppError(404, 'Room not found.'));
            }
            res.status(200).json({
                success: true,
                data: room,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async create(req, res, next) {
        const { roomNumber, capacity } = req.body;
        if (!roomNumber || !capacity) {
            return next(new errorHandler_1.AppError(400, 'Required parameters (roomNumber, capacity) are missing.'));
        }
        try {
            const existing = await RoomRepository_1.RoomRepository.findByRoomNumber(roomNumber);
            if (existing) {
                return next(new errorHandler_1.AppError(409, 'Room number already exists.'));
            }
            const room = await RoomRepository_1.RoomRepository.create({
                roomNumber: String(roomNumber),
                capacity: Number(capacity),
            });
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Room Created',
                ipAddress: req.ip,
                details: { roomId: room?.id, roomNumber },
            });
            res.status(201).json({
                success: true,
                data: room,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async update(req, res, next) {
        const id = req.params.id;
        try {
            const updated = await RoomRepository_1.RoomRepository.update(id, req.body);
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Room Updated',
                ipAddress: req.ip,
                details: { roomId: id, updates: req.body },
            });
            res.status(200).json({
                success: true,
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async updateStatus(req, res, next) {
        const id = req.params.id;
        const { status } = req.body;
        if (!status) {
            return next(new errorHandler_1.AppError(400, 'Status value is required.'));
        }
        try {
            const updated = await RoomRepository_1.RoomRepository.updateStatus(id, status);
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Room Status Changed',
                ipAddress: req.ip,
                details: { roomId: id, newStatus: status },
            });
            res.status(200).json({
                success: true,
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async delete(req, res, next) {
        const id = req.params.id;
        try {
            await RoomRepository_1.RoomRepository.delete(id);
            // Log action
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Room Deleted',
                ipAddress: req.ip,
                details: { roomId: id },
            });
            res.status(200).json({
                success: true,
                message: 'Room deleted successfully.',
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async uploadImage(req, res, next) {
        if (!req.file) {
            return next(new errorHandler_1.AppError(400, 'No image file uploaded.'));
        }
        try {
            const imageUrl = await StorageService_1.StorageService.uploadFile(req.file, 'rooms');
            res.status(200).json({
                success: true,
                data: { imageUrl },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.RoomController = RoomController;
