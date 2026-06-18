"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPermission = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("./errorHandler");
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default-hotelflow-jwt-access-secret-key-reception';
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new errorHandler_1.AppError(401, 'Access denied. No authentication token provided.'));
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
        req.user = decoded;
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
        if (permissions.includes(requiredPermission)) {
            return next();
        }
        return next(new errorHandler_1.AppError(403, `Access denied. You do not have permission to perform this action (${requiredPermission}).`));
    };
};
exports.checkPermission = checkPermission;
