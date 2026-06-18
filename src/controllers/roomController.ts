import { Request, Response, NextFunction } from 'express';
import { RoomRepository } from '../repositories/RoomRepository';
import { StorageService } from '../services/StorageService';
import { AuditLogService } from '../services/AuditLogService';
import { AppError } from '../middleware/errorHandler';

export class RoomController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string;
      const roomType = req.query.roomType as string;
      const rooms = await RoomRepository.getAll({ status, roomType });

      res.status(200).json({
        success: true,
        data: rooms,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const room = await RoomRepository.findById(id);
      if (!room) {
        return next(new AppError(404, 'Room not found.'));
      }
      res.status(200).json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    const { roomNumber, capacity } = req.body;

    if (!roomNumber || !capacity) {
      return next(new AppError(400, 'Required parameters (roomNumber, capacity) are missing.'));
    }

    try {
      const existing = await RoomRepository.findByRoomNumber(roomNumber);
      if (existing) {
        return next(new AppError(409, 'Room number already exists.'));
      }

      const room = await RoomRepository.create({
        roomNumber: String(roomNumber),
        capacity: Number(capacity),
      });

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Room Created',
        ipAddress: req.ip as string,
        details: { roomId: room?.id, roomNumber },
      });

      res.status(201).json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      const updated = await RoomRepository.update(id, req.body);

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Room Updated',
        ipAddress: req.ip as string,
        details: { roomId: id, updates: req.body },
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!status) {
      return next(new AppError(400, 'Status value is required.'));
    }

    try {
      const updated = await RoomRepository.updateStatus(id, status);

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Room Status Changed',
        ipAddress: req.ip as string,
        details: { roomId: id, newStatus: status },
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      await RoomRepository.delete(id);

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Room Deleted',
        ipAddress: req.ip as string,
        details: { roomId: id },
      });

      res.status(200).json({
        success: true,
        message: 'Room deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    if (!req.file) {
      return next(new AppError(400, 'No image file uploaded.'));
    }

    try {
      const imageUrl = await StorageService.uploadFile(req.file, 'rooms');
      res.status(200).json({
        success: true,
        data: { imageUrl },
      });
    } catch (error) {
      next(error);
    }
  }
}
