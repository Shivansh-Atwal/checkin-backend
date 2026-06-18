import prisma from '../config/db';

export class AuditLogService {
  static async log({
    userId,
    userName,
    action,
    ipAddress,
    deviceInformation,
    details,
  }: {
    userId?: string;
    userName?: string;
    action: string;
    ipAddress?: string;
    deviceInformation?: string;
    details?: Record<string, any>;
  }) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: userId || null,
          userName: userName || 'System',
          action,
          ipAddress: ipAddress || null,
          deviceInformation: deviceInformation || null,
          details: details ? JSON.stringify(details) : null,
        },
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
}
