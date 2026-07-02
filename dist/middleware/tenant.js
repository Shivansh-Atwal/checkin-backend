"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantMiddleware = void 0;
const db_1 = require("../config/db");
const errorHandler_1 = require("./errorHandler");
const tenantMiddleware = async (req, res, next) => {
    const path = req.path;
    // Global public paths that do not require tenant database context resolution
    const globalBypassPaths = [
        '/health',
        '/api/auth/login',
        '/api/auth/register-tenant',
        '/api/auth/refresh' // Refresh token has encoded tenant scope
    ];
    if (globalBypassPaths.some((p) => path.startsWith(p))) {
        return next();
    }
    const tenantHeader = req.headers['x-tenant-id'];
    if (!tenantHeader) {
        return next(new errorHandler_1.AppError(400, 'X-Tenant-Id header is required to resolve tenant database context.'));
    }
    const slug = tenantHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!slug) {
        return next(new errorHandler_1.AppError(400, 'Invalid tenant identifier format.'));
    }
    const schemaName = `tenant_${slug}`;
    if (!(0, db_1.isValidSchema)(schemaName)) {
        return next(new errorHandler_1.AppError(404, `Tenant context resolution failed: Invalid or inactive Tenant ID: '${tenantHeader}'`));
    }
    try {
        const client = (0, db_1.getPrismaClientForSchema)(schemaName);
        db_1.tenantStorage.run({ client, tenantId: schemaName }, () => {
            next();
        });
    }
    catch (err) {
        return next(new errorHandler_1.AppError(404, `Tenant context resolution failed: ${err.message}`));
    }
};
exports.tenantMiddleware = tenantMiddleware;
