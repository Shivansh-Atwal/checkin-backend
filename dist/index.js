"use strict";
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
const db_1 = __importDefault(require("./config/db"));
const api_1 = __importDefault(require("./routes/api"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Security and utility Middlewares
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: false, // Allows static assets access from localhost frontend
}));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)('dev'));
// Serve uploaded documents statically
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'uploads')));
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
