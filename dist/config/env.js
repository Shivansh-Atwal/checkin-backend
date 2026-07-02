"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(5000),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: zod_1.z.string().url({ message: 'DATABASE_URL must be a valid PostgreSQL connection URL' }),
    JWT_ACCESS_SECRET: zod_1.z.string().min(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters long' }),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters long' }),
    JWT_ACCESS_EXPIRY: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRY: zod_1.z.string().default('7d'),
    ALLOWED_ORIGINS: zod_1.z.string().transform((val) => val.split(',')),
    REDIS_HOST: zod_1.z.string().optional(),
    REDIS_PORT: zod_1.z.coerce.number().default(6379),
    REDIS_USERNAME: zod_1.z.string().default('default'),
    REDIS_PASSWORD: zod_1.z.string().optional(),
    REDIS_DB_NUMBER: zod_1.z.coerce.number().default(0),
    DEVELOPER_PASSWORD: zod_1.z.string().min(6, { message: 'DEVELOPER_PASSWORD must be at least 6 characters long' }),
});
const result = envSchema.safeParse(process.env);
if (!result.success) {
    console.error('❌ Invalid environment variables during startup validation:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
}
exports.ENV = result.data;
