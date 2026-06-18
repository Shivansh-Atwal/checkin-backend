"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../config/db"));
const UserRepository_1 = require("../repositories/UserRepository");
const AuditLogService_1 = require("../services/AuditLogService");
const errorHandler_1 = require("../middleware/errorHandler");
const RoomRepository_1 = require("../repositories/RoomRepository");
class AdminController {
    // --- Employee Management ---
    static async getAllEmployees(req, res, next) {
        try {
            const employees = await UserRepository_1.UserRepository.getAll();
            // Filter out admin users or just return all
            res.status(200).json({
                success: true,
                data: employees.map((emp) => {
                    const activePermissionIds = emp.hasCustomPermissions
                        ? emp.userPermissions.map((up) => up.permissionId)
                        : emp.role.permissions.map((rp) => rp.permissionId);
                    return {
                        id: emp.id,
                        email: emp.email,
                        fullName: emp.fullName,
                        role: emp.role.name,
                        isDisabled: emp.isDisabled,
                        permissions: activePermissionIds,
                        hasCustomPermissions: emp.hasCustomPermissions,
                    };
                }),
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async createEmployee(req, res, next) {
        const { email, password, fullName } = req.body;
        if (!email || !password || !fullName) {
            return next(new errorHandler_1.AppError(400, 'Required parameters are missing.'));
        }
        try {
            const existing = await UserRepository_1.UserRepository.findByEmail(email);
            if (existing) {
                return next(new errorHandler_1.AppError(409, 'Email already registered.'));
            }
            const hash = await bcryptjs_1.default.hash(password, 10);
            const employeeRole = await db_1.default.role.findFirst({ where: { name: 'EMPLOYEE' } });
            if (!employeeRole) {
                return next(new errorHandler_1.AppError(500, 'Staff role not found. Seed the database first.'));
            }
            const emp = await UserRepository_1.UserRepository.create({
                email,
                passwordHash: hash,
                fullName,
                roleId: employeeRole.id,
            });
            // Log event
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Employee Created',
                ipAddress: req.ip,
                details: { employeeId: emp.id, email },
            });
            res.status(201).json({
                success: true,
                data: emp,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async updateEmployee(req, res, next) {
        const id = req.params.id;
        const { fullName, isDisabled, permissionIds, resetToDefault } = req.body;
        try {
            await UserRepository_1.UserRepository.update(id, {
                fullName,
                isDisabled: isDisabled !== undefined ? Boolean(isDisabled) : undefined,
            });
            if (resetToDefault) {
                await UserRepository_1.UserRepository.resetCustomPermissions(id);
            }
            else if (permissionIds) {
                await UserRepository_1.UserRepository.setCustomPermissions(id, permissionIds);
            }
            const updated = await UserRepository_1.UserRepository.findById(id);
            // Log event
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Employee Updated',
                ipAddress: req.ip,
                details: { employeeId: id, updates: req.body },
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
    static async disableEmployee(req, res, next) {
        const id = req.params.id;
        const { isDisabled } = req.body;
        try {
            const updated = await UserRepository_1.UserRepository.update(id, { isDisabled: Boolean(isDisabled) });
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Employee Disabled',
                ipAddress: req.ip,
                details: { employeeId: id, isDisabled },
            });
            res.status(200).json({
                success: true,
                message: `Employee ${isDisabled ? 'disabled' : 'enabled'} successfully.`,
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async resetPassword(req, res, next) {
        const id = req.params.id;
        const { password } = req.body;
        if (!password) {
            return next(new errorHandler_1.AppError(400, 'Password is required.'));
        }
        try {
            const hash = await bcryptjs_1.default.hash(password, 10);
            await UserRepository_1.UserRepository.update(id, { passwordHash: hash });
            // Log event
            await AuditLogService_1.AuditLogService.log({
                userId: req.user?.id,
                userName: req.user?.fullName,
                action: 'Employee Created', // Password Reset logs under general security
                ipAddress: req.ip,
                details: { employeeId: id, action: 'Password reset' },
            });
            res.status(200).json({
                success: true,
                message: 'Password reset successful.',
            });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Audit Logs ---
    static async getAuditLogs(req, res, next) {
        try {
            const logs = await db_1.default.auditLog.findMany({
                orderBy: { timestamp: 'desc' },
                take: 100,
            });
            res.status(200).json({
                success: true,
                data: logs,
            });
        }
        catch (error) {
            next(error);
        }
    }
    // --- Reports & Analytics ---
    static async getDashboardStats(req, res, next) {
        try {
            const roomsList = await RoomRepository_1.RoomRepository.getAll();
            const totalRooms = roomsList.length;
            const availableRooms = roomsList.filter(r => r.status === 'AVAILABLE').length;
            const occupiedRooms = roomsList.filter(r => r.status === 'OCCUPIED').length;
            const bookedRooms = roomsList.filter(r => r.status === 'ADVANCE_BOOKED').length;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayCheckins = await db_1.default.checkIn.count({
                where: { checkInTime: { gte: today } },
            });
            const todayCheckouts = await db_1.default.checkIn.count({
                where: {
                    actualCheckOutTime: { gte: today },
                    status: 'CHECKED_OUT',
                },
            });
            const todayRevenue = await db_1.default.payment.aggregate({
                _sum: { amount: true },
                where: { paymentDate: { gte: today } },
            });
            const pendingPayments = await db_1.default.checkIn.aggregate({
                _sum: { remainingAmount: true },
                where: { status: 'ACTIVE' },
            });
            res.status(200).json({
                success: true,
                data: {
                    totalRooms,
                    availableRooms,
                    occupiedRooms,
                    bookedRooms,
                    todayCheckins,
                    todayCheckouts,
                    todayRevenue: todayRevenue._sum.amount || 0,
                    pendingPayments: pendingPayments._sum.remainingAmount || 0,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getReports(req, res, next) {
        try {
            // Aggregate monthly payments
            const payments = await db_1.default.payment.findMany();
            // Calculate revenue over time (simple grouping by date)
            const revenueTrend = {};
            payments.forEach((p) => {
                const dateStr = new Date(p.paymentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                revenueTrend[dateStr] = (revenueTrend[dateStr] || 0) + p.amount;
            });
            const revenueChart = Object.keys(revenueTrend).map((date) => ({
                date,
                revenue: revenueTrend[date],
            }));
            // Calculate simple occupancy rate metrics
            const roomsList = await RoomRepository_1.RoomRepository.getAll();
            const totalRooms = roomsList.length;
            const occupiedRooms = roomsList.filter(r => r.status === 'OCCUPIED').length;
            const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
            // Top Customers by total nights stay
            const topCustomers = await db_1.default.customer.findMany({
                include: {
                    checkIns: true,
                },
                take: 5,
            });
            const formattedCustomers = topCustomers.map((c) => ({
                id: c.id,
                fullName: c.fullName,
                mobileNumber: c.mobileNumber,
                totalStays: c.checkIns.length,
            }));
            // Ranks of room types occupied
            const roomUtilization = {
                Standard: 0,
                Deluxe: 0,
            };
            roomsList.forEach((r) => {
                if (r.status === 'OCCUPIED') {
                    roomUtilization[r.roomType] = (roomUtilization[r.roomType] || 0) + 1;
                }
            });
            // Detailed stay records
            const checkIns = await db_1.default.checkIn.findMany({
                orderBy: { checkInTime: 'desc' },
                include: {
                    customer: {
                        include: {
                            documents: true,
                        },
                    },
                    room: true,
                    payments: true,
                },
            });
            const detailedRecords = checkIns.map((ci) => {
                const addressParts = [
                    ci.customer.address,
                    ci.customer.city,
                    ci.customer.state,
                    ci.customer.country,
                    ci.customer.pincode,
                ].filter(Boolean);
                const completeAddress = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';
                const doc = ci.customer.documents[0];
                const idCardType = doc?.idType || 'N/A';
                const idCardNumber = doc?.idNumber || 'N/A';
                const checkoutTime = ci.actualCheckOutTime || ci.expectedCheckOutDate || new Date();
                const diffMs = new Date(checkoutTime).getTime() - new Date(ci.checkInTime).getTime();
                const bednights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                const pricePaid = ci.payments.reduce((sum, p) => sum + p.amount, 0);
                return {
                    id: ci.id,
                    checkInTime: ci.checkInTime,
                    actualCheckOutTime: ci.actualCheckOutTime,
                    status: ci.status,
                    customerName: ci.customer.fullName,
                    mobileNumber: ci.customer.mobileNumber,
                    completeAddress,
                    idCardType,
                    idCardNumber,
                    state: ci.customer.state || 'N/A',
                    nationality: ci.customer.country || 'N/A',
                    roomNumber: ci.room.roomNumber,
                    pricePaid,
                    numberOfGuests: ci.numberOfGuests,
                    bednights,
                };
            });
            // State-wise aggregation
            const stateSummary = {};
            checkIns.forEach((ci) => {
                const state = ci.customer.state || 'Unknown';
                const checkoutTime = ci.actualCheckOutTime || ci.expectedCheckOutDate || new Date();
                const diffMs = new Date(checkoutTime).getTime() - new Date(ci.checkInTime).getTime();
                const bednights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                if (!stateSummary[state]) {
                    stateSummary[state] = {
                        state,
                        customers: 0,
                        bednights: 0,
                    };
                }
                stateSummary[state].customers += 1;
                stateSummary[state].bednights += bednights;
            });
            const stateWiseData = Object.values(stateSummary);
            res.status(200).json({
                success: true,
                data: {
                    occupancyRate,
                    revenueChart,
                    topCustomers: formattedCustomers,
                    roomUtilization,
                    detailedRecords,
                    stateWiseData,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getSystemPermissions(req, res, next) {
        try {
            const permissions = await db_1.default.permission.findMany();
            res.status(200).json({
                success: true,
                data: permissions,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AdminController = AdminController;
