"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPermission = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("./errorHandler");
const db_1 = require("../config/db");
const env_1 = require("../config/env");
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new errorHandler_1.AppError(401, 'Access denied. No authentication token provided.'));
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_ACCESS_SECRET);
        req.user = decoded;
        // Cross-tenant boundary check:
        const tokenTenantSchema = decoded.tenantId === 'public' ? 'public' : `tenant_${decoded.tenantId.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
        const store = db_1.tenantStorage.getStore();
        const activeTenantSchema = store?.tenantId || 'public';
        if (tokenTenantSchema !== activeTenantSchema) {
            return next(new errorHandler_1.AppError(403, 'Access denied. Token tenant does not match request tenant context.'));
        }
        next();
    }
    catch (error) {
        return next(new errorHandler_1.AppError(401, 'Invalid or expired authentication token.'));
    }
};
exports.authenticate = authenticate;
const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new errorHandler_1.AppError(401, 'User not authenticated.'));
        }
        const { role, permissions } = req.user;
        // Admin has superuser access to all permissions
        if (role === 'ADMIN') {
            return next();
        }
        if (permissions && permissions.includes(requiredPermission)) {
            return next();
        }
        return next(new errorHandler_1.AppError(403, `Access denied. You do not have permission to perform this action (${requiredPermission}).`));
    };
};
exports.checkPermission = checkPermission;
