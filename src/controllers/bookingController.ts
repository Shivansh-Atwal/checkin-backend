import { Request, Response, NextFunction } from 'express';
import { BookingRepository } from '../repositories/BookingRepository';
import { RoomRepository } from '../repositories/RoomRepository';
import { CustomerRepository } from '../repositories/CustomerRepository';
import { CheckInRepository } from '../repositories/CheckInRepository';
import { NotificationService } from '../services/NotificationService';
import { AuditLogService } from '../services/AuditLogService';
import { AppError } from '../middleware/errorHandler';
import { RedisService } from '../services/RedisService';

export class BookingController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string;
      const q = req.query.q as string;
      const bookings = await BookingRepository.getAll({ status, search: q });
      res.status(200).json({
        success: true,
        data: bookings,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const booking = await BookingRepository.findById(id);
      if (!booking) {
        return next(new AppError(404, 'Booking not found.'));
      }
      res.status(200).json({
        success: true,
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    const { customerId, mobileNumber, customerName, roomId, roomIds, checkInDate, checkOutDate, numberOfGuests, advancePayment, price, notes, registrationNumber } = req.body;

    const targetRoomIds = roomIds && Array.isArray(roomIds) && roomIds.length > 0 ? roomIds : (roomId ? [roomId] : []);

    if ((!customerId && (!customerName || !mobileNumber)) || targetRoomIds.length === 0 || !checkInDate || !checkOutDate || !price) {
      return next(new AppError(400, 'Required reservation details are missing.'));
    }

    try {
      let resolvedCustomerId = customerId;

      // 1. Check/create customer if doing Walk-In style booking
      if (!resolvedCustomerId) {
        let existingCust = await CustomerRepository.findByMobile(mobileNumber);
        if (!existingCust) {
          const newCust = await CustomerRepository.create({
            fullName: customerName,
            mobileNumber,
          });
          if (!newCust) {
            return next(new AppError(500, 'Guest creation failed.'));
          }
          existingCust = newCust;
        }
        resolvedCustomerId = existingCust.id;
      }

      const baseReg = registrationNumber || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      // 2. Verify Room Availability
      let roomNumbers = [];
      for (const rId of targetRoomIds) {
        const room = await RoomRepository.findById(rId);
        if (!room) {
          return next(new AppError(400, `Room ${rId} is not available for booking.`));
        }
        roomNumbers.push(room.roomNumber);
      }

      const regNum = targetRoomIds.length > 1 ? `${baseReg}-${roomNumbers.join('-')}` : baseReg;

      // 3. Create Booking
      const booking = await BookingRepository.create({
        customerId: resolvedCustomerId,
        roomIds: targetRoomIds,
        checkInDate: new Date(checkInDate),
        checkOutDate: new Date(checkOutDate),
        numberOfGuests: Number(numberOfGuests || 1),
        advancePayment: Number(advancePayment || 0),
        price: Number(price),
        notes,
        registrationNumber: regNum,
      });

      if (!booking) {
        return next(new AppError(500, 'Booking transaction failed.'));
      }

      // Send confirmation notification
      await NotificationService.sendBookingConfirmation(
        booking.customer.fullName,
        booking.customer.mobileNumber,
        booking.bookingNumber,
        roomNumbers.join(', ')
      );

      // Audit action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Booking Created',
        ipAddress: req.ip as string,
        details: { bookingId: booking.id, bookingNumber: booking.bookingNumber, roomIds: targetRoomIds },
      });

      // Invalidate dashboard stats
      await RedisService.invalidateDashboardStats();

      res.status(201).json({
        success: true,
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      if (id === 'offline') {
        const synced = await BookingController.upsertOfflineBooking(req);

        await AuditLogService.log({
          userId: req.user?.id,
          userName: req.user?.fullName,
          action: 'Offline Booking Synced',
          ipAddress: req.ip as string,
          details: {
            clientId: req.body.clientId,
            registrationNumber: req.body.registrationNumber,
            serverId: synced?.id,
          },
        });

        await RedisService.invalidateDashboardStats();

        res.status(200).json({
          success: true,
          data: synced,
        });
        return;
      }

      const updated = await BookingRepository.update(id, req.body);

      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Booking Updated',
        ipAddress: req.ip as string,
        details: { bookingId: id, updates: req.body },
      });

      // Invalidate dashboard stats
      await RedisService.invalidateDashboardStats();

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error: any) {
      if (error?.code === 'P2002' && error?.meta?.target?.includes('mobileNumber')) {
        return next(new AppError(400, 'Mobile number is already registered to another guest.'));
      }
      if (error?.message === 'Record not found' || error?.code === 'P2025') {
        return next(new AppError(404, 'Booking or Check-in record not found.'));
      }
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      const result = await BookingRepository.delete(id);

      if (result.deleted) {
        await AuditLogService.log({
          userId: req.user?.id,
          userName: req.user?.fullName,
          action: 'Booking Deleted',
          ipAddress: req.ip as string,
          details: { bookingId: id },
        });

        await RedisService.invalidateDashboardStats();
      }

      res.status(200).json({
        success: true,
        message: result.deleted
          ? 'Booking deleted successfully.'
          : 'Booking already absent.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      const updated = await BookingRepository.update(id, { status: 'CANCELLED' });

      // Log audit
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Booking Updated',
        ipAddress: req.ip as string,
        details: { bookingId: id, status: 'CANCELLED' },
      });

      // Invalidate dashboard stats
      await RedisService.invalidateDashboardStats();

      res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getNextReg(req: Request, res: Response, next: NextFunction) {
    try {
      const nextReg = await BookingRepository.getNextRegistrationNumber();
      res.status(200).json({
        success: true,
        data: nextReg,
      });
    } catch (error) {
      next(error);
    }
  }

  private static async upsertOfflineBooking(req: Request) {
    const payload = req.body;
    const normalizedPayload = BookingController.normalizeOfflineBookingPayload(payload);
    const existing = await BookingRepository.findByOfflineKey({
      id: payload.id,
      clientId: payload.offlineId || payload.clientId,
      registrationNumber: payload.registrationNumber,
    });

    if (existing) {
      return BookingRepository.update(existing.id, normalizedPayload);
    }

    if (normalizedPayload.status === 'CHECKED_OUT') {
      throw new AppError(404, 'Offline checkout target was not found. Sync the original check-in before checkout.');
    }

    let resolvedCustomerId = payload.customerId;
    if (!resolvedCustomerId) {
      if (!payload.customerName || !payload.mobileNumber) {
        throw new AppError(400, 'Required guest details are missing.');
      }

      let customer = await CustomerRepository.findByMobile(payload.mobileNumber);
      if (!customer) {
        const newCustomer = await CustomerRepository.create({
          fullName: payload.customerName,
          mobileNumber: payload.mobileNumber,
          address: payload.address,
          city: payload.city,
          state: payload.state,
          country: payload.country,
          pincode: payload.pincode,
          document: payload.document,
        });
        if (!newCustomer) {
          throw new AppError(500, 'Customer profile creation failed.');
        }
        customer = newCustomer;
      } else {
        await CustomerRepository.update(customer.id, {
          address: payload.address || customer.address || undefined,
          city: payload.city || customer.city || undefined,
          state: payload.state || customer.state || undefined,
          country: payload.country || customer.country || undefined,
          pincode: payload.pincode || customer.pincode || undefined,
          document: payload.document,
        });
      }
      resolvedCustomerId = customer.id;
    }

    const roomIds = Array.isArray(payload.roomIds) && payload.roomIds.length > 0
      ? payload.roomIds
      : payload.roomId
        ? [payload.roomId]
        : [];

    if (roomIds.length === 0) {
      throw new AppError(400, 'At least one room is required.');
    }

    for (const roomId of roomIds) {
      const room = await RoomRepository.findById(roomId);
      if (!room) {
        throw new AppError(400, `Selected room ${roomId} is not available.`);
      }
    }

    let checkInTime: Date | undefined;
    if (payload.checkInTime) {
      checkInTime = new Date(payload.checkInTime);
    } else if (payload.arrivalDate && payload.arrivalTime) {
      checkInTime = new Date(`${payload.arrivalDate}T${payload.arrivalTime}`);
    } else if (payload.checkInDate) {
      checkInTime = new Date(payload.checkInDate);
    }

    const checkIn = await CheckInRepository.createWalkIn({
      customerId: resolvedCustomerId,
      roomIds,
      numberOfGuests: Number(payload.numberOfGuests || 1),
      checkInTime,
      expectedCheckOutDate: payload.expectedCheckOutDate
        ? new Date(payload.expectedCheckOutDate)
        : payload.checkOutDate
          ? new Date(payload.checkOutDate)
          : undefined,
      advancePaid: Number(payload.advancePaid || payload.advancePayment || 0),
      remainingAmount: Number(payload.remainingAmount || 0),
      paymentMethod: payload.paymentMethod,
      registrationNumber: payload.registrationNumber,
      pricePerNight: Number(payload.pricePerNight || payload.price || 0),
      roomPrices: payload.roomPrices,
      extraBedsCount: Number(payload.extraBedsCount || 0),
      extraBedPrice: Number(payload.extraBedPrice || 0),
    });

    if (!checkIn) {
      throw new AppError(500, 'Offline booking sync failed.');
    }

    return checkIn;
  }

  private static normalizeOfflineBookingPayload(payload: any) {
    const checkInDate = payload.checkInDate
      || payload.checkInTime
      || (payload.arrivalDate && payload.arrivalTime ? `${payload.arrivalDate}T${payload.arrivalTime}` : payload.arrivalDate);

    const checkOutDate = payload.checkOutDate
      || payload.expectedCheckOutDate
      || (payload.checkoutDate && payload.checkoutTime ? `${payload.checkoutDate}T${payload.checkoutTime}` : payload.checkoutDate);

    const status = payload.status
      || (payload.bookingStatus === 'Check Out'
        ? 'CHECKED_OUT'
        : payload.bookingStatus === 'Check In'
          ? 'CHECKED_IN'
          : undefined);

    return {
      ...payload,
      checkInDate,
      checkOutDate,
      status,
      roomIds: payload.roomIds || (payload.roomId ? [payload.roomId] : []),
      price: payload.price ?? payload.pricePerNight,
      advancePayment: payload.advancePayment ?? payload.advancePaid,
    };
  }
}
