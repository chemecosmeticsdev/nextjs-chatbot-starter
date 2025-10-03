import Redis from 'ioredis';

// Redis client singleton
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (error) => {
      console.error('Redis connection error:', error);
    });
  }
  return redisClient;
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (identifier: string) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.redis = getRedisClient();
    this.config = config;
  }

  /**
   * Check if request is within rate limit
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    try {
      const key = this.config.keyGenerator
        ? this.config.keyGenerator(identifier)
        : `rate_limit:${identifier}`;

      const currentTime = Date.now();
      const windowStart = currentTime - this.config.windowMs;

      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Remove expired entries
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current requests in window
      pipeline.zcard(key);

      // Add current request
      pipeline.zadd(key, currentTime, `${currentTime}-${Math.random()}`);

      // Set expiry for the key
      pipeline.expire(key, Math.ceil(this.config.windowMs / 1000));

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }

      const currentCount = (results[1][1] as number) || 0;
      const resetTime = currentTime + this.config.windowMs;
      const remaining = Math.max(0, this.config.maxRequests - currentCount - 1);

      const result: RateLimitResult = {
        allowed: currentCount < this.config.maxRequests,
        limit: this.config.maxRequests,
        remaining,
        resetTime,
      };

      if (!result.allowed) {
        result.retryAfter = Math.ceil(this.config.windowMs / 1000);

        // Remove the request we just added since it's not allowed
        await this.redis.zpopmax(key);
      }

      return result;
    } catch (error) {
      console.error('Rate limiter error:', error);

      // Fail open - allow request if Redis is unavailable
      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests - 1,
        resetTime: Date.now() + this.config.windowMs,
      };
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async resetLimit(identifier: string): Promise<void> {
    try {
      const key = this.config.keyGenerator
        ? this.config.keyGenerator(identifier)
        : `rate_limit:${identifier}`;

      await this.redis.del(key);
    } catch (error) {
      console.error('Rate limiter reset error:', error);
    }
  }

  /**
   * Get current usage for identifier
   */
  async getUsage(identifier: string): Promise<Omit<RateLimitResult, 'allowed'>> {
    try {
      const key = this.config.keyGenerator
        ? this.config.keyGenerator(identifier)
        : `rate_limit:${identifier}`;

      const currentTime = Date.now();
      const windowStart = currentTime - this.config.windowMs;

      // Remove expired entries and count current
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const currentCount = await this.redis.zcard(key);

      const resetTime = currentTime + this.config.windowMs;
      const remaining = Math.max(0, this.config.maxRequests - currentCount);

      return {
        limit: this.config.maxRequests,
        remaining,
        resetTime,
      };
    } catch (error) {
      console.error('Rate limiter usage check error:', error);

      return {
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetTime: Date.now() + this.config.windowMs,
      };
    }
  }
}

// Predefined rate limiters for different use cases
export const rateLimiters = {
  // Authentication endpoints (stricter limits)
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyGenerator: (identifier) => `auth:${identifier}`,
  }),

  // General API endpoints
  api: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyGenerator: (identifier) => `api:${identifier}`,
  }),

  // Public endpoints (for widgets, etc.)
  public: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    keyGenerator: (identifier) => `public:${identifier}`,
  }),

  // Upload endpoints (very strict)
  upload: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    keyGenerator: (identifier) => `upload:${identifier}`,
  }),

  // WebSocket connections
  websocket: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: (identifier) => `ws:${identifier}`,
  }),
};

/**
 * Get client identifier from request (IP + User ID if available)
 */
export function getClientIdentifier(
  request: Request,
  userId?: string
): string {
  // Get IP address from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip = forwarded?.split(',')[0] || realIp || cfConnectingIp || 'unknown';

  // Combine IP with user ID if available for more granular limiting
  return userId ? `${ip}:${userId}` : ip;
}

/**
 * Cleanup function to close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}