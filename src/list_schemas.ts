import prisma from './config/db';

async function run() {
  try {
    const res: any = await prisma.$queryRawUnsafe(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'
    `);
    console.log('SCHEMAS:', res.map((r: any) => r.schema_name));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
