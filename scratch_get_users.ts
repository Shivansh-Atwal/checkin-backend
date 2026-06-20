import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const baseDbUrl = process.env.DATABASE_URL;

if (!baseDbUrl) {
  console.error('DATABASE_URL is not configured in .env!');
  process.exit(1);
}

const getClientForSchema = (schema: string) => {
  let tenantDbUrl = baseDbUrl;
  if (baseDbUrl.includes('?')) {
    if (tenantDbUrl.includes('schema=')) {
      tenantDbUrl = tenantDbUrl.replace(/schema=[^&]*/, `schema=${schema}`);
    } else {
      tenantDbUrl = `${tenantDbUrl}&schema=${schema}`;
    }
  } else {
    tenantDbUrl = `${baseDbUrl}?schema=${schema}`;
  }
  return new PrismaClient({
    datasources: {
      db: {
        url: tenantDbUrl,
      },
    },
  });
};

async function main() {
  const defaultClient = new PrismaClient();

  try {
    console.log('Querying database schemas...');
    
    // 1. Fetch all tenant schemas
    const schemas: any[] = await defaultClient.$queryRaw`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'public' OR schema_name LIKE 'tenant_%'
    `;

    console.log(`Found ${schemas.length} schemas. Fetching users...\n`);

    for (const s of schemas) {
      const schemaName = s.schema_name;
      console.log(`=========================================`);
      console.log(`HOTEL ENVIRONMENT / SCHEMA: ${schemaName.toUpperCase()}`);
      console.log(`=========================================`);

      const schemaClient = getClientForSchema(schemaName);

      try {
        const users = await schemaClient.user.findMany({
          select: {
            id: true,
            email: true,
            fullName: true,
            passwordHash: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        });

        if (users.length === 0) {
          console.log('No user accounts registered.');
        } else {
          users.forEach((u) => {
            console.log(`Name:      ${u.fullName}`);
            console.log(`Email:     ${u.email}`);
            console.log(`Role:      ${u.role.name}`);
            console.log(`Password:  ${u.passwordHash} (Bcrypt Hash)`);
            console.log(`-----------------------------------------`);
          });
        }
      } catch (err: any) {
        console.log(`Failed to read user table (database may not be push-initialized yet): ${err.message}`);
      } finally {
        await schemaClient.$disconnect();
      }
      console.log(); // Blank line
    }
  } catch (error: any) {
    console.error('Failed to retrieve user details:', error.message);
  } finally {
    await defaultClient.$disconnect();
  }
}

main();
