"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class UserRepository {
    static async findById(id) {
        return db_1.default.user.findUnique({
            where: { id },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true,
                            },
                        },
                    },
                },
                userPermissions: {
                    include: {
                        permission: true,
                    },
                },
            },
        });
    }
    static async findByEmail(email) {
        return db_1.default.user.findUnique({
            where: { email },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true,
                            },
                        },
                    },
                },
                userPermissions: {
                    include: {
                        permission: true,
                    },
                },
            },
        });
    }
    static async getAll() {
        return db_1.default.user.findMany({
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true,
                            },
                        },
                    },
                },
                userPermissions: {
                    include: {
                        permission: true,
                    },
                },
            },
        });
    }
    static async create(data) {
        return db_1.default.user.create({
            data,
            include: { role: true },
        });
    }
    static async update(id, data) {
        return db_1.default.user.update({
            where: { id },
            data,
        });
    }
    static async setCustomPermissions(userId, permissionIds) {
        const uniquePermissionIds = Array.from(new Set(permissionIds));
        // Transaction to remove existing overrides and add new ones
        return db_1.default.$transaction([
            db_1.default.userPermission.deleteMany({
                where: { userId },
            }),
            db_1.default.userPermission.createMany({
                data: uniquePermissionIds.map((permId) => ({
                    userId,
                    permissionId: permId,
                })),
            }),
            db_1.default.user.update({
                where: { id: userId },
                data: { hasCustomPermissions: true },
            }),
        ]);
    }
    static async resetCustomPermissions(userId) {
        return db_1.default.$transaction([
            db_1.default.userPermission.deleteMany({
                where: { userId },
            }),
            db_1.default.user.update({
                where: { id: userId },
                data: { hasCustomPermissions: false },
            }),
        ]);
    }
}
exports.UserRepository = UserRepository;
