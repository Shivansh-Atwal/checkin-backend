import prisma from '../config/db';

export class BookingRepository {
  static async findById(id: string) {
    return prisma.booking.findUnique({
      where: { id },
      include: {
        customer: {
          include: { documents: true },
        },
        room: true,
        payments: true,
        checkInRecord: true,
      },
    });
  }

  static async findByBookingNumber(bookingNumber: string) {
    return prisma.booking.findUnique({
      where: { bookingNumber },
      include: {
        customer: true,
        room: true,
      },
    });
  }

  static async getNextRegistrationNumber(): Promise<string> {
    const bookings = await prisma.booking.findMany({
      where: { registrationNumber: { not: null } },
      select: { registrationNumber: true }
    });

    const checkIns = await prisma.checkIn.findMany({
      where: { registrationNumber: { not: null } },
      select: { registrationNumber: true }
    });

    const allRegs = [
      ...bookings.map(b => b.registrationNumber),
      ...checkIns.map(c => c.registrationNumber)
    ].filter(Boolean) as string[];

    let maxNum = 100;
    let formatPrefix = '';

    for (const reg of allRegs) {
      const match = reg.match(/^([^\d]*)(\d+)(.*)$/);
      if (match) {
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        if (num > maxNum) {
          maxNum = num;
          formatPrefix = prefix;
        }
      }
    }

    const nextNum = maxNum + 1;
    return `${formatPrefix}${nextNum}`;
  }

  static async getAll(filters?: { status?: string; search?: string }) {
    const bookingWhereClause: any = {};
    const checkInWhereClause: any = { bookingId: null };

    if (filters?.status) {
      bookingWhereClause.status = filters.status;
      
      if (filters.status === 'CHECKED_IN') {
        checkInWhereClause.status = 'ACTIVE';
      } else if (filters.status === 'CHECKED_OUT') {
        checkInWhereClause.status = 'CHECKED_OUT';
      } else {
        checkInWhereClause.status = 'IMPOSSIBLE_STATUS';
      }
    }

    if (filters?.search) {
      const q = filters.search;
      bookingWhereClause.OR = [
        { bookingNumber: { contains: q } },
        { customer: { fullName: { contains: q } } },
        { customer: { mobileNumber: { contains: q } } },
        { room: { roomNumber: { contains: q } } },
      ];

      checkInWhereClause.OR = [
        { customer: { fullName: { contains: q } } },
        { customer: { mobileNumber: { contains: q } } },
        { room: { roomNumber: { contains: q } } },
      ];
    }

    const [bookings, checkIns] = await Promise.all([
      prisma.booking.findMany({
        where: bookingWhereClause,
        include: {
          customer: true,
          room: true,
          checkInRecord: true,
        },
        orderBy: { checkInDate: 'asc' },
      }),
      prisma.checkIn.findMany({
        where: checkInWhereClause,
        include: {
          customer: true,
          room: true,
        },
        orderBy: { checkInTime: 'asc' },
      })
    ]);

    const mappedBookings = bookings.map(b => ({
      ...b,
      registrationNumber: b.registrationNumber || b.checkInRecord?.registrationNumber || null,
    }));

    const mappedCheckIns = checkIns.map(c => ({
      id: c.id,
      bookingNumber: `HF-W-${c.id.substring(0, 6).toUpperCase()}`,
      checkInDate: c.checkInTime,
      checkOutDate: c.actualCheckOutTime || c.expectedCheckOutDate,
      numberOfGuests: c.numberOfGuests,
      advancePayment: c.advancePaid,
      price: c.remainingAmount + c.advancePaid,
      status: c.status === 'ACTIVE' ? 'CHECKED_IN' : 'CHECKED_OUT',
      notes: 'Walk-in Stay',
      customerId: c.customerId,
      roomId: c.roomId,
      customer: c.customer,
      room: c.room,
      registrationNumber: c.registrationNumber,
    }));

    const allRecords = [...mappedBookings, ...mappedCheckIns] as any[];

    allRecords.sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());

    return allRecords;
  }

  static async search(query: string) {
    return prisma.booking.findMany({
      where: {
        OR: [
          { bookingNumber: { contains: query } },
          { customer: { fullName: { contains: query } } },
          { customer: { mobileNumber: { contains: query } } },
        ],
      },
      include: {
        customer: true,
        room: true,
      },
    });
  }

  static async create(data: {
    customerId: string;
    roomId: string;
    checkInDate: Date;
    checkOutDate: Date;
    numberOfGuests: number;
    advancePayment: number;
    price: number;
    notes?: string;
    registrationNumber?: string;
  }) {
    const bookingNumber = `HF-B-${Math.round(Math.random() * 1000000)}`;
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          bookingNumber,
          customerId: data.customerId,
          roomId: data.roomId,
          checkInDate: new Date(data.checkInDate),
          checkOutDate: new Date(data.checkOutDate),
          numberOfGuests: data.numberOfGuests,
          advancePayment: data.advancePayment,
          price: data.price,
          status: 'CONFIRMED',
          notes: data.notes || null,
          registrationNumber: data.registrationNumber || null,
        },
      });



      // If advance payment is collected, create a payment record
      if (data.advancePayment > 0) {
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            amount: data.advancePayment,
            paymentType: 'ADVANCE',
            paymentMethod: 'Cash', // Default
            paymentStatus: 'PAID',
            notes: 'Advance Booking Payment',
          },
        });
      }

      return tx.booking.findUnique({
        where: { id: booking.id },
        include: { customer: true, room: true },
      });
    });
  }

  static async update(
    id: string,
    data: Partial<{
      checkInDate: Date;
      checkOutDate: Date;
      numberOfGuests: number;
      advancePayment: number;
      price: number;
      roomId: string;
      status: string;
      notes: string;
      // Customer details updates
      customerName: string;
      mobileNumber: string;
      address: string;
      city: string;
      state: string;
      country: string;
      pincode: string;
      registrationNumber: string;
      document: {
        idType: string;
        idNumber: string;
        frontImageUrl?: string;
        backImageUrl?: string;
        customerPhotoUrl?: string;
      };
    }>
  ) {
    return prisma.$transaction(async (tx) => {
      const oldBooking = await tx.booking.findUnique({
        where: { id },
        include: { customer: true }
      });

      if (!oldBooking) {
        // Check if this is a legacy walk-in stay (CheckIn record with bookingId = null)
        const oldCheckIn = await tx.checkIn.findUnique({
          where: { id },
          include: { customer: true, checkoutRecord: true }
        });
        if (!oldCheckIn) throw new Error('Record not found');

        // 1. Update customer details if provided
        if (
          data.customerName !== undefined ||
          data.mobileNumber !== undefined ||
          data.address !== undefined ||
          data.city !== undefined ||
          data.state !== undefined ||
          data.country !== undefined ||
          data.pincode !== undefined
        ) {
          const custUpdates: any = {};
          if (data.customerName !== undefined) custUpdates.fullName = data.customerName;
          if (data.mobileNumber !== undefined) custUpdates.mobileNumber = data.mobileNumber;
          if (data.address !== undefined) custUpdates.address = data.address;
          if (data.city !== undefined) custUpdates.city = data.city;
          if (data.state !== undefined) custUpdates.state = data.state;
          if (data.country !== undefined) custUpdates.country = data.country;
          if (data.pincode !== undefined) custUpdates.pincode = data.pincode;

          await tx.customer.update({
            where: { id: oldCheckIn.customerId },
            data: custUpdates,
          });
        }

        if (data.document) {
          const existingDoc = await tx.customerDocument.findFirst({
            where: { customerId: oldCheckIn.customerId },
          });

          if (existingDoc) {
            await tx.customerDocument.update({
              where: { id: existingDoc.id },
              data: data.document,
            });
          } else {
            await tx.customerDocument.create({
              data: {
                customerId: oldCheckIn.customerId,
                ...data.document,
              },
            });
          }
        }

        // 2. Validate room status if room is changing
        if (data.roomId && data.roomId !== oldCheckIn.roomId) {
          const activeStay = await tx.checkIn.findFirst({
            where: { roomId: data.roomId, status: 'ACTIVE' },
            include: { room: true }
          });
          if (activeStay) {
            throw new Error(`Room ${activeStay.room.roomNumber} is currently occupied.`);
          }
        }

        // 3. Update CheckIn record
        const checkInUpdates: any = {};
        if (data.roomId !== undefined) checkInUpdates.roomId = data.roomId;
        if (data.numberOfGuests !== undefined) checkInUpdates.numberOfGuests = Number(data.numberOfGuests);
        if (data.checkInDate !== undefined) checkInUpdates.checkInTime = new Date(data.checkInDate);
        if (data.checkOutDate !== undefined) checkInUpdates.expectedCheckOutDate = new Date(data.checkOutDate);
        if (data.advancePayment !== undefined) checkInUpdates.advancePaid = Number(data.advancePayment);
        if (data.registrationNumber !== undefined) checkInUpdates.registrationNumber = data.registrationNumber;
        
        const checkInTime = data.checkInDate ? new Date(data.checkInDate) : oldCheckIn.checkInTime;
        const checkOutTime = data.checkOutDate ? new Date(data.checkOutDate) : (oldCheckIn.actualCheckOutTime || oldCheckIn.expectedCheckOutDate);
        
        const diffMs = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
        const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        
        const finalPrice = data.price !== undefined ? Number(data.price) : oldCheckIn.pricePerNight;
        const finalAdvance = data.advancePayment !== undefined ? Number(data.advancePayment) : oldCheckIn.advancePaid;
        
        checkInUpdates.pricePerNight = finalPrice;

        if (oldCheckIn.status === 'ACTIVE') {
          checkInUpdates.remainingAmount = Math.max(0, (finalPrice * nights) - finalAdvance);
        } else {
          checkInUpdates.remainingAmount = 0;
          if (data.checkOutDate !== undefined) {
            checkInUpdates.actualCheckOutTime = new Date(data.checkOutDate);
          }
        }

        const updatedCheckIn = await tx.checkIn.update({
          where: { id },
          data: checkInUpdates,
          include: { customer: { include: { documents: true } }, room: true }
        });

        // If it has a checkoutRecord, update checkout & invoice & full payment
        if (oldCheckIn.checkoutRecord) {
          const roomCharges = finalPrice * nights;
          const additionalCharges = oldCheckIn.checkoutRecord.additionalCharges;
          const discount = oldCheckIn.checkoutRecord.discount;
          const taxAmount = oldCheckIn.checkoutRecord.taxAmount;
          const finalAmount = roomCharges + additionalCharges - discount + taxAmount;

          await tx.checkout.update({
            where: { id: oldCheckIn.checkoutRecord.id },
            data: {
              roomCharges,
              finalAmount,
            },
          });

          await tx.invoice.updateMany({
            where: { checkoutId: oldCheckIn.checkoutRecord.id },
            data: {
              totalAmount: finalAmount,
            },
          });

          const fullPayment = await tx.payment.findFirst({
            where: {
              checkInId: oldCheckIn.id,
              paymentType: 'FULL',
            },
          });

          if (fullPayment) {
            const newFullAmount = Math.max(0, finalAmount - finalAdvance);
            await tx.payment.update({
              where: { id: fullPayment.id },
              data: {
                amount: newFullAmount,
                paymentDate: checkOutTime,
              },
            });
          } else {
            const newFullAmount = Math.max(0, finalAmount - finalAdvance);
            await tx.payment.create({
              data: {
                checkInId: oldCheckIn.id,
                amount: newFullAmount,
                paymentType: 'FULL',
                paymentMethod: 'Cash',
                paymentStatus: 'PAID',
                notes: 'Final Check-Out Settlement Payment (Restored)',
                paymentDate: checkOutTime,
              },
            });
          }
        }

        const walkInWhereClause: any = {
          paymentType: 'ADVANCE',
        };
        if (oldCheckIn.bookingId) {
          walkInWhereClause.OR = [
            { checkInId: id },
            { bookingId: oldCheckIn.bookingId }
          ];
        } else {
          walkInWhereClause.checkInId = id;
        }

        const existingAdvancePayment = await tx.payment.findFirst({
          where: walkInWhereClause,
        });

        const newAdvanceAmount = data.advancePayment !== undefined ? Number(data.advancePayment) : (existingAdvancePayment ? existingAdvancePayment.amount : 0);
        const newCheckInDate = data.checkInDate ? new Date(data.checkInDate) : (existingAdvancePayment ? existingAdvancePayment.paymentDate : checkInTime);

        if (existingAdvancePayment) {
          if (newAdvanceAmount <= 0) {
            await tx.payment.delete({
              where: { id: existingAdvancePayment.id },
            });
          } else {
            await tx.payment.update({
              where: { id: existingAdvancePayment.id },
              data: { 
                amount: newAdvanceAmount,
                paymentDate: newCheckInDate,
              },
            });
          }
        } else if (newAdvanceAmount > 0) {
          await tx.payment.create({
            data: {
              checkInId: id,
              bookingId: oldCheckIn.bookingId || null,
              amount: newAdvanceAmount,
              paymentType: 'ADVANCE',
              paymentMethod: 'Cash',
              paymentStatus: 'PAID',
              notes: 'Advance Booking Payment (Updated)',
              paymentDate: newCheckInDate,
            },
          });
        }

        // Return mapped to Booking schema
        return {
          id: updatedCheckIn.id,
          bookingNumber: `HF-W-${updatedCheckIn.id.substring(0, 6).toUpperCase()}`,
          checkInDate: updatedCheckIn.checkInTime,
          checkOutDate: updatedCheckIn.actualCheckOutTime || updatedCheckIn.expectedCheckOutDate,
          numberOfGuests: updatedCheckIn.numberOfGuests,
          advancePayment: updatedCheckIn.advancePaid,
          price: updatedCheckIn.remainingAmount + updatedCheckIn.advancePaid,
          status: updatedCheckIn.status === 'ACTIVE' ? 'CHECKED_IN' : 'CHECKED_OUT',
          notes: 'Walk-in Stay',
          customerId: updatedCheckIn.customerId,
          roomId: updatedCheckIn.roomId,
          customer: updatedCheckIn.customer,
          room: updatedCheckIn.room,
          registrationNumber: updatedCheckIn.registrationNumber,
        } as any;
      }

      // 1. Update customer details if provided
      if (
        data.customerName !== undefined ||
        data.mobileNumber !== undefined ||
        data.address !== undefined ||
        data.city !== undefined ||
        data.state !== undefined ||
        data.country !== undefined ||
        data.pincode !== undefined
      ) {
        const custUpdates: any = {};
        if (data.customerName !== undefined) custUpdates.fullName = data.customerName;
        if (data.mobileNumber !== undefined) custUpdates.mobileNumber = data.mobileNumber;
        if (data.address !== undefined) custUpdates.address = data.address;
        if (data.city !== undefined) custUpdates.city = data.city;
        if (data.state !== undefined) custUpdates.state = data.state;
        if (data.country !== undefined) custUpdates.country = data.country;
        if (data.pincode !== undefined) custUpdates.pincode = data.pincode;

        await tx.customer.update({
          where: { id: oldBooking.customerId },
          data: custUpdates,
        });
      }

      if (data.document) {
        const existingDoc = await tx.customerDocument.findFirst({
          where: { customerId: oldBooking.customerId },
        });

        if (existingDoc) {
          await tx.customerDocument.update({
            where: { id: existingDoc.id },
            data: data.document,
          });
        } else {
          await tx.customerDocument.create({
            data: {
              customerId: oldBooking.customerId,
              ...data.document,
            },
          });
        }
      }

      // 2. Validate room status if room is changing
      if (data.roomId && data.roomId !== oldBooking.roomId) {
        const activeStay = await tx.checkIn.findFirst({
          where: { roomId: data.roomId, status: 'ACTIVE' },
          include: { room: true }
        });
        if (activeStay) {
          throw new Error(`Room ${activeStay.room.roomNumber} is currently occupied.`);
        }
      }

      // 3. Perform Booking Update
      const bookingUpdates: any = {};
      if (data.checkInDate !== undefined) bookingUpdates.checkInDate = new Date(data.checkInDate);
      if (data.checkOutDate !== undefined) bookingUpdates.checkOutDate = new Date(data.checkOutDate);
      if (data.numberOfGuests !== undefined) bookingUpdates.numberOfGuests = Number(data.numberOfGuests);
      if (data.advancePayment !== undefined) bookingUpdates.advancePayment = Number(data.advancePayment);
      if (data.price !== undefined) bookingUpdates.price = Number(data.price);
      if (data.roomId !== undefined) bookingUpdates.roomId = data.roomId;
      if (data.status !== undefined) bookingUpdates.status = data.status;
      if (data.notes !== undefined) bookingUpdates.notes = data.notes;
      if (data.registrationNumber !== undefined) bookingUpdates.registrationNumber = data.registrationNumber;

      const updated = await tx.booking.update({
        where: { id },
        data: bookingUpdates,
      });

      const existingAdvancePayment = await tx.payment.findFirst({
        where: {
          bookingId: id,
          paymentType: 'ADVANCE',
        },
      });

      const newAdvanceAmount = data.advancePayment !== undefined ? Number(data.advancePayment) : (existingAdvancePayment ? existingAdvancePayment.amount : 0);
      const newCheckInDate = data.checkInDate ? new Date(data.checkInDate) : (existingAdvancePayment ? existingAdvancePayment.paymentDate : (updated.checkInDate || new Date()));

      if (existingAdvancePayment) {
        if (newAdvanceAmount <= 0) {
          await tx.payment.delete({
            where: { id: existingAdvancePayment.id },
          });
        } else {
          await tx.payment.update({
            where: { id: existingAdvancePayment.id },
            data: { 
              amount: newAdvanceAmount,
              paymentDate: newCheckInDate,
            },
          });
        }
      } else if (newAdvanceAmount > 0) {
        const activeCheckIn = await tx.checkIn.findFirst({
          where: { bookingId: id },
        });

        await tx.payment.create({
          data: {
            bookingId: id,
            checkInId: activeCheckIn?.id || null,
            amount: newAdvanceAmount,
            paymentType: 'ADVANCE',
            paymentMethod: 'Cash',
            paymentStatus: 'PAID',
            notes: 'Advance Booking Payment (Updated)',
            paymentDate: newCheckInDate,
          },
        });
      }



      // 5. Cascade updates to CheckIn and Checkout records if booking has a CheckIn
      const checkInRecord = await tx.checkIn.findUnique({
        where: { bookingId: id },
        include: { checkoutRecord: true },
      });

      if (checkInRecord) {
        const checkInUpdates: any = {};
        if (data.roomId !== undefined) checkInUpdates.roomId = data.roomId;
        if (data.numberOfGuests !== undefined) checkInUpdates.numberOfGuests = Number(data.numberOfGuests);
        if (data.checkInDate !== undefined) checkInUpdates.checkInTime = new Date(data.checkInDate);
        if (data.checkOutDate !== undefined) checkInUpdates.expectedCheckOutDate = new Date(data.checkOutDate);
        if (data.advancePayment !== undefined) checkInUpdates.advancePaid = Number(data.advancePayment);
        if (data.registrationNumber !== undefined) checkInUpdates.registrationNumber = data.registrationNumber;

        const checkInTime = data.checkInDate ? new Date(data.checkInDate) : checkInRecord.checkInTime;
        const checkOutTime = data.checkOutDate ? new Date(data.checkOutDate) : (checkInRecord.actualCheckOutTime || checkInRecord.expectedCheckOutDate);
        
        const diffMs = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
        const nights = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        
        const finalPrice = data.price !== undefined ? Number(data.price) : checkInRecord.pricePerNight;
        const finalAdvance = data.advancePayment !== undefined ? Number(data.advancePayment) : checkInRecord.advancePaid;
        
        checkInUpdates.pricePerNight = finalPrice;
        
        if (checkInRecord.status === 'ACTIVE') {
          checkInUpdates.remainingAmount = Math.max(0, (finalPrice * nights) - finalAdvance);
        } else {
          checkInUpdates.remainingAmount = 0;
          if (data.checkOutDate !== undefined) {
            checkInUpdates.actualCheckOutTime = new Date(data.checkOutDate);
          }
        }

        await tx.checkIn.update({
          where: { id: checkInRecord.id },
          data: checkInUpdates,
        });

        // If it has a checkoutRecord (i.e. status is CHECKED_OUT), update checkout & invoice & full payment
        if (checkInRecord.checkoutRecord) {
          const roomCharges = finalPrice * nights;
          const additionalCharges = checkInRecord.checkoutRecord.additionalCharges;
          const discount = checkInRecord.checkoutRecord.discount;
          const taxAmount = checkInRecord.checkoutRecord.taxAmount;
          const finalAmount = roomCharges + additionalCharges - discount + taxAmount;

          await tx.checkout.update({
            where: { id: checkInRecord.checkoutRecord.id },
            data: {
              roomCharges,
              finalAmount,
            },
          });

          // Update Invoice if exists
          await tx.invoice.updateMany({
            where: { checkoutId: checkInRecord.checkoutRecord.id },
            data: {
              totalAmount: finalAmount,
            },
          });

          // Update FULL payment record if exists
          const fullPayment = await tx.payment.findFirst({
            where: {
              checkInId: checkInRecord.id,
              paymentType: 'FULL',
            },
          });

          if (fullPayment) {
            const newFullAmount = Math.max(0, finalAmount - finalAdvance);
            await tx.payment.update({
              where: { id: fullPayment.id },
              data: {
                amount: newFullAmount,
                paymentDate: checkOutTime,
              },
            });
          } else {
            const newFullAmount = Math.max(0, finalAmount - finalAdvance);
            await tx.payment.create({
              data: {
                checkInId: checkInRecord.id,
                amount: newFullAmount,
                paymentType: 'FULL',
                paymentMethod: 'Cash',
                paymentStatus: 'PAID',
                notes: 'Final Check-Out Settlement Payment (Restored)',
                paymentDate: checkOutTime,
              },
            });
          }
        }
      }

      return tx.booking.findUnique({
        where: { id },
        include: { customer: { include: { documents: true } }, room: true },
      });
    });
  }
}
