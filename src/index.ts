import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import os from 'os';
import prisma, { disconnectAllClients, initializeTenantSchemas } from './config/db';
import apiRouter from './routes/api';
import { errorHandler } from './middleware/errorHandler';
import { tenantMiddleware } from './middleware/tenant';

// Graceful shutdown handling for Prisma database connections in development / watch mode
const handleShutdown = async (signal: string) => {
  console.log(`\n[Process] Received ${signal}. Shutting down gracefully...`);
  await disconnectAllClients();
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

const app = express();
const PORT = process.env.PORT || 5000;

// Security and utility Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows static assets access from localhost frontend
}));
// Dynamic CORS Setup to support Web dashboard and Mobile WebViews
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like native mobile apps, curl, postman)
    if (!origin) return callback(null, true);

    // Check if origin is explicitly allowed or belongs to local network/loopback ranges
    const isAllowed = allowedOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve uploaded documents statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Multi-Tenant context router resolver
app.use(tenantMiddleware);

// Main API Route
app.use('/api', apiRouter);

// Root Hello check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, status: 'HotelFlow Backend API is healthy.' });
});

// Global Error Handler
app.use(errorHandler);

// Start Server
async function start() {
  try {
    console.log("Connecting to database...");
    await prisma.$connect();

    console.log("Database connected");
    await initializeTenantSchemas();

    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();

export default app;
// Exporting for potential test integration
