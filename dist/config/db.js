"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectAllClients = exports.getPrismaClientForSchema = exports.tenantStorage = void 0;
const client_1 = require("@prisma/client");
const async_hooks_1 = require("async_hooks");
// Storage for request-scoped tenant schema clients
exports.tenantStorage = new async_hooks_1.AsyncLocalStorage();
// Cache for instanced PrismaClients per schema to avoid connection/memory leaks
const clientsCache = {};
// Helper to get a database URL with connection_limit=1 and a custom schema parameter
const getTenantDbUrl = (cleanSchema) => {
    const baseDbUrl = process.env.DATABASE_URL;
    if (!baseDbUrl) {
        throw new Error('DATABASE_URL is not set in env');
    }
    let url = baseDbUrl;
    // Set schema name if it's not the public schema
    if (cleanSchema && cleanSchema !== 'public') {
        if (url.includes('?')) {
            if (url.includes('schema=')) {
                url = url.replace(/schema=[^&]*/, `schema=${cleanSchema}`);
            }
            else {
                url = `${url}&schema=${cleanSchema}`;
            }
        }
        else {
            url = `${url}?schema=${cleanSchema}`;
        }
    }
    // Enforce connection_limit=1 to prevent connection exhaustion in serverless/watch mode
    if (url.includes('connection_limit=')) {
        url = url.replace(/connection_limit=[^&]*/, 'connection_limit=1');
    }
    else {
        url = url.includes('?') ? `${url}&connection_limit=1` : `${url}?connection_limit=1`;
    }
    return url;
};
const getPrismaClientForSchema = (schemaName) => {
    const cleanSchema = schemaName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'public';
    if (clientsCache[cleanSchema]) {
        return clientsCache[cleanSchema];
    }
    const tenantDbUrl = getTenantDbUrl(cleanSchema);
    const client = new client_1.PrismaClient({
        datasources: {
            db: {
                url: tenantDbUrl,
            },
        },
    });
    clientsCache[cleanSchema] = client;
    return client;
};
exports.getPrismaClientForSchema = getPrismaClientForSchema;
// Default static client (enforcing connection_limit=1)
const defaultUrl = getTenantDbUrl('public');
const defaultPrisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: defaultUrl,
        },
    },
});
clientsCache['public'] = defaultPrisma;
// Transparent Proxy redirecting all calls to the request-scoped tenant client
const prismaProxy = new Proxy(defaultPrisma, {
    get(target, prop) {
        const context = exports.tenantStorage.getStore();
        const client = context?.client || defaultPrisma;
        return Reflect.get(client, prop);
    },
});
const disconnectAllClients = async () => {
    console.log('Disconnecting all Prisma clients...');
    for (const schema in clientsCache) {
        try {
            await clientsCache[schema].$disconnect();
            console.log(`Disconnected client for schema: ${schema}`);
        }
        catch (err) {
            console.error(`Error disconnecting client for schema ${schema}:`, err);
        }
    }
};
exports.disconnectAllClients = disconnectAllClients;
exports.default = prismaProxy;
