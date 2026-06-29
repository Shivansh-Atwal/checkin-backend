import { Request, Response, NextFunction } from 'express';
import { CheckInRepository } from '../repositories/CheckInRepository';
import { CheckoutRepository } from '../repositories/CheckoutRepository';
import { RoomRepository } from '../repositories/RoomRepository';
import { CustomerRepository } from '../repositories/CustomerRepository';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { InvoiceService } from '../services/InvoiceService';
import { NotificationService } from '../services/NotificationService';
import { AuditLogService } from '../services/AuditLogService';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/db';
import { RedisService } from '../services/RedisService';

export class CheckoutController {
  static async getActiveCheckIns(req: Request, res: Response, next: NextFunction) {
    try {
      const checkins = await CheckInRepository.getAllActive();
      res.status(200).json({
        success: true,
        data: checkins,
      });
    } catch (error) {
      next(error);
    }
  }

  static async checkInWalkIn(req: Request, res: Response, next: NextFunction) {
    const {
      customerId,
      customerName,
      mobileNumber,
      roomId,
      roomIds,
      numberOfGuests,
      numberOfRooms, // Added to ask for number of rooms
      arrivalDate,
      arrivalTime,
      expectedCheckOutDate,
      advancePaid,
      remainingAmount,
      paymentMethod,
      pincode,
      state,
      country,
      address,
      city,
      registrationNumber,
      pricePerNight,
      document, // Extract document info
      roomPrices,
      extraBedsCount,
      extraBedPrice,
    } = req.body;

    if (!customerId && (!customerName || !mobileNumber)) {
      return next(new AppError(400, 'Required guest check-in details are missing.'));
    }

    try {
      let resolvedCustomerId = customerId;

      if (!resolvedCustomerId) {
        let existingCust = await CustomerRepository.findByMobile(mobileNumber);
        if (!existingCust) {
          const newCust = await CustomerRepository.create({
            fullName: customerName,
            mobileNumber,
            address,
            city,
            state,
            country,
            pincode,
            document, // Create document if sent
          });
          if (!newCust) {
            return next(new AppError(500, 'Customer profile creation failed.'));
          }
          existingCust = newCust;
        } else {
          // Update address details for existing guest if provided
          await CustomerRepository.update(existingCust.id, {
            address: address || existingCust.address || undefined,
            city: city || existingCust.city || undefined,
            state: state || existingCust.state || undefined,
            country: country || existingCust.country || undefined,
            pincode: pincode || existingCust.pincode || undefined,
            document, // Update document if sent
          });
        }
        resolvedCustomerId = existingCust.id;
      }

      if (registrationNumber) {
        const existingReg = await prisma.checkIn.findFirst({
          where: {
            OR: [
              { registrationNumber: registrationNumber },
              { registrationNumber: { startsWith: `${registrationNumber}-` } }
            ]
          }
        });
        if (existingReg) {
          return next(new AppError(400, `Registration number '${registrationNumber}' is already in use.`));
        }
      }

      let roomIdsToAllocate: string[] = [];
      if (roomIds && Array.isArray(roomIds) && roomIds.length > 0) {
        roomIdsToAllocate = roomIds;
      } else {
        // 1. Fetch available rooms to verify capacity
        const requestedRoomsCount = Math.max(1, Number(numberOfRooms || 1));
        const availableRooms = await RoomRepository.getAll({ status: 'AVAILABLE' });

        // Automatically allocate first free room if not provided
        let primaryRoomId = roomId;
        if (!primaryRoomId) {
          if (availableRooms.length === 0) {
            return next(new AppError(400, 'No rooms are currently available.'));
          }
          primaryRoomId = availableRooms[0].id;
        }

        const room = await RoomRepository.findById(primaryRoomId);
        if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
          return next(new AppError(400, 'Selected room is not available.'));
        }

        // If the selected room is AVAILABLE, it is already counted in availableRooms.
        // If it is ADVANCE_BOOKED, we need it plus (requestedRoomsCount - 1) other AVAILABLE rooms.
        const isSelectedRoomAvailable = room.status === 'AVAILABLE';
        const neededFreeRooms = isSelectedRoomAvailable ? requestedRoomsCount : requestedRoomsCount - 1;
        const totalFreeRoomsCount = isSelectedRoomAvailable ? availableRooms.length : availableRooms.length + 1;

        if (availableRooms.length < neededFreeRooms) {
          return next(
            new AppError(
              450,
              `Not enough rooms are free. Only ${totalFreeRoomsCount} rooms are currently free.`
            )
          );
        }

        // Compile allocation list
        roomIdsToAllocate = [primaryRoomId];
        const otherFreeRooms = availableRooms.filter((r) => r.id !== primaryRoomId);
        for (let i = 0; i < requestedRoomsCount - 1; i++) {
          if (otherFreeRooms[i]) {
            roomIdsToAllocate.push(otherFreeRooms[i].id);
          }
        }
      }

      // Verify all allocation rooms are actually valid and available/booked
      for (const rId of roomIdsToAllocate) {
        const room = await RoomRepository.findById(rId);
        if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
          return next(new AppError(400, `Selected room ${room?.roomNumber || rId} is not available.`));
        }
      }

      // Build custom checkInTime Date object if provided
      let customCheckInTime: Date | undefined = undefined;
      if (req.body.checkInTime) {
        customCheckInTime = new Date(req.body.checkInTime);
      } else if (arrivalDate && arrivalTime) {
        customCheckInTime = new Date(`${arrivalDate}T${arrivalTime}`);
      } else if (arrivalDate) {
        customCheckInTime = new Date(arrivalDate);
      }

      const checkIn = await CheckInRepository.createWalkIn({
        customerId: resolvedCustomerId,
        roomIds: roomIdsToAllocate,
        numberOfGuests: Number(numberOfGuests || 1),
        checkInTime: customCheckInTime,
        expectedCheckOutDate: expectedCheckOutDate ? new Date(expectedCheckOutDate) : undefined,
        advancePaid: Number(advancePaid || 0),
        remainingAmount: Number(remainingAmount || 0),
        paymentMethod,
        registrationNumber,
        pricePerNight: Number(pricePerNight || 0),
        roomPrices,
        extraBedsCount: Number(extraBedsCount || 0),
        extraBedPrice: Number(extraBedPrice || 0),
      });

      if (!checkIn) {
        return next(new AppError(500, 'Walk-in check-in failed.'));
      }

      // Send greeting notification
      await NotificationService.sendCheckInReminder(
        checkIn.customer.fullName,
        checkIn.customer.mobileNumber,
        checkIn.room.roomNumber
      );

      // Audit log
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Customer Check-in',
        ipAddress: req.ip as string,
        details: { checkInId: checkIn.id, roomIds: roomIdsToAllocate },
      });

      await RedisService.invalidateDashboardStats();

      res.status(201).json({
        success: true,
        data: checkIn,
      });
    } catch (error) {
      next(error);
    }
  }

  static async checkInBooking(req: Request, res: Response, next: NextFunction) {
    const {
      bookingId,
      numberOfRooms, // Added to ask for number of rooms
      roomIds,
      arrivalDate,
      arrivalTime,
      expectedCheckOutDate,
      numberOfGuests,
      advancePaid,
      remainingAmount,
      paymentMethod,
      registrationNumber,
      pricePerNight,
      address,
      city,
      state,
      country,
      pincode,
      document,
      roomPrices,
      extraBedsCount,
      extraBedPrice,
    } = req.body;

    if (!bookingId) {
      return next(new AppError(400, 'Booking ID is required.'));
    }

    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        return next(new AppError(404, 'Booking not found.'));
      }

      // Update customer details if provided
      if (address || city || state || country || pincode || document) {
        await CustomerRepository.update(booking.customerId, {
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || undefined,
          pincode: pincode || undefined,
          document,
        });
      }

      if (registrationNumber) {
        const existingReg = await prisma.checkIn.findFirst({
          where: {
            OR: [
              { registrationNumber: registrationNumber },
              { registrationNumber: { startsWith: `${registrationNumber}-` } }
            ]
          }
        });
        if (existingReg) {
          return next(new AppError(400, `Registration number '${registrationNumber}' is already in use.`));
        }
      }

      let roomIdsToAllocate: string[] = [];
      if (roomIds && Array.isArray(roomIds) && roomIds.length > 0) {
        roomIdsToAllocate = roomIds;
      } else {
        const requestedRoomsCount = Math.max(1, Number(numberOfRooms || 1));
        const availableRooms = await RoomRepository.getAll({ status: 'AVAILABLE' });

        const bookingRoom = await RoomRepository.findById(booking.roomId);
        if (!bookingRoom) {
          return next(new AppError(404, 'Room associated with the booking not found.'));
        }
        if (bookingRoom.status !== 'AVAILABLE' && bookingRoom.status !== 'ADVANCE_BOOKED') {
          return next(
            new AppError(
              400,
              `Room ${bookingRoom.roomNumber} is currently ${bookingRoom.status.toLowerCase().replace('_', ' ')}. Please edit the booking to select a different room first.`
            )
          );
        }
        const isBookingRoomAvailable = bookingRoom.status === 'AVAILABLE';
        const neededFreeRooms = isBookingRoomAvailable ? requestedRoomsCount : requestedRoomsCount - 1;
        const totalFreeRoomsCount = isBookingRoomAvailable ? availableRooms.length : availableRooms.length + 1;

        if (availableRooms.length < neededFreeRooms) {
          return next(
            new AppError(
              400,
              `Not enough rooms are free. Only ${totalFreeRoomsCount} rooms are currently free.`
            )
          );
        }

        // Compile allocation list
        roomIdsToAllocate = [booking.roomId];
        const otherFreeRooms = availableRooms.filter((r) => r.id !== booking.roomId);
        for (let i = 0; i < requestedRoomsCount - 1; i++) {
          if (otherFreeRooms[i]) {
            roomIdsToAllocate.push(otherFreeRooms[i].id);
          }
        }
      }

      // Verify all allocation rooms are actually valid and available/booked
      for (const rId of roomIdsToAllocate) {
        const room = await RoomRepository.findById(rId);
        if (!room || (room.status !== 'AVAILABLE' && room.status !== 'ADVANCE_BOOKED')) {
          return next(new AppError(400, `Selected room ${room?.roomNumber || rId} is not available.`));
        }
      }

      // Build custom checkInTime Date object if provided
      let customCheckInTime: Date | undefined = undefined;
      if (req.body.checkInTime) {
        customCheckInTime = new Date(req.body.checkInTime);
      } else if (arrivalDate && arrivalTime) {
        customCheckInTime = new Date(`${arrivalDate}T${arrivalTime}`);
      } else if (arrivalDate) {
        customCheckInTime = new Date(arrivalDate);
      }

      const checkIn = await CheckInRepository.createFromBooking({
        bookingId,
        roomIds: roomIdsToAllocate,
        numberOfGuests: Number(numberOfGuests || 1),
        checkInTime: customCheckInTime,
        expectedCheckOutDate: expectedCheckOutDate ? new Date(expectedCheckOutDate) : undefined,
        advancePaid: Number(advancePaid || 0),
        remainingAmount: Number(remainingAmount || 0),
        paymentMethod,
        registrationNumber,
        pricePerNight: pricePerNight !== undefined ? Number(pricePerNight) : undefined,
        roomPrices,
        extraBedsCount: extraBedsCount !== undefined ? Number(extraBedsCount) : undefined,
        extraBedPrice: extraBedPrice !== undefined ? Number(extraBedPrice) : undefined,
      });

      if (!checkIn) {
        return next(new AppError(500, 'Check-in from booking failed.'));
      }

      // Send checkin confirmation
      await NotificationService.sendCheckInReminder(
        checkIn.customer.fullName,
        checkIn.customer.mobileNumber,
        checkIn.room.roomNumber
      );

      // Audit log
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Customer Check-in',
        ipAddress: req.ip as string,
        details: { checkInId: checkIn.id, bookingId, roomIds: roomIdsToAllocate },
      });

      await RedisService.invalidateDashboardStats();

      res.status(201).json({
        success: true,
        data: checkIn,
      });
    } catch (error) {
      next(error);
    }
  }

  static async addPreviousStay(req: Request, res: Response, next: NextFunction) {
    const {
      customerId,
      customerName,
      mobileNumber,
      numberOfGuests,
      arrivalDate,
      arrivalTime,
      checkoutDate,
      checkoutTime,
      advancePaid,
      remainingAmount,
      paymentMethod,
      pincode,
      state,
      country,
      address,
      city,
      registrationNumber,
      pricePerNight,
      document,
      roomIds,
      roomPrices,
      extraBedsCount,
      extraBedPrice,
    } = req.body;

    if (!customerId && (!customerName || !mobileNumber)) {
      return next(new AppError(400, 'Required guest check-in details are missing.'));
    }
    if (!arrivalDate || !arrivalTime || !checkoutDate || !checkoutTime) {
      return next(new AppError(400, 'Arrival and Check-out dates and times are required for previous stay records.'));
    }

    try {
      let resolvedCustomerId = customerId;

      if (!resolvedCustomerId) {
        let existingCust = await CustomerRepository.findByMobile(mobileNumber);
        if (!existingCust) {
          const newCust = await CustomerRepository.create({
            fullName: customerName,
            mobileNumber,
            address,
            city,
            state,
            country,
            pincode,
            document,
          });
          if (!newCust) {
            return next(new AppError(500, 'Customer profile creation failed.'));
          }
          existingCust = newCust;
        } else {
          await CustomerRepository.update(existingCust.id, {
            address: address || existingCust.address || undefined,
            city: city || existingCust.city || undefined,
            state: state || existingCust.state || undefined,
            country: country || existingCust.country || undefined,
            pincode: pincode || existingCust.pincode || undefined,
            document,
          });
        }
        resolvedCustomerId = existingCust.id;
      }

      if (registrationNumber) {
        const existingReg = await prisma.checkIn.findFirst({
          where: {
            OR: [
              { registrationNumber: registrationNumber },
              { registrationNumber: { startsWith: `${registrationNumber}-` } }
            ]
          }
        });
        if (existingReg) {
          return next(new AppError(400, `Registration number '${registrationNumber}' is already in use.`));
        }
      }

      let roomIdsToAllocate: string[] = [];
      if (roomIds && Array.isArray(roomIds) && roomIds.length > 0) {
        roomIdsToAllocate = roomIds;
      } else {
        return next(new AppError(400, 'At least one room must be allocated for a stay record.'));
      }

      // Build check-in and check-out times
      const checkInTimeObj = new Date(`${arrivalDate}T${arrivalTime}`);
      const checkOutTimeObj = new Date(`${checkoutDate}T${checkoutTime}`);

      if (checkOutTimeObj.getTime() <= checkInTimeObj.getTime()) {
        return next(new AppError(400, 'Check-out date/time must be after check-in date/time.'));
      }

      const checkIn = await CheckInRepository.createPreviousStay({
        customerId: resolvedCustomerId,
        roomIds: roomIdsToAllocate,
        numberOfGuests: Number(numberOfGuests || 1),
        checkInTime: checkInTimeObj,
        expectedCheckOutDate: checkOutTimeObj,
        advancePaid: Number(advancePaid || 0),
        remainingAmount: Number(remainingAmount || 0),
        paymentMethod,
        registrationNumber,
        pricePerNight: Number(pricePerNight || 0),
        roomPrices,
        extraBedsCount: Number(extraBedsCount || 0),
        extraBedPrice: Number(extraBedPrice || 0),
      });

      if (!checkIn) {
        return next(new AppError(500, 'Adding previous stay record failed.'));
      }

      // Generate invoice URL asynchronously and save it to the Checkout records in background
      const createdCheckIns = await prisma.checkIn.findMany({
        where: {
          customerId: resolvedCustomerId,
          checkInTime: checkInTimeObj,
          status: 'CHECKED_OUT',
        },
        include: {
          checkoutRecord: true,
        }
      });

      for (const ci of createdCheckIns) {
        if (ci.checkoutRecord) {
          try {
            const invoiceUrl = await InvoiceService.generateInvoiceHTML(ci.checkoutRecord.id);
            await prisma.invoice.update({
              where: { checkoutId: ci.checkoutRecord.id },
              data: { pdfUrl: invoiceUrl },
            });
          } catch (invErr) {
            console.error('Failed to generate historical invoice:', invErr);
          }
        }
      }

      // Audit log
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Add Previous Stay',
        ipAddress: req.ip as string,
        details: { checkInId: checkIn.id, roomIds: roomIdsToAllocate },
      });

      await RedisService.invalidateDashboardStats();

      res.status(201).json({
        success: true,
        data: checkIn,
      });
    } catch (error) {
      next(error);
    }
  }

  static async previewBill(req: Request, res: Response, next: NextFunction) {
    const checkInId = req.params.checkInId as string;
    try {
      const checkIn = await CheckInRepository.findById(checkInId);
      if (!checkIn || checkIn.status !== 'ACTIVE') {
        return next(new AppError(404, 'No active stay record found.'));
      }

      const additionalCharges = Number(req.query.additionalCharges || 0);
      const discount = 0; // Force 0 discount
      const taxRate = Number(req.query.taxRate !== undefined ? req.query.taxRate : 0.0); // Default to 0.0 (no tax)

      const checkoutDate = req.query.checkoutDate as string;
      const checkoutTime = req.query.checkoutTime as string;
      let checkoutTimeObj = new Date();
      if (req.query.checkoutTimeISO) {
        checkoutTimeObj = new Date(req.query.checkoutTimeISO as string);
      } else if (checkoutDate && checkoutTime) {
        checkoutTimeObj = new Date(`${checkoutDate}T${checkoutTime}`);
      } else if (checkoutDate) {
        checkoutTimeObj = new Date(checkoutDate);
      }

      // Fetch all active stays for the same customer
      const activeStays = await prisma.checkIn.findMany({
        where: {
          customerId: checkIn.customerId,
          status: 'ACTIVE',
        },
        include: {
          room: true,
          customer: true,
          extraCharges: true,
        },
      });

      let totalRoomCharges = 0;
      let totalNights = 0;
      let totalAdvancePaid = 0;
      let totalExtraCharges = 0;

      const stayDetails = activeStays.map((stay) => {
        const diffMs = checkoutTimeObj.getTime() - new Date(stay.checkInTime).getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const nights = Math.max(1, diffDays);
        const extraBedCost = Number(stay.extraBedsCount || 0) * Number(stay.extraBedPrice || 0) * nights;
        const extraSum = (stay.extraCharges?.reduce((sum, item) => sum + item.amount, 0) || 0) + extraBedCost;
        totalExtraCharges += extraSum;

        const calc = InvoiceService.calculateStayBill({
          pricePerNight: stay.pricePerNight,
          checkInTime: stay.checkInTime,
          expectedCheckOutDate: checkoutTimeObj,
          additionalCharges: 0,
          discount: 0,
          taxRate: 0,
        });
        totalRoomCharges += calc.roomCharges;
        totalNights = Math.max(totalNights, calc.nights);
        totalAdvancePaid += stay.advancePaid;
        return {
          id: stay.id,
          roomNumber: stay.room.roomNumber,
          roomType: stay.room.capacity > 2 ? 'Deluxe' : 'Standard',
          pricePerNight: stay.pricePerNight,
          nights: calc.nights,
          roomCharges: calc.roomCharges,
          advancePaid: stay.advancePaid,
          extraCharges: [
            ...(stay.extraCharges || []),
            ...(extraBedCost > 0 ? [{ id: `extra-bed-${stay.id}`, item: 'EXTRA BEDS CHARGES', amount: extraBedCost, createdAt: new Date() }] : [])
          ],
          checkInTime: stay.checkInTime,
        };
      });

      const subtotal = totalRoomCharges + totalExtraCharges - discount;
      const taxAmount = subtotal * taxRate;
      const finalAmount = Math.max(0, subtotal + taxAmount);

      res.status(200).json({
        success: true,
        data: {
          checkIn,
          allStays: activeStays,
          calculations: {
            nights: totalNights,
            roomCharges: totalRoomCharges,
            additionalCharges: totalExtraCharges,
            subtotal,
            taxAmount,
            finalAmount,
            advancePaid: totalAdvancePaid,
            stayDetails,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async checkout(req: Request, res: Response, next: NextFunction) {
    const {
      checkInId,
      additionalCharges,
      discount: dummyDiscount, // ignore and rename
      taxRate,
      paymentMethod,
      notes,
      checkoutDate,
      checkoutTime,
    } = req.body;

    const discount = 0; // Force 0 discount

    if (!checkInId || !paymentMethod) {
      return next(new AppError(400, 'CheckIn ID and payment method are required.'));
    }

    try {
      const checkIn = await CheckInRepository.findById(checkInId);
      if (!checkIn || checkIn.status !== 'ACTIVE') {
        return next(new AppError(400, 'Stay record is not active or already checked out.'));
      }

      let checkoutTimeObj = new Date();
      if (req.body.checkoutTimeISO) {
        checkoutTimeObj = new Date(req.body.checkoutTimeISO);
      } else if (checkoutDate && checkoutTime) {
        checkoutTimeObj = new Date(`${checkoutDate}T${checkoutTime}`);
      } else if (checkoutDate) {
        checkoutTimeObj = new Date(checkoutDate);
      }

      // Fetch all active stays for the same customer
      const activeStays = await prisma.checkIn.findMany({
        where: {
          customerId: checkIn.customerId,
          status: 'ACTIVE',
        },
        include: {
          room: true,
          extraCharges: true,
        },
      });

      // Checkout each active stay in a loop
      const checkoutRecords = [];
      let aggregateAmount = 0;

      for (const stay of activeStays) {
        const isPrimary = stay.id === checkInId;
        const diffMs = checkoutTimeObj.getTime() - new Date(stay.checkInTime).getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const nights = Math.max(1, diffDays);
        const extraBedCost = Number(stay.extraBedsCount || 0) * Number(stay.extraBedPrice || 0) * nights;
        const extraSum = (stay.extraCharges?.reduce((sum, item) => sum + item.amount, 0) || 0) + extraBedCost;

        // Calculate stay bill for this specific room
        const roomBill = InvoiceService.calculateStayBill({
          pricePerNight: stay.pricePerNight,
          checkInTime: stay.checkInTime,
          expectedCheckOutDate: checkoutTimeObj,
          additionalCharges: extraSum,
          discount: 0,
          taxRate: Number(taxRate !== undefined ? taxRate : 0.0),
        });

        // Checkout stay
        const checkoutRecord = await CheckoutRepository.create({
          checkInId: stay.id,
          roomCharges: roomBill.roomCharges,
          additionalCharges: extraSum,
          discount: 0,
          taxAmount: roomBill.taxAmount,
          finalAmount: roomBill.finalAmount,
          paymentMethod,
          notes: isPrimary ? notes : `Multi-room checkout aggregate stay`,
          actualCheckOutTime: checkoutTimeObj,
        });

        if (!checkoutRecord) {
          return next(new AppError(500, `Checkout for Room ${stay.room.roomNumber} failed.`));
        }

        // Generate invoice HTML file and update path
        const invoiceUrl = await InvoiceService.generateInvoiceHTML(checkoutRecord.id);
        await prisma.invoice.update({
          where: { checkoutId: checkoutRecord.id },
          data: { pdfUrl: invoiceUrl },
        });

        aggregateAmount += roomBill.finalAmount;

        checkoutRecords.push({
          roomId: stay.roomId,
          roomNumber: stay.room.roomNumber,
          checkoutId: checkoutRecord.id,
          invoiceUrl,
        });
      }

      // Send checkout receipt notification
      await NotificationService.sendPaymentReceipt(
        checkIn.customer.fullName,
        checkIn.customer.mobileNumber,
        aggregateAmount,
        `INV-${checkoutRecords[0].checkoutId.substring(0, 8).toUpperCase()}`
      );

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Payment Collected',
        ipAddress: req.ip as string,
        details: {
          checkoutStaysCount: activeStays.length,
          customerId: checkIn.customerId,
          roomNumbers: activeStays.map(s => s.room.roomNumber).join(', ')
        },
      });

      await RedisService.invalidateDashboardStats();

      res.status(200).json({
        success: true,
        data: {
          checkout: checkoutRecords[0], // primary checkout
          allCheckouts: checkoutRecords,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async collectPartialPayment(req: Request, res: Response, next: NextFunction) {
    const { checkInId, bookingId, amount, paymentMethod, notes } = req.body;

    if (!amount || !paymentMethod) {
      return next(new AppError(400, 'Payment amount and method are required.'));
    }

    try {
      const payment = await PaymentRepository.create({
        checkInId,
        bookingId,
        amount: Number(amount),
        paymentType: 'PARTIAL',
        paymentMethod,
        transactionId: `TXN-${Math.round(Math.random() * 10000000)}`,
        notes,
      });

      // Audit log
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Payment Collected',
        ipAddress: req.ip as string,
        details: { paymentId: payment.id, amount },
      });

      await RedisService.invalidateDashboardStats();

      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPaymentLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const payments = await PaymentRepository.getAll();
      res.status(200).json({
        success: true,
        data: payments,
      });
    } catch (error) {
      next(error);
    }
  }

  static async addExtraCharge(req: Request, res: Response, next: NextFunction) {
    const checkInId = req.params.checkInId as string;
    const { itemName, amount, quantity } = req.body;
    try {
      if (!itemName || amount === undefined) {
        return next(new AppError(400, 'Item name and amount are required.'));
      }
      const qty = quantity ? Number(quantity) : 1;
      const charge = await prisma.extraCharge.create({
        data: {
          checkInId,
          itemName,
          amount: Number(amount),
          quantity: qty,
        },
      });

      // Automatically update inventory if matching "Water Bottle" variants (case-insensitive check)
      try {
        const normalizedItemName = itemName.trim().toLowerCase();
        const waterVariants = ['water bottle', 'water bottles', 'water'];
        if (waterVariants.includes(normalizedItemName)) {
          const dbItems = await prisma.inventoryItem.findMany();
          const matchingItem = dbItems.find((item) =>
            waterVariants.includes(item.name.trim().toLowerCase())
          );

          if (matchingItem) {
            await prisma.inventoryItem.update({
              where: { id: matchingItem.id },
              data: {
                quantity: {
                  decrement: qty,
                },
              },
            });
          }
        }
      } catch (inventoryError) {
        console.error('Failed to auto-update inventory:', inventoryError);
      }

      res.status(201).json({
        success: true,
        data: charge,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getExtraCharges(req: Request, res: Response, next: NextFunction) {
    const checkInId = req.params.checkInId as string;
    try {
      const charges = await prisma.extraCharge.findMany({
        where: { checkInId },
        orderBy: { createdAt: 'desc' },
      });
      res.status(200).json({
        success: true,
        data: charges,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteExtraCharge(req: Request, res: Response, next: NextFunction) {
    const checkInId = req.params.checkInId as string;
    const chargeId = req.params.chargeId as string;
    try {
      const charge = await prisma.extraCharge.findUnique({
        where: { id: chargeId },
      });
      if (!charge) {
        return next(new AppError(404, 'Additional charge item not found.'));
      }

      // Auto-increment inventory back if we delete a "Water Bottle"
      try {
        const normalizedItemName = charge.itemName.trim().toLowerCase();
        const waterVariants = ['water bottle', 'water bottles', 'water'];
        if (waterVariants.includes(normalizedItemName)) {
          const dbItems = await prisma.inventoryItem.findMany();
          const matchingItem = dbItems.find((item) =>
            waterVariants.includes(item.name.trim().toLowerCase())
          );

          if (matchingItem) {
            await prisma.inventoryItem.update({
              where: { id: matchingItem.id },
              data: {
                quantity: {
                  increment: charge.quantity,
                },
              },
            });
          }
        }
      } catch (inventoryError) {
        console.error('Failed to auto-revert inventory:', inventoryError);
      }

      await prisma.extraCharge.delete({
        where: { id: chargeId },
      });

      await RedisService.invalidateDashboardStats();

      res.status(200).json({
        success: true,
        message: 'Additional charge removed successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}
