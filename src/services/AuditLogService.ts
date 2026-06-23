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
      // Copy details to enrich it with room numbers and customer names if needed
      const detailsCopy = details ? { ...details } : null;

      if (detailsCopy) {
        const roomIdsToLookup = new Set<string>();
        const customerIdsToLookup = new Set<string>();

        const collectIds = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;

          if (obj.roomId && typeof obj.roomId === 'string' && obj.roomId.length === 36) {
            roomIdsToLookup.add(obj.roomId);
          }
          if (obj.roomIds && Array.isArray(obj.roomIds)) {
            obj.roomIds.forEach((id: any) => {
              if (typeof id === 'string' && id.length === 36) {
                roomIdsToLookup.add(id);
              }
            });
          }

          if (obj.customerId && typeof obj.customerId === 'string' && obj.customerId.length === 36) {
            customerIdsToLookup.add(obj.customerId);
          }
          if (obj.customerIds && Array.isArray(obj.customerIds)) {
            obj.customerIds.forEach((id: any) => {
              if (typeof id === 'string' && id.length === 36) {
                customerIdsToLookup.add(id);
              }
            });
          }

          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              if (typeof obj[key] === 'object') {
                collectIds(obj[key]);
              }
            }
          }
        };

        collectIds(detailsCopy);

        // Resolve Rooms
        if (roomIdsToLookup.size > 0) {
          const rooms = await prisma.room.findMany({
            where: {
              id: { in: Array.from(roomIdsToLookup) }
            },
            select: {
              id: true,
              roomNumber: true
            }
          });

          const roomMap = new Map(rooms.map(r => [r.id, r.roomNumber]));

          const rootRoomNumbers: string[] = [];
          if (detailsCopy.roomId && roomMap.has(detailsCopy.roomId)) {
            rootRoomNumbers.push(roomMap.get(detailsCopy.roomId)!);
          }
          if (detailsCopy.roomIds && Array.isArray(detailsCopy.roomIds)) {
            detailsCopy.roomIds.forEach((id: string) => {
              if (roomMap.has(id)) {
                rootRoomNumbers.push(roomMap.get(id)!);
              }
            });
          }
          if (rootRoomNumbers.length > 0) {
            detailsCopy.roomNumbers = rootRoomNumbers.join(', ');
          }

          if (detailsCopy.updates && typeof detailsCopy.updates === 'object') {
            const updatesCopy = { ...detailsCopy.updates };
            if (updatesCopy.roomId && roomMap.has(updatesCopy.roomId)) {
              updatesCopy.roomNumber = roomMap.get(updatesCopy.roomId)!;
              delete updatesCopy.roomId;
            }
            detailsCopy.updates = updatesCopy;
          }

          delete detailsCopy.roomId;
          delete detailsCopy.roomIds;
        }

        // Resolve Customers
        if (customerIdsToLookup.size > 0) {
          const customers = await prisma.customer.findMany({
            where: {
              id: { in: Array.from(customerIdsToLookup) }
            },
            select: {
              id: true,
              fullName: true
            }
          });

          const customerMap = new Map(customers.map(c => [c.id, c.fullName]));

          const rootCustomerNames: string[] = [];
          if (detailsCopy.customerId && customerMap.has(detailsCopy.customerId)) {
            rootCustomerNames.push(customerMap.get(detailsCopy.customerId)!);
          }
          if (detailsCopy.customerIds && Array.isArray(detailsCopy.customerIds)) {
            detailsCopy.customerIds.forEach((id: string) => {
              if (customerMap.has(id)) {
                rootCustomerNames.push(customerMap.get(id)!);
              }
            });
          }
          if (rootCustomerNames.length > 0) {
            detailsCopy.customerName = rootCustomerNames.join(', ');
          }

          if (detailsCopy.updates && typeof detailsCopy.updates === 'object') {
            const updatesCopy = { ...detailsCopy.updates };
            if (updatesCopy.customerId && customerMap.has(updatesCopy.customerId)) {
              updatesCopy.customerName = customerMap.get(updatesCopy.customerId)!;
              delete updatesCopy.customerId;
            }
            detailsCopy.updates = updatesCopy;
          }

          delete detailsCopy.customerId;
          delete detailsCopy.customerIds;
        }
      }

      await prisma.auditLog.create({
        data: {
          userId: userId || null,
          userName: userName || 'System',
          action,
          ipAddress: ipAddress || null,
          deviceInformation: deviceInformation || null,
          details: detailsCopy ? JSON.stringify(detailsCopy) : null,
        },
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
}
