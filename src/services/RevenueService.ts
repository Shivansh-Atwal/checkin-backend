import prisma from '../config/db';

interface RevenueDetail {
  totalRevenue: number;
  roomRevenue: number;
  additionalItemsRevenue: number;
  bookingsCount: number;
  dailyBreakdown: Record<string, {
    date: string;
    roomRevenue: number;
    extraChargesRevenue: number;
    totalRevenue: number;
  }>;
}

/**
 * Normalizes a date to a YYYY-MM-DD string representation in local time.
 */
function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class RevenueService {
  /**
   * Calculates the revenue for a given date range.
   * Revenue is calculated based on:
   * - Room Charges: Sum of room charges recognized per occupied night.
   * - Extra Charges: Sum of all billable extra services on the date they were added.
   *
   * Taxes, payments, deposits, invoice totals are ignored.
   * Discounts are applied proportionally to reduce room and additional charges.
   *
   * @param startDate The start date of the range
   * @param endDate The end date of the range
   */
  static async calculateRevenue(startDate: Date, endDate: Date): Promise<RevenueDetail> {
    const startStr = toLocalDateStr(startDate);
    const endStr = toLocalDateStr(endDate);

    // Initialize daily map with 0 values for all dates in range
    const dailyMap: Record<string, { date: string; roomRevenue: number; extraChargesRevenue: number; totalRevenue: number; }> = {};
    const current = new Date(startDate);
    while (toLocalDateStr(current) <= endStr) {
      const dStr = toLocalDateStr(current);
      dailyMap[dStr] = {
        date: dStr,
        roomRevenue: 0,
        extraChargesRevenue: 0,
        totalRevenue: 0
      };
      current.setDate(current.getDate() + 1);
    }

    // Query stays that were checked out within the date range
    const stays = await prisma.checkIn.findMany({
      where: {
        status: 'CHECKED_OUT',
        actualCheckOutTime: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        checkoutRecord: true,
        extraCharges: true
      }
    });

    const contributingStayIds = new Set<string>();

    for (const stay of stays) {
      if (!stay.actualCheckOutTime) continue;
      
      const checkOutDateStr = toLocalDateStr(new Date(stay.actualCheckOutTime));
      if (checkOutDateStr < startStr || checkOutDateStr > endStr) continue;

      const checkout = stay.checkoutRecord;

      let netRoomCharges = 0;
      let netAdditionalCharges = 0;

      if (checkout) {
        const totalRoomCharges = checkout.roomCharges || 0;
        const additionalCharges = checkout.additionalCharges || 0;
        const discount = checkout.discount || 0;
        const totalBeforeDiscount = totalRoomCharges + additionalCharges;

        if (totalBeforeDiscount > 0) {
          const roomRatio = totalRoomCharges / totalBeforeDiscount;
          const additionalRatio = additionalCharges / totalBeforeDiscount;
          netRoomCharges = totalRoomCharges - (discount * roomRatio);
          netAdditionalCharges = additionalCharges - (discount * additionalRatio);
        }
      } else {
        // Fallback if no checkout record (should not happen for CHECKED_OUT status)
        const checkInTime = new Date(stay.checkInTime);
        const checkOutTime = new Date(stay.actualCheckOutTime);
        const diffMs = checkOutTime.getTime() - checkInTime.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const nightsCount = Math.max(1, diffDays);

        netRoomCharges = (stay.pricePerNight || 0) * nightsCount;
        const extraChargesList = stay.extraCharges || [];
        netAdditionalCharges = extraChargesList.reduce((sum, item) => sum + item.amount, 0);
      }

      if (dailyMap[checkOutDateStr]) {
        dailyMap[checkOutDateStr].roomRevenue += netRoomCharges;
        dailyMap[checkOutDateStr].extraChargesRevenue += netAdditionalCharges;
        contributingStayIds.add(stay.id);
      }
    }

    // Sum up totals
    let totalRoomRevenue = 0;
    let totalExtraChargesRevenue = 0;
    for (const key of Object.keys(dailyMap)) {
      const day = dailyMap[key];
      day.totalRevenue = day.roomRevenue + day.extraChargesRevenue;
      totalRoomRevenue += day.roomRevenue;
      totalExtraChargesRevenue += day.extraChargesRevenue;
    }

    return {
      totalRevenue: totalRoomRevenue + totalExtraChargesRevenue,
      roomRevenue: totalRoomRevenue,
      additionalItemsRevenue: totalExtraChargesRevenue,
      bookingsCount: contributingStayIds.size,
      dailyBreakdown: dailyMap
    };
  }
}
