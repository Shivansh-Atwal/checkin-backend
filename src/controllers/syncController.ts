import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AppError } from '../middleware/errorHandler';

export class SyncController {
  static async getDelta(req: Request, res: Response, next: NextFunction) {
    const lastSyncedAtStr = req.query.lastSyncedAt as string;

    if (!lastSyncedAtStr) {
      return next(new AppError(400, 'lastSyncedAt query parameter is required.'));
    }

    try {
      const lastSyncedAt = new Date(lastSyncedAtStr);
      if (isNaN(lastSyncedAt.getTime())) {
        return next(new AppError(400, 'Invalid lastSyncedAt timestamp format.'));
      }

      const serverTime = new Date().toISOString();

      // Pull updated/created records
      const [rooms, customers, bookings, checkins, checkouts, payments, inventory, auditlogs] = await Promise.all([
        prisma.room.findMany({
          where: { updatedAt: { gte: lastSyncedAt } },
        }),
        prisma.customer.findMany({
          where: { updatedAt: { gte: lastSyncedAt } },
        }),
        prisma.booking.findMany({
          where: { updatedAt: { gte: lastSyncedAt } },
        }),
        prisma.checkIn.findMany({
          where: { updatedAt: { gte: lastSyncedAt } },
        }),
        prisma.checkout.findMany({
          where: { createdAt: { gte: lastSyncedAt } },
        }),
        prisma.payment.findMany({
          where: { createdAt: { gte: lastSyncedAt } },
        }),
        prisma.inventoryItem.findMany({
          where: { updatedAt: { gte: lastSyncedAt } },
        }),
        prisma.auditLog.findMany({
          where: { timestamp: { gte: lastSyncedAt } },
          take: 100,
        }),
      ]);

      // Extract deletions from AuditLogs since lastSyncedAt
      const deletedLogs = await prisma.auditLog.findMany({
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
            } else if (log.action === 'Booking Deleted') {
              type = 'Booking';
              id = details.bookingId || '';
            }
          } catch (e) {
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
    } catch (error) {
      next(error);
    }
  }
}
