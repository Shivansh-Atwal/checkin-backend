import { Request, Response, NextFunction } from 'express';
import { SyncProcessor } from '../sync/SyncProcessor';
import prisma from '../config/db';
import { AppError } from '../middleware/errorHandler';
import { SyncPushRequest, SyncPushResponse, StandardResponse } from '../types';

export class SyncController {

  /**
   * POST /api/sync/push
   * Receives operations from devices and processes them.
   */
  static async push(req: Request, res: Response, next: NextFunction) {
    try {
      const deviceId = req.headers['x-device-id'] as string;
      if (!deviceId) {
        throw new AppError(401, 'x-device-id header is required for sync push.');
      }

      const body = req.body as SyncPushRequest;
      if (!body.operations || !Array.isArray(body.operations)) {
        throw new AppError(400, 'Invalid sync payload. Expected "operations" array.');
      }

      // Record device sync time
      await prisma.device.upsert({
        where: { deviceId },
        create: {
          deviceId,
          lastSync: new Date(),
        },
        update: {
          lastSync: new Date()
        }
      });

      const result: SyncPushResponse = await SyncProcessor.processBatch(body.operations, deviceId);

      const standardResponse: StandardResponse<SyncPushResponse> = {
        success: true,
        message: 'Sync push completed',
        data: result,
        serverTime: result.serverTime,
        syncToken: result.syncToken
      };

      res.status(200).json(standardResponse);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/sync/pull
   * Returns deltas since lastSyncToken
   */
  static async pull(req: Request, res: Response, next: NextFunction) {
    try {
      const deviceId = req.headers['x-device-id'] as string;
      if (!deviceId) throw new AppError(401, 'x-device-id header required.');

      const lastSyncToken = req.query.lastSyncToken as string;
      // In a full implementation, we'd query the DB for records updated after the timestamp of lastSyncToken
      // and map them back to Operations to send to the client.

      const standardResponse: StandardResponse = {
        success: true,
        message: 'Pull successful',
        data: {
          operations: [] // Replace with actual pulled operations
        },
        serverTime: new Date().toISOString(),
        syncToken: `SYNC-${Date.now()}`
      };

      res.status(200).json(standardResponse);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/sync/bootstrap
   * Returns a complete initial state for a new device.
   */
  static async bootstrap(req: Request, res: Response, next: NextFunction) {
    try {
      const standardResponse: StandardResponse = {
        success: true,
        message: 'Bootstrap data generated',
        data: {
          rooms: await prisma.room.findMany({ where: { deletedAt: null } }),
          customers: await prisma.customer.findMany({ where: { deletedAt: null } }),
          bookings: await prisma.booking.findMany({ where: { deletedAt: null } }),
          checkIns: await prisma.checkIn.findMany({ where: { deletedAt: null } }),
        },
        serverTime: new Date().toISOString(),
        syncToken: `SYNC-${Date.now()}`
      };

      res.status(200).json(standardResponse);
    } catch (err) {
      next(err);
    }
  }
}
