import prisma from '../config/db';

export class CheckInRepository {
  static async findById(id: string) {
    return prisma.checkIn.findUnique({
      where: { id },
      include: {
        customer: {
          include: { documents: true },
        },
        rooms: true,
        booking: true,
        checkoutRecord: true,
        payments: true,
        extraCharges: true,
      },
    });
  }
  static async findActiveByRoomId(roomId: string) {
    return prisma.checkIn.findFirst({
      where: { rooms: { some: { id: roomId } }, status: 'ACTIVE' },
      include: { customer: true, rooms: true },
    });
  }

  static async getAllActive() {
    return prisma.checkIn.findMany({
      where: { status: 'ACTIVE' },
      include: {
        customer: {
          include: { documents: true },
        },
        rooms: true,
      },
      orderBy: { checkInTime: 'desc' },
    });
  }

  static async createWalkIn(data: {
    id?: string;
    bookingId?: string;
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
          id: data.bookingId,
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

      const baseReg = (data.registrationNumber ? data.registrationNumber.toUpperCase() : '') || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      let roomNumbers = [];
      let totalRoomPrice = 0;
      for (const rId of data.roomIds) {
        const room = await tx.room.findUnique({ where: { id: rId } });
        if (room) roomNumbers.push(room.roomNumber);
        totalRoomPrice += (data.roomPrices && data.roomPrices[rId] !== undefined ? data.roomPrices[rId] : data.pricePerNight);
      }

      const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumbers.join('-')}` : baseReg;

      // Create a single CheckIn record connecting all rooms
      const checkIn = await tx.checkIn.create({
        data: {
          id: data.id,
          registrationNumber: regNum,
          bookingId: booking.id,
          customerId: data.customerId,
          rooms: { connect: data.roomIds.map(id => ({ id })) },
          numberOfGuests: Math.max(1, data.numberOfGuests),
          checkInTime: arrivalTime,
          expectedCheckOutDate: checkoutTime,
          advancePaid: data.advancePaid,
          remainingAmount: data.remainingAmount,
          pricePerNight: totalRoomPrice + totalExtraBedsCost,
          status: 'ACTIVE',
          extraBedsCount: Number(data.extraBedsCount || 0),
          extraBedPrice: Number(data.extraBedPrice || 0),
        },
      });

      // Record payment for advance
      if (data.advancePaid > 0) {
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

      // Return primary check-in with customer and room details
      return tx.checkIn.findUnique({
        where: { id: checkIn.id },
        include: { customer: true, rooms: true },
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
    additionalCharges?: number;
    discount?: number;
    taxAmount?: number;
    finalAmount?: number;
    notes?: string;
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

      const baseReg = (data.registrationNumber ? data.registrationNumber.toUpperCase() : '') || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      let roomNumbers = [];
      let totalRoomPrice = 0;
      for (const rId of data.roomIds) {
        const room = await tx.room.findUnique({ where: { id: rId } });
        if (room) roomNumbers.push(room.roomNumber);
        totalRoomPrice += (data.roomPrices && data.roomPrices[rId] !== undefined ? data.roomPrices[rId] : data.pricePerNight);
      }

      const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumbers.join('-')}` : baseReg;

      const totalRate = totalRoomPrice + totalExtraBedsCost;
      const calculatedRoomCharges = totalRate * nights;
      const checkoutAdditionalCharges = Number(data.additionalCharges || 0);
      const checkoutDiscount = Number(data.discount || 0);
      const checkoutTaxAmount = Number(data.taxAmount || 0);
      const checkoutFinalAmount = data.finalAmount !== undefined
        ? Number(data.finalAmount)
        : Math.max(0, calculatedRoomCharges + checkoutAdditionalCharges - checkoutDiscount + checkoutTaxAmount);

      // 2. Create single CheckIn record in Checked Out state
      const checkIn = await tx.checkIn.create({
        data: {
          registrationNumber: regNum,
          bookingId: booking.id,
          customerId: data.customerId,
          rooms: { connect: data.roomIds.map(id => ({ id })) },
          numberOfGuests: Math.max(1, data.numberOfGuests),
          checkInTime: arrivalTime,
          expectedCheckOutDate: checkoutTime,
          actualCheckOutTime: checkoutTime,
          advancePaid: data.advancePaid,
          remainingAmount: 0,
          pricePerNight: totalRate,
          status: 'CHECKED_OUT',
          extraBedsCount: Number(data.extraBedsCount || 0),
          extraBedPrice: Number(data.extraBedPrice || 0),
        },
      });

      // 3. Create Checkout Record
      const checkoutRecord = await tx.checkout.create({
        data: {
          checkInId: checkIn.id,
          roomCharges: calculatedRoomCharges,
          additionalCharges: checkoutAdditionalCharges,
          discount: checkoutDiscount,
          taxAmount: checkoutTaxAmount,
          finalAmount: checkoutFinalAmount,
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
          totalAmount: checkoutFinalAmount,
        },
      });

      // 4. Record Payments
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
      const remainingPaid = checkoutFinalAmount - data.advancePaid;
      if (remainingPaid > 0) {
        await tx.payment.create({
          data: {
            checkInId: checkIn.id,
            bookingId: booking.id,
            amount: remainingPaid,
            paymentType: 'FULL',
            paymentMethod: data.paymentMethod || 'Cash',
            paymentStatus: 'PAID',
            notes: data.notes || 'Historical Stay Final Payment',
            paymentDate: checkoutTime,
          },
        });
      }

      // Return primary check-in with customer and room details
      return tx.checkIn.findUnique({
        where: { id: checkIn.id },
        include: { customer: true, rooms: true },
      });
    },
      {
        timeout: 30000,
        maxWait: 10000,
      });
  }

  static async createFromBooking(data: {
    id?: string;
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

      const baseReg = (data.registrationNumber ? data.registrationNumber.toUpperCase() : '') || `REG-${Math.floor(100000 + Math.random() * 900000)}`;

      const bedsCount = data.extraBedsCount !== undefined ? Number(data.extraBedsCount) : (booking.extraBedsCount || 0);
      const bedPrice = data.extraBedPrice !== undefined ? Number(data.extraBedPrice) : (booking.extraBedPrice || 0);
      const totalExtraBedsCost = bedsCount * bedPrice;

      let roomNumbers = [];
      let totalRoomPrice = 0;
      for (const rId of data.roomIds) {
        const room = await tx.room.findUnique({ where: { id: rId } });
        if (room) roomNumbers.push(room.roomNumber);
        totalRoomPrice += Number(data.roomPrices && data.roomPrices[rId] !== undefined ? data.roomPrices[rId] : (data.pricePerNight !== undefined ? data.pricePerNight : booking.price));
      }

      const regNum = data.roomIds.length > 1 ? `${baseReg}-${roomNumbers.join('-')}` : baseReg;

      // Create CheckIn
      const checkIn = await tx.checkIn.create({
        data: {
          id: data.id,
          registrationNumber: regNum,
          bookingId: data.bookingId,
          customerId: booking.customerId,
          rooms: { connect: data.roomIds.map(id => ({ id })) },
          numberOfGuests: Math.max(1, data.numberOfGuests),
          checkInTime: arrivalTime,
          expectedCheckOutDate: checkoutTime,
          advancePaid: data.advancePaid + booking.advancePayment,
          remainingAmount: data.remainingAmount,
          pricePerNight: totalRoomPrice + totalExtraBedsCost,
          status: 'ACTIVE',
          extraBedsCount: bedsCount,
          extraBedPrice: bedPrice,
        },
      });

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
            bookingId: data.bookingId, // explicitly set this if you want
            amount: data.advancePaid,
            paymentType: 'PARTIAL',
            paymentMethod: data.paymentMethod || 'Cash',
            paymentStatus: 'PAID',
            notes: 'Check-In Arrival Partial Payment',
          },
        });
      }

      return tx.checkIn.findUnique({
        where: { id: checkIn.id },
        include: { customer: true, rooms: true },
      });
    },
      {
        timeout: 30000,
        maxWait: 10000,
      });
  }
}
