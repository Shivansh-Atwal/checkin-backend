"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClientForSchema = exports.tenantStorage = void 0;
const client_1 = require("@prisma/client");
const async_hooks_1 = require("async_hooks");
// Storage for request-scoped tenant schema clients
exports.tenantStorage = new async_hooks_1.AsyncLocalStorage();
// Cache for instanced PrismaClients per schema to avoid connection/memory leaks
const clientsCache = {};
const getPrismaClientForSchema = (schemaName) => {
    const cleanSchema = schemaName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanSchema)
        return clientsCache['public'] || (clientsCache['public'] = new client_1.PrismaClient());
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
        }
        else {
            tenantDbUrl = `${tenantDbUrl}&schema=${cleanSchema}`;
        }
    }
    else {
        tenantDbUrl = `${baseDbUrl}?schema=${cleanSchema}`;
    }
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
// Default static client
const defaultPrisma = new client_1.PrismaClient();
clientsCache['public'] = defaultPrisma;
// Transparent Proxy redirecting all calls to the request-scoped tenant client
const prismaProxy = new Proxy(defaultPrisma, {
    get(target, prop) {
        const context = exports.tenantStorage.getStore();
        const client = context?.client || defaultPrisma;
        return Reflect.get(client, prop);
    },
});
exports.default = prismaProxy;
