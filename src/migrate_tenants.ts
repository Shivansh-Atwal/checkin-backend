import prisma from './config/db';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

async function run() {
  try {
    const schemas: any = await prisma.$queryRawUnsafe(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%'
    `);
    
    const tenantSchemas = schemas.map((r: any) => r.schema_name);
    console.log('Found tenant schemas:', tenantSchemas);

    const baseDbUrl = process.env.DATABASE_URL;
    if (!baseDbUrl) {
      throw new Error('DATABASE_URL is not set in env');
    }

    for (const schemaName of tenantSchemas) {
      console.log(`\n--------------------------------------------`);
      console.log(`Migrating/Pushing schema to: ${schemaName}...`);
      
      let tenantDbUrl = baseDbUrl;
      if (baseDbUrl.includes('?')) {
        if (tenantDbUrl.includes('schema=')) {
          tenantDbUrl = tenantDbUrl.replace(/schema=[^&]*/, `schema=${schemaName}`);
        } else {
          tenantDbUrl = `${tenantDbUrl}&schema=${schemaName}`;
        }
      } else {
        tenantDbUrl = `${baseDbUrl}?schema=${schemaName}`;
      }

      // Ensure connection_limit is in the connection string
      if (!tenantDbUrl.includes('connection_limit=')) {
        tenantDbUrl = `${tenantDbUrl}&connection_limit=2`;
      }

      try {
        const command = `npx prisma db push --accept-data-loss`;
        const { stdout } = await execPromise(command, {
          env: {
            ...process.env,
            DATABASE_URL: tenantDbUrl,
          },
        });
        console.log(`SUCCESS for ${schemaName}`);
        console.log(stdout.trim());
      } catch (err: any) {
        console.error(`FAILED for ${schemaName}:`, err.message || err);
      }
    }
    
    console.log(`\n--------------------------------------------`);
    console.log('All tenant schemas processed.');
  } catch (err) {
    console.error('Migration script failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
