import prisma, { getPrismaClientForSchema } from './src/config/db';

async function main() {
  const schemas: any[] = await prisma.$queryRaw`
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') 
      AND schema_name NOT LIKE 'pg_temp_%' 
      AND schema_name NOT LIKE 'pg_toast_temp_%';
  `;

  for (const s of schemas) {
    const schemaName = s.schema_name;
    const client = getPrismaClientForSchema(schemaName);
    try {
      const rooms = await client.room.findMany({
        include: {
          checkIns: {
            where: { status: 'ACTIVE' },
            include: { customer: true }
          },
          bookings: {
            where: { status: 'CONFIRMED' },
            include: { customer: true }
          }
        }
      });
      if (rooms.length > 0) {
        console.log(`--- Schema: ${schemaName} ---`);
        for (const room of rooms) {
          console.log(`Room ${room.roomNumber} (Capacity: ${room.capacity}):`);
          console.log(`  Active Check-ins:`, room.checkIns.map(c => ({ id: c.id, price: c.pricePerNight, guest: c.customer.fullName })));
          console.log(`  Confirmed Bookings:`, room.bookings.map(b => ({ id: b.id, price: b.price, guest: b.customer.fullName })));
        }
      }
    } catch (e) {
      // Ignore
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
