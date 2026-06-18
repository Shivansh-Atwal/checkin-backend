const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bookings = await prisma.booking.findMany({
    include: { customer: true, room: true }
  });
  const checkins = await prisma.checkIn.findMany({
    include: { customer: true, room: true }
  });
  console.log(`Bookings Count: ${bookings.length}`);
  console.log(`CheckIns Count: ${checkins.length}`);
  console.log('\nBookings statuses:', bookings.map(b => b.status));
  console.log('\nCheckins statuses:', checkins.map(c => c.status));
}

run();
