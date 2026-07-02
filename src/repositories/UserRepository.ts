import prisma from '../config/db';

export class UserRepository {
  static async findById(id: string) {
    return prisma.user.findUnique({
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

  static async findByEmail(email: string) {
    return prisma.user.findUnique({
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
    return prisma.user.findMany({
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

  static async create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    roleId: string;
  }) {
    return prisma.user.create({
      data,
      include: { role: true },
    });
  }

  static async update(id: string, data: Partial<{
    fullName: string;
    passwordHash: string;
    roleId: string;
    isDisabled: boolean;
  }>) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  static async setCustomPermissions(userId: string, permissionIds: string[]) {
    const uniquePermissionIds = Array.from(new Set(permissionIds));
    return prisma.$transaction([
      prisma.userPermission.deleteMany({
        where: { userId },
      }),
      prisma.userPermission.createMany({
        data: uniquePermissionIds.map((permId) => ({
          userId,
          permissionId: permId,
        })),
      }),
      prisma.user.update({
        where: { id: userId },
        data: { hasCustomPermissions: true },
      }),
    ]);
  }

  static async resetCustomPermissions(userId: string) {
    return prisma.$transaction([
      prisma.userPermission.deleteMany({
        where: { userId },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { hasCustomPermissions: false },
      }),
    ]);
  }
}
