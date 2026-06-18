export const ROLES = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  
  ROOMS_CREATE: 'rooms.create',
  ROOMS_READ: 'rooms.read',
  ROOMS_UPDATE: 'rooms.update',
  ROOMS_DELETE: 'rooms.delete',

  BOOKINGS_CREATE: 'bookings.create',
  BOOKINGS_READ: 'bookings.read',
  BOOKINGS_UPDATE: 'bookings.update',
  BOOKINGS_CANCEL: 'bookings.cancel',

  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',

  CHECKINS_CREATE: 'checkins.create',
  CHECKOUTS_CREATE: 'checkouts.create',

  PAYMENTS_CREATE: 'payments.create',
  PAYMENTS_READ: 'payments.read',

  REPORTS_READ: 'reports.read',
  EMPLOYEES_MANAGE: 'employees.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDITLOGS_READ: 'auditlogs.read',
} as const;

export type PermissionType = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export type RoleType = typeof ROLES[keyof typeof ROLES];
