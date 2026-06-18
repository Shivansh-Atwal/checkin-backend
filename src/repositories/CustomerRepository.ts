import prisma from '../config/db';

export class CustomerRepository {
  static async findById(id: string) {
    return prisma.customer.findUnique({
      where: { id },
      include: {
        documents: true,
        bookings: {
          include: { room: true },
          orderBy: { createdAt: 'desc' },
        },
        checkIns: {
          include: { room: true, checkoutRecord: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  static async findByMobile(mobileNumber: string) {
    return prisma.customer.findUnique({
      where: { mobileNumber },
      include: { documents: true },
    });
  }

  static async search(query: string) {
    return prisma.customer.findMany({
      where: {
        OR: [
          { fullName: { contains: query } },
          { mobileNumber: { contains: query } },
          { email: { contains: query } },
          {
            documents: {
              some: {
                idNumber: { contains: query },
              },
            },
          },
        ],
      },
      include: { documents: true },
      take: 20,
    });
  }

  static async create(data: {
    fullName: string;
    mobileNumber: string;
    alternateNumber?: string;
    email?: string;
    dob?: Date;
    gender?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    document?: {
      idType: string;
      idNumber: string;
      frontImageUrl?: string;
      backImageUrl?: string;
      customerPhotoUrl?: string;
    };
  }) {
    const { document, ...customerData } = data;
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: customerData,
      });

      if (document) {
        await tx.customerDocument.create({
          data: {
            customerId: customer.id,
            ...document,
          },
        });
      }

      return tx.customer.findUnique({
        where: { id: customer.id },
        include: { documents: true },
      });
    });
  }

  static async update(
    id: string,
    data: Partial<{
      fullName: string;
      mobileNumber: string;
      alternateNumber: string;
      email: string;
      dob: Date;
      gender: string;
      address: string;
      city: string;
      state: string;
      country: string;
      pincode: string;
      document: {
        idType: string;
        idNumber: string;
        frontImageUrl?: string;
        backImageUrl?: string;
        customerPhotoUrl?: string;
      };
    }>
  ) {
    const { document, ...customerData } = data;
    return prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id },
        data: customerData,
      });

      if (document) {
        // If document already exists, update it, otherwise create
        const existingDoc = await tx.customerDocument.findFirst({
          where: { customerId: id },
        });

        if (existingDoc) {
          await tx.customerDocument.update({
            where: { id: existingDoc.id },
            data: document,
          });
        } else {
          await tx.customerDocument.create({
            data: {
              customerId: id,
              ...document,
            },
          });
        }
      }

      return tx.customer.findUnique({
        where: { id },
        include: { documents: true },
      });
    });
  }

  static async getStayHistory(id: string) {
    return prisma.checkIn.findMany({
      where: { customerId: id },
      include: {
        room: true,
        checkoutRecord: {
          include: { invoice: true },
        },
        payments: true,
      },
      orderBy: { checkInTime: 'desc' },
    });
  }
}
