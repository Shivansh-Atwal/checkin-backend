"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantManager = exports.masterPrisma = void 0;
const master_client_1 = require("../generated/master-client");
const tenant_client_1 = require("../generated/tenant-client");
const env_1 = require("../config/env");
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const execPromise = util_1.default.promisify(child_process_1.exec);
exports.masterPrisma = new master_client_1.PrismaClient({
    datasources: {
        db: {
            url: env_1.ENV.DATABASE_URL,
        },
    },
});
class TenantManager {
    static tenantClients = {};
    static clientLastUsed = {};
    static async getTenantClient(slug) {
        const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        // 1. Look up hotel metadata in Master database
        const hotel = await exports.masterPrisma.hotel.findUnique({
            where: { slug: cleanSlug },
        });
        if (!hotel || hotel.status !== 'ACTIVE') {
            throw new Error(`Hotel tenant '${cleanSlug}' is suspended, inactive, or does not exist.`);
        }
        // 2. Resolve database URL: either dedicated database connection or suffix schema
        let dbUrl = hotel.dbUrl;
        if (!dbUrl) {
            const baseDbUrl = env_1.ENV.DATABASE_URL;
            const schemaName = `tenant_${cleanSlug}`;
            if (baseDbUrl.includes('?')) {
                if (baseDbUrl.includes('schema=')) {
                    dbUrl = baseDbUrl.replace(/schema=[^&]*/, `schema=${schemaName}`);
                }
                else {
                    dbUrl = `${baseDbUrl}&schema=${schemaName}`;
                }
            }
            else {
                dbUrl = `${baseDbUrl}?schema=${schemaName}`;
            }
        }
        // 3. Enforce safe connection limits on tenant client connections
        if (!dbUrl.includes('connection_limit=')) {
            dbUrl = dbUrl.includes('?') ? `${dbUrl}&connection_limit=3` : `${dbUrl}?connection_limit=3`;
        }
        // 4. Return cached Prisma Client if already instantiated
        if (this.tenantClients[cleanSlug]) {
            this.clientLastUsed[cleanSlug] = Date.now();
            return this.tenantClients[cleanSlug];
        }
        // 5. Instantiate new Prisma Client for the tenant database
        const client = new tenant_client_1.PrismaClient({
            datasources: {
                db: {
                    url: dbUrl,
                },
            },
        });
        this.tenantClients[cleanSlug] = client;
        this.clientLastUsed[cleanSlug] = Date.now();
        // 6. Evict older clients if cache limit is exceeded to prevent connection pool leaks
        this.evictInactiveClients();
        return client;
    }
    static async runTenantMigrations(dbUrl) {
        console.log(`[Tenant Manager] Pushing schema migrations programmatically...`);
        const command = `npx prisma db push --schema=prisma/schema.prisma --accept-data-loss`;
        const { stdout } = await execPromise(command, {
            env: {
                ...process.env,
                DATABASE_URL: dbUrl,
            },
        });
        console.log(stdout.trim());
    }
    static evictInactiveClients() {
        const keys = Object.keys(this.tenantClients);
        if (keys.length <= 30)
            return; // Keep maximum 30 active clients cached
        // Sort by last used timestamp
        keys.sort((a, b) => this.clientLastUsed[a] - this.clientLastUsed[b]);
        // Disconnect and remove the oldest 3 clients
        const toEvict = keys.slice(0, 3);
        for (const key of toEvict) {
            console.log(`[Tenant Manager] Evicting client pool for '${key}' to prevent connection leaks.`);
            this.tenantClients[key].$disconnect().catch((err) => {
                console.error(`Failed to disconnect client for '${key}':`, err);
            });
            delete this.tenantClients[key];
            delete this.clientLastUsed[key];
        }
    }
    static async disconnectAll() {
        console.log('[Tenant Manager] Disconnecting all cached Prisma clients...');
        const keys = Object.keys(this.tenantClients);
        for (const key of keys) {
            try {
                await this.tenantClients[key].$disconnect();
            }
            catch (err) {
                console.error(`Failed disconnecting cached client '${key}':`, err);
            }
        }
        await exports.masterPrisma.$disconnect();
    }
}
exports.TenantManager = TenantManager;
