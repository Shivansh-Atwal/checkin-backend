"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("./config/db"));
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const execPromise = util_1.default.promisify(child_process_1.exec);
async function run() {
    try {
        const schemas = await db_1.default.$queryRawUnsafe(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%'
    `);
        const tenantSchemas = schemas.map((r) => r.schema_name);
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
                }
                else {
                    tenantDbUrl = `${tenantDbUrl}&schema=${schemaName}`;
                }
            }
            else {
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
            }
            catch (err) {
                console.error(`FAILED for ${schemaName}:`, err.message || err);
            }
        }
        console.log(`\n--------------------------------------------`);
        console.log('All tenant schemas processed.');
    }
    catch (err) {
        console.error('Migration script failed:', err);
    }
    finally {
        await db_1.default.$disconnect();
    }
}
run();
