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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const db_1 = __importStar(require("./config/db"));
const api_1 = __importDefault(require("./routes/api"));
const errorHandler_1 = require("./middleware/errorHandler");
const tenant_1 = require("./middleware/tenant");
// Graceful shutdown handling for Prisma database connections in development / watch mode
const handleShutdown = async (signal) => {
    console.log(`\n[Process] Received ${signal}. Shutting down gracefully...`);
    await (0, db_1.disconnectAllClients)();
    process.exit(0);
};
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Security and utility Middlewares
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: false, // Allows static assets access from localhost frontend
}));
// Dynamic CORS Setup to support Web dashboard and Mobile WebViews
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like native mobile apps, curl, postman)
        if (!origin)
            return callback(null, true);
        // Check if origin is explicitly allowed or belongs to local network/loopback ranges
        const isAllowed = allowedOrigins.includes(origin) ||
            /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
        if (isAllowed) {
            callback(null, true);
        }
        else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)('dev'));
// Serve uploaded documents statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'uploads')));
// Multi-Tenant context router resolver
app.use(tenant_1.tenantMiddleware);
// Main API Route
app.use('/api', api_1.default);
// Root Hello check
app.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'HotelFlow Backend API is healthy.' });
});
// Global Error Handler
app.use(errorHandler_1.errorHandler);
// Start Server
app.listen(PORT, async () => {
    // Parsing the database URL for cleaner log output
    let dbHost = 'Unknown';
    let dbName = 'defaultdb';
    try {
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl) {
            const parsedUrl = new URL(dbUrl);
            dbHost = parsedUrl.hostname;
            dbName = parsedUrl.pathname.replace(/^\//, '') || 'defaultdb';
        }
    }
    catch (e) {
        const match = process.env.DATABASE_URL?.match(/@([^:/]+)(?::\d+)?\/([^?]+)/);
        if (match) {
            dbHost = match[1];
            dbName = match[2];
        }
    }
    // Get network IP address for local mobile app testing
    let networkAddress = '';
    try {
        const interfaces = os_1.default.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const netInterface = interfaces[name];
            if (netInterface) {
                for (const net of netInterface) {
                    if (net.family === 'IPv4' && !net.internal) {
                        networkAddress = `http://${net.address}:${PORT}`;
                        break;
                    }
                }
            }
            if (networkAddress)
                break;
        }
    }
    catch (e) {
        // Ignore OS error
    }
    console.log(`\x1b[36m%s\x1b[0m`, `  __  __   _       _  __ _              `);
    console.log(`\x1b[36m%s\x1b[0m`, ` |  \\/  | | |     | |/ /| |             `);
    console.log(`\x1b[36m%s\x1b[0m`, ` | \\  / | | |__   | ' / | |  ___ __  __ `);
    console.log(`\x1b[36m%s\x1b[0m`, ` | |\\/| | | '_ \\  |  <  | | / _ \\\\ \\/ / `);
    console.log(`\x1b[36m%s\x1b[0m`, ` | |  | | | |_) | | . \\ | || (_) |>  <  `);
    console.log(`\x1b[36m%s\x1b[0m`, ` |_|  |_| |_.__/  |_|\\_\\|_| \\___//_/\\_\\ `);
    console.log(`\x1b[36m%s\x1b[0m`, `  HOTELFLOW - PREMIER HOTEL MANAGEMENT  `);
    console.log(`\x1b[90m%s\x1b[0m`, `────────────────────────────────────────────────`);
    console.log(`\x1b[32m✔\x1b[0m REST API Server started successfully`);
    console.log(`\x1b[34m➜\x1b[0m Local Address:      \x1b[1m\x1b[37mhttp://localhost:${PORT}\x1b[0m`);
    if (networkAddress) {
        console.log(`\x1b[34m➜\x1b[0m Network Address:    \x1b[1m\x1b[37m${networkAddress}\x1b[0m`);
    }
    console.log(`\x1b[34m➜\x1b[0m Environment:        \x1b[33m${process.env.NODE_ENV || 'development'}\x1b[0m`);
    console.log(`\x1b[34m➜\x1b[0m Database Engine:   \x1b[35mPostgreSQL\x1b[0m`);
    console.log(`\x1b[34m➜\x1b[0m Database Host:     \x1b[90m${dbHost}\x1b[0m`);
    console.log(`\x1b[34m➜\x1b[0m Database Name:     \x1b[90m${dbName}\x1b[0m`);
    console.log(`\x1b[90m%s\x1b[0m`, `────────────────────────────────────────────────`);
    console.log(`\x1b[33m⚡ Connecting to Database...\x1b[0m`);
    try {
        await db_1.default.$connect();
        console.log(`\x1b[32m✔ Database connection established successfully.\x1b[0m`);
    }
    catch (error) {
        console.error(`\x1b[31m✘ Failed to connect to the database:\x1b[0m`, error);
    }
    console.log(`\x1b[90m%s\x1b[0m`, `────────────────────────────────────────────────`);
});
exports.default = app;
// Exporting for potential test integration
