"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const UserRepository_1 = require("../repositories/UserRepository");
const errorHandler_1 = require("../middleware/errorHandler");
const db_1 = __importStar(require("../config/db"));
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const execPromise = util_1.default.promisify(child_process_1.exec);
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
            let user = await UserRepository_1.UserRepository.findByEmail(email);
            let resolvedSchema = 'public';
            // Scan other tenant schemas if not found in the request-scoped schema client
            if (!user) {
                const schemas = await db_1.default.$queryRawUnsafe(`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`);
                for (const s of schemas) {
                    const tenantPrisma = (0, db_1.getPrismaClientForSchema)(s.schema_name);
                    try {
                        const foundUser = await tenantPrisma.user.findUnique({
                            where: { email },
                            include: {
                                role: {
                                    include: {
                                        permissions: {
                                            include: {
                                                permission: true,
                                            },
                                        },
                                    },
                                },
                                userPermissions: {
                                    include: {
                                        permission: true,
                                    },
                                },
                            },
                        });
                        if (foundUser) {
                            user = foundUser;
                            resolvedSchema = s.schema_name;
                            break;
                        }
                    }
                    catch (err) {
                        // Ignore error for schemas that are not initialized yet
                    }
                }
            }
            else {
                // Find which schema was active to record login history
                const tenantHeader = req.headers['x-tenant-id'];
                resolvedSchema = tenantHeader && tenantHeader.toLowerCase() !== 'public'
                    ? `tenant_${tenantHeader.toLowerCase().replace(/[^a-z0-9_]/g, '')}`
                    : 'public';
            }
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
            // Record Login History under the correct schema
            const activePrisma = (0, db_1.getPrismaClientForSchema)(resolvedSchema);
            await activePrisma.loginHistory.create({
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
                    tenantId: resolvedSchema.startsWith('tenant_') ? resolvedSchema.replace('tenant_', '') : 'public',
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
    static async registerTenant(req, res, next) {
        const { tenantName, adminEmail, adminPassword, adminFullName, developerPassword } = req.body;
        const devSecret = process.env.DEVELOPER_PASSWORD || 'hotelflow-dev-2026';
        if (developerPassword !== devSecret) {
            return next(new errorHandler_1.AppError(403, 'Invalid developer password. Registration unauthorized.'));
        }
        if (!tenantName || !adminEmail || !adminPassword || !adminFullName) {
            return next(new errorHandler_1.AppError(400, 'Tenant name, admin email, password, and full name are required.'));
        }
        const cleanTenantName = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanTenantName) {
            return next(new errorHandler_1.AppError(400, 'Invalid tenant name. Only alphanumeric characters are allowed.'));
        }
        const schemaName = `tenant_${cleanTenantName}`;
        try {
            // 1. Check if schema already exists
            const exists = await db_1.default.$queryRawUnsafe(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, schemaName);
            if (exists.length > 0) {
                return next(new errorHandler_1.AppError(409, 'This tenant name is already registered.'));
            }
            // 2. Generate DATABASE_URL for new schema
            const baseDbUrl = process.env.DATABASE_URL;
            if (!baseDbUrl) {
                throw new Error('DATABASE_URL is not set in env');
            }
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
            console.log(`Setting up database schema: ${schemaName}`);
            // 3. Programmatically push Prisma schema
            const command = `npx prisma db push --accept-data-loss`;
            await execPromise(command, {
                env: {
                    ...process.env,
                    DATABASE_URL: tenantDbUrl,
                },
            });
            // 4. Initialize client and seed basic tenant data
            const tenantPrisma = (0, db_1.getPrismaClientForSchema)(schemaName);
            // Hash password
            const passwordHash = await bcryptjs_1.default.hash(adminPassword, 10);
            // Seed within a transaction on the tenant's schema client
            await tenantPrisma.$transaction(async (tx) => {
                // A. Seed Permissions
                const permissionsList = [
                    { name: 'dashboard.view', description: 'View dashboard metrics and grids' },
                    { name: 'rooms.create', description: 'Add new rooms' },
                    { name: 'rooms.read', description: 'View room details' },
                    { name: 'rooms.update', description: 'Edit existing rooms' },
                    { name: 'rooms.delete', description: 'Delete rooms' },
                    { name: 'bookings.create', description: 'Create reservations' },
                    { name: 'bookings.read', description: 'View reservations' },
                    { name: 'bookings.update', description: 'Modify reservations' },
                    { name: 'bookings.cancel', description: 'Cancel reservations' },
                    { name: 'customers.create', description: 'Add new guest records' },
                    { name: 'customers.read', description: 'Search and view guest details' },
                    { name: 'customers.update', description: 'Edit guest records' },
                    { name: 'checkins.create', description: 'Perform customer check-in' },
                    { name: 'checkouts.create', description: 'Perform customer check-out' },
                    { name: 'payments.create', description: 'Record payment transactions' },
                    { name: 'payments.read', description: 'View payment receipts and trends' },
                    { name: 'reports.read', description: 'Access revenue and occupancy charts' },
                    { name: 'employees.manage', description: 'Manage employee accounts and override permissions' },
                    { name: 'settings.manage', description: 'Manage site settings' },
                    { name: 'auditlogs.read', description: 'Read system audit logs' },
                ];
                const permissionsMap = {};
                for (const perm of permissionsList) {
                    const p = await tx.permission.create({
                        data: perm,
                    });
                    permissionsMap[perm.name] = p.id;
                }
                // B. Seed Roles
                const adminRole = await tx.role.create({
                    data: {
                        name: 'ADMIN',
                        description: 'System Administrator / Owner with all accesses',
                    },
                });
                const employeeRole = await tx.role.create({
                    data: {
                        name: 'EMPLOYEE',
                        description: 'Standard staff / Receptionist with limited operations',
                    },
                });
                // C. Link Permissions to Roles
                for (const permName of Object.keys(permissionsMap)) {
                    await tx.rolePermission.create({
                        data: {
                            roleId: adminRole.id,
                            permissionId: permissionsMap[permName],
                        },
                    });
                }
                const employeePerms = [
                    'dashboard.view',
                    'rooms.read',
                    'bookings.create',
                    'bookings.read',
                    'bookings.update',
                    'bookings.cancel',
                    'customers.create',
                    'customers.read',
                    'customers.update',
                    'checkins.create',
                    'checkouts.create',
                    'payments.create',
                    'payments.read',
                ];
                for (const permName of employeePerms) {
                    await tx.rolePermission.create({
                        data: {
                            roleId: employeeRole.id,
                            permissionId: permissionsMap[permName],
                        },
                    });
                }
                // D. Create Owner/Admin user
                await tx.user.create({
                    data: {
                        email: adminEmail,
                        passwordHash,
                        fullName: adminFullName,
                        roleId: adminRole.id,
                    },
                });
                // E. Seed Default Rooms
                const initialRooms = [
                    { roomNumber: '101', capacity: 1 },
                    { roomNumber: '102', capacity: 2 },
                    { roomNumber: '103', capacity: 2 },
                    { roomNumber: '201', capacity: 2 },
                    { roomNumber: '202', capacity: 4 },
                ];
                for (const r of initialRooms) {
                    await tx.room.create({
                        data: r,
                    });
                }
            });
            console.log(`Tenant ${cleanTenantName} created and seeded successfully.`);
            res.status(201).json({
                success: true,
                message: 'Tenant setup completed successfully.',
                data: {
                    tenantId: cleanTenantName,
                },
            });
        }
        catch (error) {
            console.error('Failed to register tenant:', error);
            next(new errorHandler_1.AppError(500, `Tenant setup failed: ${error.message}`));
        }
    }
}
exports.AuthController = AuthController;
