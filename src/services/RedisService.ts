import Redis from 'ioredis';
import { tenantStorage } from '../config/db';

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_USERNAME = process.env.REDIS_USERNAME || 'default';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = Number(process.env.REDIS_DB_NUMBER || 0);

let redis: Redis | null = null;

if (REDIS_HOST) {
  try {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
      db: REDIS_DB,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('Redis reconnection limit reached. Caching is disabled.');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 1000);
      },
    });

    redis.on('error', (err) => {
      console.warn('Redis Client Error:', err.message);
    });

    redis.on('connect', () => {
      console.log('✔ Redis connection established successfully.');
    });

    redis.connect().catch((err) => {
      console.warn('Redis initial connection failed:', err.message);
    });
  } catch (err: any) {
    console.error('Failed to initialize Redis client:', err.message);
  }
} else {
  console.log('Redis is not configured in .env. Caching is disabled.');
}

export class RedisService {
  private static getScopedKey(key: string): string {
    const store = tenantStorage.getStore();
    const tenantId = store?.tenantId || 'public';
    return `${tenantId}:${key}`;
  }

  static async get(key: string): Promise<string | null> {
    if (!redis) return null;
    const scopedKey = this.getScopedKey(key);
    try {
      return await redis.get(scopedKey);
    } catch (err: any) {
      console.warn(`Redis get failed for key "${scopedKey}":`, err.message);
      return null;
    }
  }

  static async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!redis) return;
    const scopedKey = this.getScopedKey(key);
    try {
      if (ttlSeconds) {
        await redis.set(scopedKey, value, 'EX', ttlSeconds);
      } else {
        await redis.set(scopedKey, value);
      }
    } catch (err: any) {
      console.warn(`Redis set failed for key "${scopedKey}":`, err.message);
    }
  }

  static async del(key: string): Promise<void> {
    if (!redis) return;
    const scopedKey = this.getScopedKey(key);
    try {
      await redis.del(scopedKey);
    } catch (err: any) {
      console.warn(`Redis del failed for key "${scopedKey}":`, err.message);
    }
  }

  static async flush(): Promise<void> {
    if (!redis) return;
    try {
      await redis.flushdb();
    } catch (err: any) {
      console.warn('Redis flushdb failed:', err.message);
    }
  }

  static async invalidateDashboardStats(): Promise<void> {
    await this.del('dashboard-stats');
  }
}
