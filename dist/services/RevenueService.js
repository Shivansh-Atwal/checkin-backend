"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueService = void 0;
const db_1 = __importDefault(require("../config/db"));
/**
 * Normalizes a date to a YYYY-MM-DD string representation in local time.
 */
function toLocalDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
class RevenueService {
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
    static async calculateRevenue(startDate, endDate) {
        const startStr = toLocalDateStr(startDate);
        const endStr = toLocalDateStr(endDate);
        // Initialize daily map with 0 values for all dates in range
        const dailyMap = {};
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
        // Query stays that overlap with the range or have extra charges in the range
        const stays = await db_1.default.checkIn.findMany({
            where: {
                OR: [
                    {
                        checkInTime: { lte: endDate },
                        OR: [
                            { actualCheckOutTime: { gte: startDate } },
                            { actualCheckOutTime: null, expectedCheckOutDate: { gte: startDate } }
                        ]
                    },
                    {
                        extraCharges: {
                            some: {
                                createdAt: {
                                    gte: startDate,
                                    lte: endDate
                                }
                            }
                        }
                    }
                ]
            },
            include: {
                checkoutRecord: true,
                extraCharges: true
            }
        });
        const contributingStayIds = new Set();
        for (const stay of stays) {
            const checkInTime = new Date(stay.checkInTime);
            const checkOutTime = stay.actualCheckOutTime ? new Date(stay.actualCheckOutTime) : new Date(stay.expectedCheckOutDate);
            const diffMs = checkOutTime.getTime() - checkInTime.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const nightsCount = Math.max(1, diffDays);
            const checkout = stay.checkoutRecord;
            let roomChargePerNight = 0;
            let netAdditionalCharges = 0;
            let additionalCharges = 0;
            let discount = 0;
            const extraChargesList = stay.extraCharges || [];
            const dbExtraChargesSum = extraChargesList.reduce((sum, item) => sum + item.amount, 0);
            if (checkout) {
                const totalRoomCharges = checkout.roomCharges || 0;
                additionalCharges = checkout.additionalCharges || 0;
                discount = checkout.discount || 0;
                const totalBeforeDiscount = totalRoomCharges + additionalCharges;
                let netRoomCharges = totalRoomCharges;
                if (totalBeforeDiscount > 0) {
                    const roomRatio = totalRoomCharges / totalBeforeDiscount;
                    const additionalRatio = additionalCharges / totalBeforeDiscount;
                    netRoomCharges = totalRoomCharges - (discount * roomRatio);
                    netAdditionalCharges = additionalCharges - (discount * additionalRatio);
                }
                else {
                    netRoomCharges = 0;
                    netAdditionalCharges = 0;
                }
                roomChargePerNight = netRoomCharges / nightsCount;
            }
            else {
                roomChargePerNight = stay.pricePerNight || 0;
                additionalCharges = dbExtraChargesSum;
                netAdditionalCharges = dbExtraChargesSum;
            }
            let contributed = false;
            // 1. Attribute room charges to each occupied night
            for (let i = 0; i < nightsCount; i++) {
                const nightDate = new Date(checkInTime);
                nightDate.setDate(nightDate.getDate() + i);
                const nightDateStr = toLocalDateStr(nightDate);
                if (nightDateStr >= startStr && nightDateStr <= endStr) {
                    if (dailyMap[nightDateStr]) {
                        dailyMap[nightDateStr].roomRevenue += roomChargePerNight;
                        contributed = true;
                    }
                }
            }
            // 2. Attribute extra charges
            const additionalChargesRatio = additionalCharges > 0 ? (netAdditionalCharges / additionalCharges) : 0;
            // A. Actual items in ExtraCharge table
            for (const item of extraChargesList) {
                const itemDateStr = toLocalDateStr(new Date(item.createdAt));
                const netItemAmount = item.amount * additionalChargesRatio;
                if (itemDateStr >= startStr && itemDateStr <= endStr) {
                    if (dailyMap[itemDateStr]) {
                        dailyMap[itemDateStr].extraChargesRevenue += netItemAmount;
                        contributed = true;
                    }
                }
            }
            // B. Extra beds charges (difference between recorded checkout additionalCharges and db extra charges)
            const extraBedChargePart = additionalCharges - dbExtraChargesSum;
            if (extraBedChargePart > 0) {
                const netExtraBedChargePart = extraBedChargePart * additionalChargesRatio;
                const extraBedChargePerNight = netExtraBedChargePart / nightsCount;
                for (let i = 0; i < nightsCount; i++) {
                    const nightDate = new Date(checkInTime);
                    nightDate.setDate(nightDate.getDate() + i);
                    const nightDateStr = toLocalDateStr(nightDate);
                    if (nightDateStr >= startStr && nightDateStr <= endStr) {
                        if (dailyMap[nightDateStr]) {
                            dailyMap[nightDateStr].extraChargesRevenue += extraBedChargePerNight;
                            contributed = true;
                        }
                    }
                }
            }
            if (contributed) {
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
exports.RevenueService = RevenueService;
