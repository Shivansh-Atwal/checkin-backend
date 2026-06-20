"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantMiddleware = void 0;
const db_1 = require("../config/db");
const tenantMiddleware = (req, res, next) => {
    // Extract tenant schema name from request header 'X-Tenant-Id'
    const tenantHeader = req.headers['x-tenant-id'];
    // Default schema name is 'public'
    const schemaName = tenantHeader && tenantHeader.toLowerCase() !== 'public'
        ? `tenant_${tenantHeader.toLowerCase().replace(/[^a-z0-9_]/g, '')}`
        : 'public';
    console.log(`[Tenant Middleware] Path: ${req.path} | X-Tenant-Id: '${tenantHeader || ''}' -> Schema: '${schemaName}'`);
    try {
        const client = (0, db_1.getPrismaClientForSchema)(schemaName);
        db_1.tenantStorage.run(client, () => {
            next();
        });
    }
    catch (err) {
        next(err);
    }
};
exports.tenantMiddleware = tenantMiddleware;
