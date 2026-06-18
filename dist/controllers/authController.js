"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const UserRepository_1 = require("../repositories/UserRepository");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = __importDefault(require("../config/db"));
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default-hotelflow-jwt-access-secret-key-reception';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default-hotelflow-jwt-refresh-secret-key-owner';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
class AuthController {
    static async login(req, res, next) {
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new errorHandler_1.AppError(400, 'Email and password are required.'));
        }
        try {
            const user = await UserRepository_1.UserRepository.findByEmail(email);
            if (!user || user.isDisabled) {
                return next(new errorHandler_1.AppError(401, 'Invalid credentials or account disabled.'));
            }
            const isPasswordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
            if (!isPasswordValid) {
                return next(new errorHandler_1.AppError(401, 'Invalid credentials.'));
            }
            // Compile permissions: Role permissions or direct overrides
            const allPermissions = user.hasCustomPermissions
                ? user.userPermissions.map((up) => up.permission.name)
                : user.role.permissions.map((rp) => rp.permission.name);
            // Create tokens
            const accessToken = jsonwebtoken_1.default.sign({
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role.name,
                permissions: allPermissions,
            }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
            const refreshToken = jsonwebtoken_1.default.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
            // Record Login History
            await db_1.default.loginHistory.create({
                data: {
                    userId: user.id,
                    ipAddress: req.ip || null,
                    userAgent: req.headers['user-agent'] || null,
                },
            });
            res.status(200).json({
                success: true,
                data: {
                    accessToken,
                    refreshToken,
                    user: {
                        id: user.id,
                        email: user.email,
                        fullName: user.fullName,
                        role: user.role.name,
                        permissions: allPermissions,
                    },
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async refresh(req, res, next) {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return next(new errorHandler_1.AppError(400, 'Refresh token is required.'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(refreshToken, REFRESH_SECRET);
            const user = await UserRepository_1.UserRepository.findById(decoded.id);
            if (!user || user.isDisabled) {
                return next(new errorHandler_1.AppError(401, 'User account not found or disabled.'));
            }
            // Compile permissions: Role permissions or direct overrides
            const allPermissions = user.hasCustomPermissions
                ? user.userPermissions.map((up) => up.permission.name)
                : user.role.permissions.map((rp) => rp.permission.name);
            const newAccessToken = jsonwebtoken_1.default.sign({
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role.name,
                permissions: allPermissions,
            }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
            res.status(200).json({
                success: true,
                data: {
                    accessToken: newAccessToken,
                },
            });
        }
        catch (error) {
            return next(new errorHandler_1.AppError(401, 'Invalid or expired refresh token.'));
        }
    }
    static async getProfile(req, res, next) {
        if (!req.user) {
            return next(new errorHandler_1.AppError(401, 'Not authenticated.'));
        }
        try {
            const user = await UserRepository_1.UserRepository.findById(req.user.id);
            if (!user) {
                return next(new errorHandler_1.AppError(404, 'User not found.'));
            }
            res.status(200).json({
                success: true,
                data: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role.name,
                    isDisabled: user.isDisabled,
                    permissions: req.user.permissions,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AuthController = AuthController;
