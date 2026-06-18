"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerRepository = void 0;
const db_1 = __importDefault(require("../config/db"));
class CustomerRepository {
    static async findById(id) {
        return db_1.default.customer.findUnique({
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
    static async findByMobile(mobileNumber) {
        return db_1.default.customer.findUnique({
            where: { mobileNumber },
            include: { documents: true },
        });
    }
    static async search(query) {
        return db_1.default.customer.findMany({
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
    static async create(data) {
        const { document, ...customerData } = data;
        return db_1.default.$transaction(async (tx) => {
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
    static async update(id, data) {
        const { document, ...customerData } = data;
        return db_1.default.$transaction(async (tx) => {
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
                }
                else {
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
    static async getStayHistory(id) {
        return db_1.default.checkIn.findMany({
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
exports.CustomerRepository = CustomerRepository;
