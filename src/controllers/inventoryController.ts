import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AppError } from '../middleware/errorHandler';

export class InventoryController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.inventoryItem.findMany({
        orderBy: { name: 'asc' },
      });
      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createOrUpdate(req: Request, res: Response, next: NextFunction) {
    const { name, quantity } = req.body;
    try {
      if (!name || quantity === undefined) {
        return next(new AppError(400, 'Item name and quantity are required.'));
      }

      const normalizedName = name.trim();
      const existing = await prisma.inventoryItem.findFirst({
        where: {
          name: {
            equals: normalizedName,
            mode: 'insensitive',
          },
        },
      });

      if (existing) {
        return next(new AppError(409, 'An inventory item with this name already exists.'));
      }

      const item = await prisma.inventoryItem.create({
        data: {
          name: normalizedName,
          quantity: Number(quantity),
        },
      });

      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    const { name, quantity } = req.body;
    try {
      const updateData: any = {};
      if (name !== undefined) {
        updateData.name = name.trim();
      }
      if (quantity !== undefined) {
        updateData.quantity = Number(quantity);
      }

      // Check name conflict if name is updated
      if (name !== undefined) {
        const existing = await prisma.inventoryItem.findFirst({
          where: {
            name: {
              equals: name.trim(),
              mode: 'insensitive',
            },
            NOT: { id },
          },
        });
        if (existing) {
          return next(new AppError(409, 'An inventory item with this name already exists.'));
        }
      }

      const item = await prisma.inventoryItem.update({
        where: { id },
        data: updateData,
      });

      res.status(200).json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      await prisma.inventoryItem.delete({
        where: { id },
      });
      res.status(200).json({
        success: true,
        message: 'Inventory item deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}
