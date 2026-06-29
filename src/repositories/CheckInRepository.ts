import prisma from '../config/db';

export class CheckInRepository {
  static async findById(id: string) {
    return prisma.checkIn.findUnique({
      where: { id },
      include: {
        customer: {
          include: { documents: true },
        },
        room: true,
        booking: true,
        checkoutRecord: true,
        payments: true,
      },
    });
  }

  static async findActiveByRoomId(roomId: string) {
    return prisma.checkIn.findFirst({
      where: { roomId, status: 'ACTIVE' },
      include: { customer: true, room: true },
    });
  }

  static async getAllActive() {
    return prisma.checkIn.findMany({
      where: { status: 'ACTIVE' },
      include: {
        customer: {
          include: { documents: true },
        },
        room: true,
      },
      orderBy: { checkInTime: 'desc' },
    });
  }

  static async createWalkIn(data: {
    customerId: string;
    roomIds: string[]; // Updated from roomId to support multiple allocations
    numberOfGuests: number;
    checkInTime?: Date;
    expectedCheckOutDate?: Date;
    advancePaid: number;
    remainingAmount: number;
    paymentMethod?: string;
    registrationNumber?: string;
    pricePerNight: number;
    roomPrices?: { [roomId: string]: number };
    extraBedsCount?: number;
    extraBedPrice?: number;
  }) {
    console.log("Received:", data.checkInTime);
    console.log("Type:", typeof data.checkInTime);
    console.log("Date object:", data.checkInTime);
    const arrivalTime = data.checkInTime || new Date();

    const checkoutTime = data.expectedCheckOutDate
      ? new Date(data.expectedCheckOutDate)
      : new Date(arrivalTime.getTime() + 24 * 60 * 60 * 1000); // Default +1 day

    const totalExtraBedsCost = Number(data.extraBedsCount || 0) * Number(data.extraBedPrice || 0);

    return prisma.$transaction(async (tx) => {
      // 1. Create a Booking record first for the walk-in
      const bookingNumber = `HF-B-${Math.round(Math.random() * 1000000)}`;
      const booking = await tx.booking.create({
        data: {
          bookingNumber,
          customerId: data.customerId,
          roomId: data.roomIds[0],
          checkInDate: arrivalTime,
          checkOutDate: checkoutTime,
          numberOfGuests: data.numberOfGuests,
          advancePayment: data.advancePaid,
          price: data.pricePerNight + totalExtraBedsCost, // The booking's price is the pricePerNight + extra beds
          status: 'CHECKED_IN',
          notes: 'Walk-in Stay',
          extraBedsCount: Number(data.extraBedsCount || 0),
          extraBedPrice: Number(data.extraBedPrice || 0),
        },
      });

      const createdCheckIns = [];
      const baseReg = (data.registrationNumber ? data.registrationNumber.toUpperCase() : '') || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      for (let i = 0; i < data.roomIds.length; i++) {
        const rId = data.roomIds[i];

        // Find room number to append for multi-room checks if needed
        const room = await tx.room.findUnique({ where: { id: rId } });
        const roomNumber = room ? room.roomNumber : '';
        const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;

        // Create CheckIn record for each room
        const checkIn = await tx.checkIn.create({
          data: {
            registrationNumber: regNum,
            bookingId: i === 0 ? booking.id : null, // Link booking to first checkin
            customerId: data.customerId,
            roomId: rId,
            numberOfGuests: Math.max(1, Math.round(data.numberOfGuests / data.roomIds.length)), // Split guests or default
            checkInTime: arrivalTime,
            expectedCheckOutDate: checkoutTime,
            advancePaid: i === 0 ? data.advancePaid : 0, // Apply full advance to first room
            remainingAmount: i === 0 ? data.remainingAmount : 0,
            pricePerNight: Number(data.roomPrices && data.roomPrices[rId] !== undefined ? data.roomPrices[rId] : data.pricePerNight) + (i === 0 ? totalExtraBedsCost : 0),
            status: 'ACTIVE',
            extraBedsCount: i === 0 ? Number(data.extraBedsCount || 0) : 0,
            extraBedPrice: i === 0 ? Number(data.extraBedPrice || 0) : 0,
          },
        });

        createdCheckIns.push(checkIn);

        // Record payment for first check-in only
        if (i === 0 && data.advancePaid > 0) {
          await tx.payment.create({
            data: {
              checkInId: checkIn.id,
              bookingId: booking.id,
              amount: data.advancePaid,
              paymentType: 'ADVANCE',
              paymentMethod: data.paymentMethod || 'Cash',
              paymentStatus: 'PAID',
              notes: `Walk-In Multi-Room Check-In Advance Payment (${data.roomIds.length} rooms)`,
            },
          });
        }
      }

      // Return primary check-in with customer and room details
      return tx.checkIn.findUnique({
        where: { id: createdCheckIns[0].id },
        include: { customer: true, room: true },
      });
    },
      {
        timeout: 30000,
        maxWait: 10000,
      });
  }

  static async createPreviousStay(data: {
    customerId: string;
    roomIds: string[];
    numberOfGuests: number;
    checkInTime: Date;
    expectedCheckOutDate: Date;
    advancePaid: number;
    remainingAmount: number;
    paymentMethod?: string;
    registrationNumber?: string;
    pricePerNight: number;
    roomPrices?: { [roomId: string]: number };
    extraBedsCount?: number;
    extraBedPrice?: number;
  }) {
    const arrivalTime = new Date(data.checkInTime);
    const checkoutTime = new Date(data.expectedCheckOutDate);
    const diffMs = checkoutTime.getTime() - arrivalTime.getTime();
    const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const totalExtraBedsCost = Number(data.extraBedsCount || 0) * Number(data.extraBedPrice || 0);

    return prisma.$transaction(async (tx) => {
      // 1. Create a Booking record first for the walk-in stay in Checked Out state
      const bookingNumber = `HF-B-${Math.round(Math.random() * 1000000)}`;
      const booking = await tx.booking.create({
        data: {
          bookingNumber,
          customerId: data.customerId,
          roomId: data.roomIds[0],
          checkInDate: arrivalTime,
          checkOutDate: checkoutTime,
          numberOfGuests: data.numberOfGuests,
          advancePayment: data.advancePaid,
          price: data.pricePerNight + totalExtraBedsCost,
          status: 'CHECKED_OUT',
          notes: 'Historical stay record',
          extraBedsCount: Number(data.extraBedsCount || 0),
          extraBedPrice: Number(data.extraBedPrice || 0),
        },
      });

      const createdCheckIns = [];
      const baseReg = (data.registrationNumber ? data.registrationNumber.toUpperCase() : '') || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      for (let i = 0; i < data.roomIds.length; i++) {
        const rId = data.roomIds[i];

        // Find room number to append for multi-room checks if needed
        const room = await tx.room.findUnique({ where: { id: rId } });
        const roomNumber = room ? room.roomNumber : '';
        const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;

        const roomRate = Number(data.roomPrices && data.roomPrices[rId] !== undefined ? data.roomPrices[rId] : data.pricePerNight) + (i === 0 ? totalExtraBedsCost : 0);

        // 2. Create CheckIn record for each room in Checked Out state
        const checkIn = await tx.checkIn.create({
          data: {
            registrationNumber: regNum,
            bookingId: i === 0 ? booking.id : null, // Link booking to first checkin
            customerId: data.customerId,
            roomId: rId,
            numberOfGuests: Math.max(1, Math.round(data.numberOfGuests / data.roomIds.length)),
            checkInTime: arrivalTime,
            expectedCheckOutDate: checkoutTime,
            actualCheckOutTime: checkoutTime,
            advancePaid: i === 0 ? data.advancePaid : 0,
            remainingAmount: 0,
            pricePerNight: roomRate,
            status: 'CHECKED_OUT',
            extraBedsCount: i === 0 ? Number(data.extraBedsCount || 0) : 0,
            extraBedPrice: i === 0 ? Number(data.extraBedPrice || 0) : 0,
          },
        });

        createdCheckIns.push(checkIn);

        // 3. Create Checkout Record
        const checkoutRecord = await tx.checkout.create({
          data: {
            checkInId: checkIn.id,
            roomCharges: roomRate * nights,
            additionalCharges: 0,
            discount: 0,
            taxAmount: 0,
            finalAmount: roomRate * nights,
            billingStatus: 'PAID',
            createdAt: checkoutTime,
          },
        });

        // Create Invoice Record in DB
        const invoiceNumber = `INV-${checkoutRecord.id.substring(0, 8).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        await tx.invoice.create({
          data: {
            checkoutId: checkoutRecord.id,
            invoiceNumber,
            totalAmount: roomRate * nights,
          },
        });

        // 4. Record Payments
        if (i === 0) {
          // Advance payment
          if (data.advancePaid > 0) {
            await tx.payment.create({
              data: {
                checkInId: checkIn.id,
                bookingId: booking.id,
                amount: data.advancePaid,
                paymentType: 'ADVANCE',
                paymentMethod: data.paymentMethod || 'Cash',
                paymentStatus: 'PAID',
                notes: 'Historical Stay Advance Payment',
                paymentDate: arrivalTime,
              },
            });
          }

          // Remaining payout
          const totalBill = roomRate * nights;
          const remainingPaid = totalBill - data.advancePaid;
          if (remainingPaid > 0) {
            await tx.payment.create({
              data: {
                checkInId: checkIn.id,
                bookingId: booking.id,
                amount: remainingPaid,
                paymentType: 'FULL',
                paymentMethod: data.paymentMethod || 'Cash',
                paymentStatus: 'PAID',
                notes: 'Historical Stay Final Payment',
                paymentDate: checkoutTime,
              },
            });
          }
        } else {
          // For secondary rooms, they have 0 advance, so they pay totalBill in full
          const totalBill = roomRate * nights;
          if (totalBill > 0) {
            await tx.payment.create({
              data: {
                checkInId: checkIn.id,
                amount: totalBill,
                paymentType: 'FULL',
                paymentMethod: data.paymentMethod || 'Cash',
                paymentStatus: 'PAID',
                notes: 'Historical Stay Room Charge',
                paymentDate: checkoutTime,
              },
            });
          }
        }
      }

      // Return primary check-in with customer and room details
      return tx.checkIn.findUnique({
        where: { id: createdCheckIns[0].id },
        include: { customer: true, room: true },
      });
    },
      {
        timeout: 30000,
        maxWait: 10000,
      });
  }

  static async createFromBooking(data: {
    bookingId: string;
    roomIds: string[]; // Updated from roomId to support multiple allocations
    checkInTime?: Date;
    expectedCheckOutDate?: Date;
    numberOfGuests: number;
    advancePaid: number;
    remainingAmount: number;
    paymentMethod?: string;
    registrationNumber?: string;
    pricePerNight?: number;
    roomPrices?: { [roomId: string]: number };
    extraBedsCount?: number;
    extraBedPrice?: number;
  }) {
    const arrivalTime = data.checkInTime ? new Date(data.checkInTime) : new Date();

    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: data.bookingId },
      });
      if (!booking) throw new Error('Booking not found');

      const checkoutTime = data.expectedCheckOutDate
        ? new Date(data.expectedCheckOutDate)
        : new Date(booking.checkOutDate);

      const createdCheckIns = [];
      const baseReg = (data.registrationNumber ? data.registrationNumber.toUpperCase() : '') || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      const bedsCount = data.extraBedsCount !== undefined ? Number(data.extraBedsCount) : (booking.extraBedsCount || 0);
      const bedPrice = data.extraBedPrice !== undefined ? Number(data.extraBedPrice) : (booking.extraBedPrice || 0);
      const totalExtraBedsCost = bedsCount * bedPrice;

      for (let i = 0; i < data.roomIds.length; i++) {
        const rId = data.roomIds[i];

        // Find room number
        const room = await tx.room.findUnique({ where: { id: rId } });
        const roomNumber = room ? room.roomNumber : '';
        const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumber}` : baseReg;

        // Create CheckIn
        const checkIn = await tx.checkIn.create({
          data: {
            registrationNumber: regNum,
            bookingId: i === 0 ? data.bookingId : null, // Link booking to first checkin
            customerId: booking.customerId,
            roomId: rId,
            numberOfGuests: Math.max(1, Math.round(data.numberOfGuests / data.roomIds.length)),
            checkInTime: arrivalTime,
            expectedCheckOutDate: checkoutTime,
            advancePaid: i === 0 ? (data.advancePaid + booking.advancePayment) : 0,
            remainingAmount: i === 0 ? data.remainingAmount : 0,
            pricePerNight: Number(
              data.roomPrices && data.roomPrices[rId] !== undefined
                ? data.roomPrices[rId]
                : (data.pricePerNight !== undefined ? data.pricePerNight : booking.price)
            ) + (i === 0 ? totalExtraBedsCost : 0),
            status: 'ACTIVE',
            extraBedsCount: i === 0 ? bedsCount : 0,
            extraBedPrice: i === 0 ? bedPrice : 0,
          },
        });

        createdCheckIns.push(checkIn);



        if (i === 0) {
          // Update booking status to CHECKED_IN
          await tx.booking.update({
            where: { id: data.bookingId },
            data: { status: 'CHECKED_IN' },
          });

          // Link booking payments to first checkin
          await tx.payment.updateMany({
            where: { bookingId: data.bookingId },
            data: { checkInId: checkIn.id },
          });

          // If additional advance is paid during arrival check-in
          if (data.advancePaid > 0) {
            await tx.payment.create({
              data: {
                checkInId: checkIn.id,
                amount: data.advancePaid,
                paymentType: 'PARTIAL',
                paymentMethod: data.paymentMethod || 'Cash',
                paymentStatus: 'PAID',
                notes: 'Check-In Arrival Partial Payment',
              },
            });
          }
        }
      }

      return tx.checkIn.findUnique({
        where: { id: createdCheckIns[0].id },
        include: { customer: true, room: true },
      });
    },
      {
        timeout: 30000,
        maxWait: 10000,
      });
  }
}
