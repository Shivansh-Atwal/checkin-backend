"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function run() {
    // Let's inspect the tenant list first
    const publicPrisma = new client_1.PrismaClient();
    try {
        const schemas = await publicPrisma.$queryRaw `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'
    `;
        const schemaNames = schemas.map((r) => r.schema_name);
        console.log('Schemas:', schemaNames);
        for (const schemaName of schemaNames) {
            console.log(`\n=================== SCHEMA: ${schemaName} ===================`);
            const baseDbUrl = process.env.DATABASE_URL;
            if (!baseDbUrl)
                throw new Error('DATABASE_URL not set');
            let tenantDbUrl = baseDbUrl;
            if (baseDbUrl.includes('?')) {
                if (tenantDbUrl.includes('schema=')) {
                    tenantDbUrl = tenantDbUrl.replace(/schema=[^&]*/, `schema=${schemaName}`);
                }
                else {
                    tenantDbUrl = `${tenantDbUrl}&schema=${schemaName}`;
                }
            }
            else {
                tenantDbUrl = `${baseDbUrl}?schema=${schemaName}`;
            }
            const prisma = new client_1.PrismaClient({
                datasources: {
                    db: {
                        url: tenantDbUrl,
                    },
                },
            });
            // Count table rows
            try {
                const bookingsCount = await prisma.booking.count();
                const checkinsCount = await prisma.checkIn.count();
                const checkoutsCount = await prisma.checkout.count();
                const paymentsCount = await prisma.payment.count();
                console.log(`Bookings: ${bookingsCount}, Checkins: ${checkinsCount}, Checkouts: ${checkoutsCount}, Payments: ${paymentsCount}`);
                if (bookingsCount > 0) {
                    const bookings = await prisma.booking.findMany({
                        take: 5,
                        orderBy: { checkInDate: 'desc' },
                        include: { payments: true }
                    });
                    console.log('\nBookings (latest 5):');
                    console.log(JSON.stringify(bookings, null, 2));
                }
                if (checkinsCount > 0) {
                    const checkins = await prisma.checkIn.findMany({
                        take: 5,
                        orderBy: { checkInTime: 'desc' },
                        include: { payments: true, checkoutRecord: true }
                    });
                    console.log('\nCheckins (latest 5):');
                    console.log(JSON.stringify(checkins, null, 2));
                }
                if (paymentsCount > 0) {
                    const payments = await prisma.payment.findMany({
                        take: 10,
                        orderBy: { paymentDate: 'desc' },
                    });
                    console.log('\nPayments (latest 10):');
                    console.log(JSON.stringify(payments, null, 2));
                }
            }
            catch (e) {
                console.error(`Error on schema ${schemaName}:`, e.message);
            }
            finally {
                await prisma.$disconnect();
            }
        }
    }
    catch (err) {
        console.error('Error:', err.message);
    }
    finally {
        await publicPrisma.$disconnect();
    }
}
run();
