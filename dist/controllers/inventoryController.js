"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
class InventoryController {
    static async getAll(req, res, next) {
        try {
            const items = await db_1.default.inventoryItem.findMany({
                orderBy: { name: 'asc' },
            });
            res.status(200).json({
                success: true,
                data: items,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async createOrUpdate(req, res, next) {
        const { name, quantity } = req.body;
        try {
            if (!name || quantity === undefined) {
                return next(new errorHandler_1.AppError(400, 'Item name and quantity are required.'));
            }
            const normalizedName = name.trim();
            const existing = await db_1.default.inventoryItem.findFirst({
                where: {
                    name: {
                        equals: normalizedName,
                        mode: 'insensitive',
                    },
                },
            });
            if (existing) {
                return next(new errorHandler_1.AppError(409, 'An inventory item with this name already exists.'));
            }
            const item = await db_1.default.inventoryItem.create({
                data: {
                    name: normalizedName,
                    quantity: Number(quantity),
                },
            });
            res.status(201).json({
                success: true,
                data: item,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async update(req, res, next) {
        const id = req.params.id;
        const { name, quantity } = req.body;
        try {
            const updateData = {};
            if (name !== undefined) {
                updateData.name = name.trim();
            }
            if (quantity !== undefined) {
                updateData.quantity = Number(quantity);
            }
            // Check name conflict if name is updated
            if (name !== undefined) {
                const existing = await db_1.default.inventoryItem.findFirst({
                    where: {
                        name: {
                            equals: name.trim(),
                            mode: 'insensitive',
                        },
                        NOT: { id },
                    },
                });
                if (existing) {
                    return next(new errorHandler_1.AppError(409, 'An inventory item with this name already exists.'));
                }
            }
            const item = await db_1.default.inventoryItem.update({
                where: { id },
                data: updateData,
            });
            res.status(200).json({
                success: true,
                data: item,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async delete(req, res, next) {
        const id = req.params.id;
        try {
            await db_1.default.inventoryItem.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: 'Inventory item deleted successfully.',
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.InventoryController = InventoryController;
