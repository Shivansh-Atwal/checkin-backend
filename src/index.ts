import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import os from 'os';
import prisma from './config/db';
import apiRouter from './routes/api';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 5000;

// Security and utility Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows static assets access from localhost frontend
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve uploaded documents statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Main API Route
app.use('/api', apiRouter);

// Root Hello check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, status: 'HotelFlow Backend API is healthy.' });
});

// Global Error Handler
app.use(errorHandler);

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
  } catch (e) {
    const match = process.env.DATABASE_URL?.match(/@([^:/]+)(?::\d+)?\/([^?]+)/);
    if (match) {
      dbHost = match[1];
      dbName = match[2];
    }
  }

  // Get network IP address for local mobile app testing
  let networkAddress = '';
  try {
    const interfaces = os.networkInterfaces();
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
      if (networkAddress) break;
    }
  } catch (e) {
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
    await prisma.$connect();
    console.log(`\x1b[32m✔ Database connection established successfully.\x1b[0m`);
  } catch (error) {
    console.error(`\x1b[31m✘ Failed to connect to the database:\x1b[0m`, error);
  }
  console.log(`\x1b[90m%s\x1b[0m`, `────────────────────────────────────────────────`);
});

export default app;
// Exporting for potential test integration
