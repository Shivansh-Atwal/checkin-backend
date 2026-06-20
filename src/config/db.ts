import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

// Storage for request-scoped tenant schema clients
export const tenantStorage = new AsyncLocalStorage<PrismaClient>();

// Cache for instanced PrismaClients per schema to avoid connection/memory leaks
const clientsCache: Record<string, PrismaClient> = {};

export const getPrismaClientForSchema = (schemaName: string): PrismaClient => {
  const cleanSchema = schemaName.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!cleanSchema) return clientsCache['public'] || (clientsCache['public'] = new PrismaClient());

  if (clientsCache[cleanSchema]) {
    return clientsCache[cleanSchema];
  }

  const baseDbUrl = process.env.DATABASE_URL;
  if (!baseDbUrl) {
    throw new Error('DATABASE_URL is not set in env');
  }

  // Inject or replace the schema parameter in the DATABASE_URL
  let tenantDbUrl = baseDbUrl;
  if (baseDbUrl.includes('?')) {
    if (tenantDbUrl.includes('schema=')) {
      tenantDbUrl = tenantDbUrl.replace(/schema=[^&]*/, `schema=${cleanSchema}`);
    } else {
      tenantDbUrl = `${tenantDbUrl}&schema=${cleanSchema}`;
    }
  } else {
    tenantDbUrl = `${baseDbUrl}?schema=${cleanSchema}`;
  }

  const client = new PrismaClient({
    datasources: {
      db: {
        url: tenantDbUrl,
      },
    },
  });

  clientsCache[cleanSchema] = client;
  return client;
};

// Default static client
const defaultPrisma = new PrismaClient();
clientsCache['public'] = defaultPrisma;

// Transparent Proxy redirecting all calls to the request-scoped tenant client
const prismaProxy = new Proxy(defaultPrisma, {
  get(target, prop) {
    const activeClient = tenantStorage.getStore();
    const client = activeClient || defaultPrisma;
    return Reflect.get(client, prop);
  },
});

export default prismaProxy;
