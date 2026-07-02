import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { UserRepository } from '../repositories/UserRepository';
import { AuditLogService } from '../services/AuditLogService';
import { AppError } from '../middleware/errorHandler';
import { RoomRepository } from '../repositories/RoomRepository';
import { RedisService } from '../services/RedisService';
import { RevenueService } from '../services/RevenueService';

export class AdminController {
  // --- Employee Management ---
  static async getAllEmployees(req: Request, res: Response, next: NextFunction) {
    try {
      const employees = await UserRepository.getAll();
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
    } catch (error) {
      next(error);
    }
  }

  static async createEmployee(req: Request, res: Response, next: NextFunction) {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return next(new AppError(400, 'Required parameters are missing.'));
    }

    try {
      const existing = await UserRepository.findByEmail(email);
      if (existing) {
        return next(new AppError(409, 'Email already registered.'));
      }

      const hash = await bcrypt.hash(password, 10);
      const employeeRole = await prisma.role.findFirst({ where: { name: 'EMPLOYEE' } });
      if (!employeeRole) {
        return next(new AppError(500, 'Staff role not found. Seed the database first.'));
      }

      const emp = await UserRepository.create({
        email,
        passwordHash: hash,
        fullName,
        roleId: employeeRole.id,
      });

      // Log event
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Employee Created',
        ipAddress: req.ip as string,
        details: { employeeId: emp.id, email },
      });

      res.status(201).json({
        success: true,
        data: emp,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateEmployee(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    const { fullName, isDisabled, permissionIds, resetToDefault } = req.body;

    try {
      await UserRepository.update(id, {
        fullName,
        isDisabled: isDisabled !== undefined ? Boolean(isDisabled) : undefined,
      });

      if (resetToDefault) {
        await UserRepository.resetCustomPermissions(id);
      } else if (permissionIds && Array.isArray(permissionIds)) {
        await UserRepository.setCustomPermissions(id, permissionIds);
      }

      const updated = await UserRepository.findById(id);

      // Log event
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Employee Updated',
        ipAddress: req.ip as string,
        details: { employeeId: id, updates: req.body },
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async disableEmployee(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    const { isDisabled } = req.body;

    try {
      const updated = await UserRepository.update(id, { isDisabled: Boolean(isDisabled) });

      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Employee Disabled',
        ipAddress: req.ip as string,
        details: { employeeId: id, isDisabled },
      });

      res.status(200).json({
        success: true,
        message: `Employee ${isDisabled ? 'disabled' : 'enabled'} successfully.`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    const { password } = req.body;

    if (!password) {
      return next(new AppError(400, 'Password is required.'));
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      await UserRepository.update(id, { passwordHash: hash });

      // Log event
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Employee Created', // Password Reset logs under general security
        ipAddress: req.ip as string,
        details: { employeeId: id, action: 'Password reset' },
      });

      res.status(200).json({
        success: true,
        message: 'Password reset successful.',
      });
    } catch (error) {
      next(error);
    }
  }

  // --- Audit Logs ---
  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      const roomIdsToLookup = new Set<string>();
      const customerIdsToLookup = new Set<string>();

      const parsedDetailsList = logs.map(log => {
        if (!log.details) return null;
        try {
          return JSON.parse(log.details);
        } catch {
          return null;
        }
      });

      const collectIds = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        if (obj.roomId && typeof obj.roomId === 'string' && obj.roomId.length === 36) {
          roomIdsToLookup.add(obj.roomId);
        }
        if (obj.roomIds && Array.isArray(obj.roomIds)) {
          obj.roomIds.forEach((id: any) => {
            if (typeof id === 'string' && id.length === 36) {
              roomIdsToLookup.add(id);
            }
          });
        }

        if (obj.customerId && typeof obj.customerId === 'string' && obj.customerId.length === 36) {
          customerIdsToLookup.add(obj.customerId);
        }
        if (obj.customerIds && Array.isArray(obj.customerIds)) {
          obj.customerIds.forEach((id: any) => {
            if (typeof id === 'string' && id.length === 36) {
              customerIdsToLookup.add(id);
            }
          });
        }

        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof obj[key] === 'object') {
              collectIds(obj[key]);
            }
          }
        }
      };

      parsedDetailsList.forEach(details => {
        if (details) collectIds(details);
      });

      const roomMap = new Map<string, string>();
      if (roomIdsToLookup.size > 0) {
        const rooms = await prisma.room.findMany({
          where: { id: { in: Array.from(roomIdsToLookup) } },
          select: { id: true, roomNumber: true }
        });
        rooms.forEach(r => roomMap.set(r.id, r.roomNumber));
      }

      const customerMap = new Map<string, string>();
      if (customerIdsToLookup.size > 0) {
        const customers = await prisma.customer.findMany({
          where: { id: { in: Array.from(customerIdsToLookup) } },
          select: { id: true, fullName: true }
        });
        customers.forEach(c => customerMap.set(c.id, c.fullName));
      }

      const enrichObject = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        if (obj.roomId && roomMap.has(obj.roomId)) {
          obj.roomNumber = roomMap.get(obj.roomId);
        }
        if (obj.roomIds && Array.isArray(obj.roomIds)) {
          const numbers = obj.roomIds.map((id: string) => roomMap.get(id)).filter(Boolean);
          if (numbers.length > 0) {
            obj.roomNumbers = numbers.join(', ');
          }
        }

        if (obj.customerId && customerMap.has(obj.customerId)) {
          obj.customerName = customerMap.get(obj.customerId);
        }
        if (obj.customerIds && Array.isArray(obj.customerIds)) {
          const names = obj.customerIds.map((id: string) => customerMap.get(id)).filter(Boolean);
          if (names.length > 0) {
            obj.customerNames = names.join(', ');
          }
        }

        if (obj.updates && typeof obj.updates === 'object') {
          const updatesCopy = { ...obj.updates };
          if (updatesCopy.roomId && roomMap.has(updatesCopy.roomId)) {
            updatesCopy.roomNumber = roomMap.get(updatesCopy.roomId)!;
            delete updatesCopy.roomId;
          }
          if (updatesCopy.customerId && customerMap.has(updatesCopy.customerId)) {
            updatesCopy.customerName = customerMap.get(updatesCopy.customerId)!;
            delete updatesCopy.customerId;
          }
          obj.updates = updatesCopy;
        }

        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof obj[key] === 'object' && obj[key] !== null && key !== 'updates') {
              enrichObject(obj[key]);
            }
          }
        }
      };

      const enrichedLogs = logs.map((log, index) => {
        const details = parsedDetailsList[index];
        if (!details) return log;

        enrichObject(details);
        return {
          ...log,
          details: JSON.stringify(details)
        };
      });

      res.status(200).json({
        success: true,
        data: enrichedLogs,
      });
    } catch (error) {
      next(error);
    }
  }

  // --- Reports & Analytics ---
  static async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      // Check Redis cache first
      const cachedStats = await RedisService.get('dashboard-stats');
      if (cachedStats) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cachedStats),
        });
      }

      const roomsList = await RoomRepository.getAll();
      const totalRooms = roomsList.length;
      const availableRooms = roomsList.filter(r => r.status === 'AVAILABLE').length;
      const occupiedRooms = roomsList.filter(r => r.status === 'OCCUPIED').length;
      const bookedRooms = roomsList.filter(r => r.status === 'ADVANCE_BOOKED').length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayCheckins = await prisma.checkIn.count({
        where: { checkInTime: { gte: today } },
      });

      const todayCheckouts = await prisma.checkIn.count({
        where: {
          actualCheckOutTime: { gte: today },
          status: 'CHECKED_OUT',
        },
      });

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const revenueData = await RevenueService.calculateRevenue(today, todayEnd);

      const pendingPayments = await prisma.checkIn.aggregate({
        _sum: { remainingAmount: true },
        where: { status: 'ACTIVE' },
      });

      const statsData = {
        totalRooms,
        availableRooms,
        occupiedRooms,
        bookedRooms,
        todayCheckins,
        todayCheckouts,
        todayRevenue: revenueData.totalRevenue,
        pendingPayments: pendingPayments._sum.remainingAmount || 0,
      };

      // Cache stats in Redis for 30 seconds
      await RedisService.set('dashboard-stats', JSON.stringify(statsData), 30);

      res.status(200).json({
        success: true,
        data: statsData,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getReports(req: Request, res: Response, next: NextFunction) {
    try {
      // Get all stays to find first check-in date
      const firstStay = await prisma.checkIn.findFirst({
        orderBy: { checkInTime: 'asc' },
        select: { checkInTime: true }
      });

      const start = firstStay ? new Date(firstStay.checkInTime) : new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const revenueData = await RevenueService.calculateRevenue(start, end);

      // Calculate revenue over time (grouping by date)
      const revenueTrend: Record<string, number> = {};
      for (const key of Object.keys(revenueData.dailyBreakdown)) {
        const day = revenueData.dailyBreakdown[key];
        const dateStr = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        revenueTrend[dateStr] = (revenueTrend[dateStr] || 0) + day.totalRevenue;
      }

      const revenueChart = Object.keys(revenueTrend).map((date) => ({
        date,
        revenue: revenueTrend[date],
      }));

      // Calculate simple occupancy rate metrics
      const roomsList = await RoomRepository.getAll();
      const totalRooms = roomsList.length;
      const occupiedRooms = roomsList.filter(r => r.status === 'OCCUPIED').length;
      const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

      // Top Customers by total nights stay
      const topCustomers = await prisma.customer.findMany({
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
      const roomUtilization: Record<string, number> = {
        Standard: 0,
        Deluxe: 0,
      };

      roomsList.forEach((r) => {
        if (r.status === 'OCCUPIED') {
          roomUtilization[r.roomType] = (roomUtilization[r.roomType] || 0) + 1;
        }
      });

      // Detailed stay records
      const checkIns = await prisma.checkIn.findMany({
        orderBy: { createdAt: 'desc' },
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
        const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const bednights = nights * ci.numberOfGuests;

        const roomPrice = ci.pricePerNight;

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
          state: formatStateName(ci.customer.state || 'N/A'),
          nationality: ci.customer.country || 'N/A',
          roomNumber: ci.room.roomNumber,
          roomPrice,
          numberOfGuests: ci.numberOfGuests,
          bednights,
          registrationNumber: ci.registrationNumber || 'N/A',
        };
      });

      detailedRecords.sort((a, b) => {
        const getRegNum = (rec: any) => {
          if (!rec.registrationNumber) return null;
          const match = rec.registrationNumber.match(/\d+/);
          return match ? parseInt(match[0], 10) : null;
        };

        const numA = getRegNum(a);
        const numB = getRegNum(b);

        if (numA !== null && numB !== null && numA !== numB) {
          return numB - numA;
        }
        return new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime();
      });

      // State-wise aggregation
      const stateSummary: Record<string, { state: string; customers: number; bednights: number }> = {};
      checkIns.forEach((ci) => {
        const state = formatStateName(ci.customer.state || 'Unknown');
        const checkoutTime = ci.actualCheckOutTime || ci.expectedCheckOutDate || new Date();
        const diffMs = new Date(checkoutTime).getTime() - new Date(ci.checkInTime).getTime();
        const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const bednights = nights * ci.numberOfGuests;

        if (!stateSummary[state]) {
          stateSummary[state] = {
            state,
            customers: 0,
            bednights: 0,
          };
        }
        stateSummary[state].customers += ci.numberOfGuests;
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
    } catch (error) {
      next(error);
    }
  }

  static async getRevenueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const startDateStr = req.query.startDate as string;
      const endDateStr = req.query.endDate as string;

      if (!startDateStr || !endDateStr) {
        return next(new AppError(400, 'Start date and end date are required.'));
      }

      const start = new Date(`${startDateStr}T00:00:00`);
      const end = new Date(`${endDateStr}T23:59:59.999`);

      const rev = await RevenueService.calculateRevenue(start, end);

      res.status(200).json({
        success: true,
        data: {
          totalRevenue: rev.totalRevenue,
          roomRevenue: rev.roomRevenue,
          additionalItemsRevenue: rev.additionalItemsRevenue,
          bookingsCount: rev.bookingsCount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async getSystemPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const permissions = await prisma.permission.findMany();
      res.status(200).json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      next(error);
    }
  }
}

function formatStateName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed || trimmed === 'N/A') return 'N/A';
  if (trimmed.toLowerCase() === 'unknown') return 'Unknown';

  const STATE_MAP: Record<string, string> = {
    andhrapradesh: 'Andhra Pradesh',
    ap: 'Andhra Pradesh',
    arunachalpradesh: 'Arunachal Pradesh',
    assam: 'Assam',
    bihar: 'Bihar',
    chhattisgarh: 'Chhattisgarh',
    goa: 'Goa',
    gujarat: 'Gujarat',
    haryana: 'Haryana',
    himachalpradesh: 'Himachal Pradesh',
    hp: 'Himachal Pradesh',
    jharkhand: 'Jharkhand',
    karnataka: 'Karnataka',
    kerala: 'Kerala',
    madhyapradesh: 'Madhya Pradesh',
    mp: 'Madhya Pradesh',
    maharashtra: 'Maharashtra',
    manipur: 'Manipur',
    meghalaya: 'Meghalaya',
    mizoram: 'Mizoram',
    nagaland: 'Nagaland',
    odisha: 'Odisha',
    orissa: 'Odisha',
    punjab: 'Punjab',
    rajasthan: 'Rajasthan',
    sikkim: 'Sikkim',
    tamilnadu: 'Tamil Nadu',
    telangana: 'Telangana',
    tripura: 'Tripura',
    uttarpradesh: 'Uttar Pradesh',
    up: 'Uttar Pradesh',
    uttarakhand: 'Uttarakhand',
    westbengal: 'West Bengal',
    delhi: 'Delhi',
    pondicherry: 'Puducherry',
    puducherry: 'Puducherry',
    chandigarh: 'Chandigarh',
    ladakh: 'Ladakh',
    jammuandkashmir: 'Jammu and Kashmir',
    andamanandnicobarislands: 'Andaman and Nicobar Islands',
    andamanandnicobar: 'Andaman and Nicobar Islands',
    dadraandnagarhavelianddamananddiu: 'Dadra and Nagar Haveli and Daman and Diu',
    dadraandnagarhaveli: 'Dadra and Nagar Haveli and Daman and Diu',
    damananddiu: 'Dadra and Nagar Haveli and Daman and Diu',
    lakshadweep: 'Lakshadweep'
  };

  const key = trimmed.toLowerCase().replace(/\s+/g, '');
  if (STATE_MAP[key]) {
    return STATE_MAP[key];
  }

  const standardized = trimmed.replace(/\s+/g, ' ');
  return standardized
    .toLowerCase()
    .split(' ')
    .map((word, idx) => {
      const minorWords = ['and', 'of', 'the'];
      if (minorWords.includes(word) && idx > 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
