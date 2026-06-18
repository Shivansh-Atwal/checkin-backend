import prisma from '../config/db';

export class RoomRepository {
  private static mapRoom(r: any) {
    if (!r) return null;
    let status = 'AVAILABLE';
    if (r.checkIns && r.checkIns.length > 0) {
      status = 'OCCUPIED';
    } else if (r.bookings && r.bookings.length > 0) {
      status = 'ADVANCE_BOOKED';
    }
    return {
      id: r.id,
      roomNumber: r.roomNumber,
      capacity: r.capacity,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Derived fields
      status,
      floorNumber: parseInt(r.roomNumber.charAt(0)) || 1,
      roomType: r.capacity > 2 ? 'Deluxe' : 'Standard',
      description: '',
      amenities: 'WiFi, AC',
      images: [],
      checkIns: r.checkIns || [],
      bookings: r.bookings || [],
    };
  }

  static async findById(id: string) {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        checkIns: {
          where: { status: 'ACTIVE' },
          include: { customer: true },
        },
        bookings: {
          where: { status: 'CONFIRMED' },
          include: { customer: true },
        },
      },
    });
    return this.mapRoom(room);
  }

  static async findByRoomNumber(roomNumber: string) {
    const room = await prisma.room.findUnique({
      where: { roomNumber },
      include: {
        checkIns: {
          where: { status: 'ACTIVE' },
        },
        bookings: {
          where: { status: 'CONFIRMED' },
        },
      },
    });
    return this.mapRoom(room);
  }

  static async getAll(filters?: { status?: string; roomType?: string }) {
    const rooms = await prisma.room.findMany({
      include: {
        checkIns: {
          where: { status: 'ACTIVE' },
        },
        bookings: {
          where: { status: 'CONFIRMED' },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });

    let mapped = rooms.map(r => this.mapRoom(r)).filter((r): r is NonNullable<typeof r> => r !== null);

    if (filters && filters.status) {
      const targetStatus = filters.status;
      mapped = mapped.filter(r => r.status === targetStatus);
    }
    if (filters && filters.roomType) {
      const targetRoomType = filters.roomType.toLowerCase();
      mapped = mapped.filter(r => r.roomType.toLowerCase() === targetRoomType);
    }
    return mapped;
  }

  static async create(data: {
    roomNumber: string;
    capacity: number;
  }) {
    const room = await prisma.room.create({
      data: {
        roomNumber: data.roomNumber,
        capacity: Number(data.capacity),
      },
      include: {
        checkIns: { where: { status: 'ACTIVE' } },
        bookings: { where: { status: 'CONFIRMED' } },
      }
    });

    return this.mapRoom(room);
  }

  static async update(
    id: string,
    data: Partial<{
      roomNumber: string;
      capacity: number;
    }>
  ) {
    const updateData: any = {};
    if (data.roomNumber !== undefined) updateData.roomNumber = data.roomNumber;
    if (data.capacity !== undefined) updateData.capacity = Number(data.capacity);

    const room = await prisma.room.update({
      where: { id },
      data: updateData,
      include: {
        checkIns: { where: { status: 'ACTIVE' } },
        bookings: { where: { status: 'CONFIRMED' } },
      }
    });

    return this.mapRoom(room);
  }

  static async updateStatus(id: string, status: string) {
    // Status is derived dynamically, so no database update is necessary.
    return this.findById(id);
  }

  static async delete(id: string) {
    return prisma.room.delete({
      where: { id },
    });
  }
}
