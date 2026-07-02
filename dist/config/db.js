"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectAllClients = exports.initializeTenantSchemas = exports.isValidSchema = exports.registerValidSchema = exports.getPrismaClientForSchema = exports.tenantStorage = void 0;
const client_1 = require("@prisma/client");
const async_hooks_1 = require("async_hooks");
exports.tenantStorage = new async_hooks_1.AsyncLocalStorage();
const clientsCache = {};
// Helper to get a database URL with connection_limit=2 and a custom schema parameter
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
    // Enforce connection_limit=2 to prevent connection exhaustion in serverless/watch mode
    if (url.includes('connection_limit=')) {
        url = url.replace(/connection_limit=[^&]*/, 'connection_limit=2');
    }
    else {
        url = url.includes('?') ? `${url}&connection_limit=2` : `${url}?connection_limit=2`;
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
const defaultUrl = getTenantDbUrl('public');
const defaultPrisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: defaultUrl,
        },
    },
});
clientsCache['public'] = defaultPrisma;
const validSchemas = new Set(['public']);
const registerValidSchema = (schemaName) => {
    validSchemas.add(schemaName.toLowerCase().replace(/[^a-z0-9_]/g, ''));
};
exports.registerValidSchema = registerValidSchema;
const isValidSchema = (schemaName) => {
    const clean = schemaName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return validSchemas.has(clean);
};
exports.isValidSchema = isValidSchema;
const initializeTenantSchemas = async () => {
    try {
        const schemas = await defaultPrisma.$queryRawUnsafe(`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`);
        for (const s of schemas) {
            validSchemas.add(s.schema_name);
        }
        console.log(`[Schema Registry] Loaded ${validSchemas.size} valid schemas into memory cache.`);
    }
    catch (err) {
        console.error('[Schema Registry] Failed to initialize tenant schemas list:', err);
    }
};
exports.initializeTenantSchemas = initializeTenantSchemas;
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
// Transparent Proxy redirecting all calls to the request-scoped tenant client
const prismaProxy = new Proxy(defaultPrisma, {
    get(target, prop) {
        const context = exports.tenantStorage.getStore();
        const client = context?.client || defaultPrisma;
        return Reflect.get(client, prop);
    },
});
exports.default = prismaProxy;
