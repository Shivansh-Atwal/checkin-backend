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
                    { fullName: { contains: query, mode: 'insensitive' } },
                    { mobileNumber: { contains: query, mode: 'insensitive' } },
                    { email: { contains: query, mode: 'insensitive' } },
                    {
                        documents: {
                            some: {
                                idNumber: { contains: query, mode: 'insensitive' },
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
        const normalizedCustomer = {
            ...customerData,
            fullName: customerData.fullName ? customerData.fullName.toUpperCase() : '',
            address: customerData.address ? customerData.address.toUpperCase() : undefined,
            city: customerData.city ? customerData.city.toUpperCase() : undefined,
            state: customerData.state ? customerData.state.toUpperCase() : undefined,
            country: customerData.country ? customerData.country.toUpperCase() : undefined,
            pincode: customerData.pincode ? customerData.pincode.toUpperCase() : undefined,
            gender: customerData.gender ? customerData.gender.toUpperCase() : undefined,
        };
        return db_1.default.$transaction(async (tx) => {
            const customer = await tx.customer.create({
                data: normalizedCustomer,
            });
            if (document) {
                await tx.customerDocument.create({
                    data: {
                        customerId: customer.id,
                        ...document,
                        idType: document.idType ? document.idType.toUpperCase() : '',
                        idNumber: document.idNumber ? document.idNumber.toUpperCase() : '',
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
        const normalizedCustomer = { ...customerData };
        if (customerData.fullName)
            normalizedCustomer.fullName = customerData.fullName.toUpperCase();
        if (customerData.address)
            normalizedCustomer.address = customerData.address.toUpperCase();
        if (customerData.city)
            normalizedCustomer.city = customerData.city.toUpperCase();
        if (customerData.state)
            normalizedCustomer.state = customerData.state.toUpperCase();
        if (customerData.country)
            normalizedCustomer.country = customerData.country.toUpperCase();
        if (customerData.pincode)
            normalizedCustomer.pincode = customerData.pincode.toUpperCase();
        if (customerData.gender)
            normalizedCustomer.gender = customerData.gender.toUpperCase();
        return db_1.default.$transaction(async (tx) => {
            await tx.customer.update({
                where: { id },
                data: normalizedCustomer,
            });
            if (document) {
                const normalizedDoc = {
                    ...document,
                };
                if (document.idType)
                    normalizedDoc.idType = document.idType.toUpperCase();
                if (document.idNumber)
                    normalizedDoc.idNumber = document.idNumber.toUpperCase();
                // If document already exists, update it, otherwise create
                const existingDoc = await tx.customerDocument.findFirst({
                    where: { customerId: id },
                });
                if (existingDoc) {
                    await tx.customerDocument.update({
                        where: { id: existingDoc.id },
                        data: normalizedDoc,
                    });
                }
                else {
                    await tx.customerDocument.create({
                        data: {
                            customerId: id,
                            ...normalizedDoc,
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
