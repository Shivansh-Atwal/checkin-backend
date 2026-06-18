import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Seed Permissions
  const permissionsList = [
    { name: 'dashboard.view', description: 'View dashboard metrics and grids' },
    { name: 'rooms.create', description: 'Add new rooms' },
    { name: 'rooms.read', description: 'View room details' },
    { name: 'rooms.update', description: 'Edit existing rooms' },
    { name: 'rooms.delete', description: 'Delete rooms' },
    { name: 'bookings.create', description: 'Create reservations' },
    { name: 'bookings.read', description: 'View reservations' },
    { name: 'bookings.update', description: 'Modify reservations' },
    { name: 'bookings.cancel', description: 'Cancel reservations' },
    { name: 'customers.create', description: 'Add new guest records' },
    { name: 'customers.read', description: 'Search and view guest details' },
    { name: 'customers.update', description: 'Edit guest records' },
    { name: 'checkins.create', description: 'Perform customer check-in' },
    { name: 'checkouts.create', description: 'Perform customer check-out' },
    { name: 'payments.create', description: 'Record payment transactions' },
    { name: 'payments.read', description: 'View payment receipts and trends' },
    { name: 'reports.read', description: 'Access revenue and occupancy charts' },
    { name: 'employees.manage', description: 'Manage employee accounts and override permissions' },
    { name: 'settings.manage', description: 'Manage site settings' },
    { name: 'auditlogs.read', description: 'Read system audit logs' },
  ];

  const permissionsMap: Record<string, string> = {};

  for (const perm of permissionsList) {
    const createdPerm = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: { name: perm.name, description: perm.description },
    });
    permissionsMap[perm.name] = createdPerm.id;
  }
  console.log('Permissions seeded.');

  // 2. Seed Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'System Administrator / Owner with all accesses',
    },
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: 'EMPLOYEE' },
    update: {},
    create: {
      name: 'EMPLOYEE',
      description: 'Standard staff / Receptionist with limited operations',
    },
  });
  console.log('Roles seeded.');

  // 3. Link Permissions to Roles
  // Admin gets all permissions
  for (const permName of Object.keys(permissionsMap)) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permissionsMap[permName],
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permissionsMap[permName],
      },
    });
  }

  // Employee gets limited permissions
  const employeePerms = [
    'dashboard.view',
    'rooms.read',
    'bookings.create',
    'bookings.read',
    'bookings.update',
    'bookings.cancel',
    'customers.create',
    'customers.read',
    'customers.update',
    'checkins.create',
    'checkouts.create',
    'payments.create',
    'payments.read',
  ];

  for (const permName of employeePerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: employeeRole.id,
          permissionId: permissionsMap[permName],
        },
      },
      update: {},
      create: {
        roleId: employeeRole.id,
        permissionId: permissionsMap[permName],
      },
    });
  }
  console.log('Role permissions mapped.');

  // 4. Seed Default Admin
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@hotelflow.com' },
    update: {},
    create: {
      email: 'admin@hotelflow.com',
      passwordHash: adminPasswordHash,
      fullName: 'System Owner',
      roleId: adminRole.id,
    },
  });

  // Seed Default Employee for testing
  const employeePasswordHash = await bcrypt.hash('staff123', 10);
  await prisma.user.upsert({
    where: { email: 'staff@hotelflow.com' },
    update: {},
    create: {
      email: 'staff@hotelflow.com',
      passwordHash: employeePasswordHash,
      fullName: 'John Receptionist',
      roleId: employeeRole.id,
    },
  });
  console.log('Default users seeded.');

  // 5. Seed Rooms
  const initialRooms = [
    { roomNumber: '101', capacity: 1 },
    { roomNumber: '102', capacity: 2 },
    { roomNumber: '103', capacity: 2 },
    { roomNumber: '201', capacity: 2 },
    { roomNumber: '202', capacity: 4 },
  ];

  for (const r of initialRooms) {
    await prisma.room.upsert({
      where: { roomNumber: r.roomNumber },
      update: {
        capacity: r.capacity,
      },
      create: r,
    });
  }
  console.log('Sample rooms seeded.');
  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
