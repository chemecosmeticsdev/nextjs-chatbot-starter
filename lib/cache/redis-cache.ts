import Redis from 'ioredis';

// Redis client singleton for caching
let cacheClient: Redis | null = null;

function getCacheClient(): Redis {
  if (!cacheClient) {
    cacheClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_CACHE_DB || '1'), // Use different DB from rate limiter
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      keyPrefix: 'cache:',
    });

    cacheClient.on('error', (error) => {
      console.error('Redis cache connection error:', error);
    });

    cacheClient.on('connect', () => {
      console.log('Redis cache connected');
    });
  }
  return cacheClient;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compression?: boolean; // Whether to compress large values
  namespace?: string; // Cache namespace for organization
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  size: number;
  memory: number;
}

export class RedisCache {
  private redis: Redis;
  private defaultTTL: number;
  private namespace: string;
  private stats: CacheStats;

  constructor(options: CacheOptions = {}) {
    this.redis = getCacheClient();
    this.defaultTTL = options.ttl || 300; // 5 minutes default
    this.namespace = options.namespace || 'general';
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0,
      memory: 0
    };
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value);
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const serializedValue = JSON.stringify(value);
      const cacheTTL = ttl || this.defaultTTL;

      await this.redis.setex(fullKey, cacheTTL, serializedValue);
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.del(fullKey);

      if (result > 0) {
        this.stats.deletes++;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key));
      const values = await this.redis.mget(...fullKeys);

      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error('Cache getMany error:', error);
      this.stats.misses += keys.length;
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values in cache
   */
  async setMany(pairs: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();

      pairs.forEach(({ key, value, ttl }) => {
        const fullKey = this.buildKey(key);
        const serializedValue = JSON.stringify(value);
        const cacheTTL = ttl || this.defaultTTL;

        pipeline.setex(fullKey, cacheTTL, serializedValue);
      });

      await pipeline.exec();
      this.stats.sets += pairs.length;
      return true;
    } catch (error) {
      console.error('Cache setMany error:', error);
      return false;
    }
  }

  /**
   * Increment a numeric value in cache
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.incrby(fullKey, amount);
    } catch (error) {
      console.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Set value with expiration timestamp
   */
  async setWithExpiry(key: string, value: any, expiryTimestamp: number): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const serializedValue = JSON.stringify(value);

      await this.redis.set(fullKey, serializedValue, 'EXAT', expiryTimestamp);
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Cache setWithExpiry error:', error);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      console.error('Cache getTTL error:', error);
      return -1;
    }
  }

  /**
   * Clear all cache entries for this namespace
   */
  async clear(): Promise<boolean> {
    try {
      const pattern = this.buildKey('*');
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.stats.deletes += keys.length;
      }

      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const pattern = this.buildKey('*');
      const keys = await this.redis.keys(pattern);

      // Update size
      this.stats.size = keys.length;

      // Get memory usage (approximate)
      const info = await this.redis.memory('usage', pattern.replace('*', 'sample'));
      this.stats.memory = typeof info === 'number' ? info : 0;

      return { ...this.stats };
    } catch (error) {
      console.error('Cache getStats error:', error);
      return { ...this.stats };
    }
  }

  /**
   * Cache wrapper for functions
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cachedValue = await this.get<T>(key);

    if (cachedValue !== null) {
      return cachedValue;
    }

    const result = await fn();
    await this.set(key, result, options.ttl);

    return result;
  }

  /**
   * Build full cache key with namespace
   */
  private buildKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

// Predefined cache instances for different use cases
export const cacheInstances = {
  // Chatbot configurations (frequently accessed)
  chatbots: new RedisCache({
    ttl: 600, // 10 minutes
    namespace: 'chatbots'
  }),

  // Vector search results (medium TTL)
  vectorSearch: new RedisCache({
    ttl: 300, // 5 minutes
    namespace: 'vector_search'
  }),

  // Analytics data (longer TTL)
  analytics: new RedisCache({
    ttl: 1800, // 30 minutes
    namespace: 'analytics'
  }),

  // User sessions (short TTL)
  sessions: new RedisCache({
    ttl: 900, // 15 minutes
    namespace: 'sessions'
  }),

  // Knowledge base data (longer TTL)
  knowledge: new RedisCache({
    ttl: 3600, // 1 hour
    namespace: 'knowledge'
  }),

  // API responses (very short TTL)
  api: new RedisCache({
    ttl: 60, // 1 minute
    namespace: 'api'
  }),

  // System configurations (very long TTL)
  config: new RedisCache({
    ttl: 7200, // 2 hours
    namespace: 'config'
  }),
};

/**
 * Cache key generators for consistent naming
 */
export const cacheKeys = {
  chatbot: (id: string) => `chatbot:${id}`,
  chatbotConfig: (id: string) => `chatbot_config:${id}`,
  chatbotList: (filters: string) => `chatbot_list:${filters}`,
  conversation: (id: string) => `conversation:${id}`,
  conversationMessages: (id: string) => `conversation_messages:${id}`,
  vectorSearch: (query: string, chatbotId: string) => `vector_search:${chatbotId}:${Buffer.from(query).toString('base64')}`,
  analytics: (type: string, timeframe: string, chatbotId?: string) =>
    `analytics:${type}:${timeframe}${chatbotId ? `:${chatbotId}` : ''}`,
  userSession: (userId: string) => `user_session:${userId}`,
  apiResponse: (endpoint: string, params: string) => `api_response:${endpoint}:${params}`,
  knowledgeBase: (chatbotId: string) => `knowledge_base:${chatbotId}`,
  systemConfig: (key: string) => `system_config:${key}`,
};

/**
 * Cache warming utilities
 */
export class CacheWarmer {
  /**
   * Warm up chatbot cache
   */
  static async warmChatbotCache(chatbotIds: string[]): Promise<void> {
    try {
      // This would be implemented with actual chatbot service
      console.log(`Warming cache for ${chatbotIds.length} chatbots`);

      // Example implementation:
      // const chatbots = await ChatbotService.getMultiple(chatbotIds);
      // await cacheInstances.chatbots.setMany(
      //   chatbots.map(bot => ({
      //     key: cacheKeys.chatbot(bot.id),
      //     value: bot,
      //     ttl: 600
      //   }))
      // );
    } catch (error) {
      console.error('Error warming chatbot cache:', error);
    }
  }

  /**
   * Warm up analytics cache
   */
  static async warmAnalyticsCache(): Promise<void> {
    try {
      console.log('Warming analytics cache');

      // This would pre-load common analytics queries
      // const commonTimeframes = ['1d', '7d', '30d'];
      // for (const timeframe of commonTimeframes) {
      //   await analyticsService.getOverview(timeframe);
      // }
    } catch (error) {
      console.error('Error warming analytics cache:', error);
    }
  }
}

/**
 * Cache invalidation utilities
 */
export class CacheInvalidator {
  /**
   * Invalidate chatbot-related caches
   */
  static async invalidateChatbot(chatbotId: string): Promise<void> {
    const cache = cacheInstances.chatbots;

    // Invalidate specific chatbot
    await cache.delete(cacheKeys.chatbot(chatbotId));
    await cache.delete(cacheKeys.chatbotConfig(chatbotId));

    // Invalidate chatbot lists (they might contain this chatbot)
    const pattern = 'chatbot_list:*';
    const keys = await cache.redis.keys(cache['buildKey'](pattern));
    if (keys.length > 0) {
      await cache.redis.del(...keys);
    }
  }

  /**
   * Invalidate analytics caches
   */
  static async invalidateAnalytics(chatbotId?: string): Promise<void> {
    const cache = cacheInstances.analytics;

    if (chatbotId) {
      // Invalidate specific chatbot analytics
      const pattern = `analytics:*:*:${chatbotId}`;
      const keys = await cache.redis.keys(cache['buildKey'](pattern));
      if (keys.length > 0) {
        await cache.redis.del(...keys);
      }
    } else {
      // Invalidate all analytics
      await cache.clear();
    }
  }

  /**
   * Invalidate vector search caches
   */
  static async invalidateVectorSearch(chatbotId: string): Promise<void> {
    const cache = cacheInstances.vectorSearch;
    const pattern = `vector_search:${chatbotId}:*`;
    const keys = await cache.redis.keys(cache['buildKey'](pattern));

    if (keys.length > 0) {
      await cache.redis.del(...keys);
    }
  }
}

/**
 * Cleanup function to close Redis cache connection
 */
export async function closeCacheConnection(): Promise<void> {
  if (cacheClient) {
    await cacheClient.quit();
    cacheClient = null;
  }
}

/**
 * Health check for cache system
 */
export async function cacheHealthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const cache = new RedisCache({ namespace: 'health' });
    const testKey = 'health_check';
    const testValue = { timestamp: Date.now() };

    // Test set and get
    await cache.set(testKey, testValue, 10);
    const result = await cache.get(testKey);
    await cache.delete(testKey);

    const latency = Date.now() - startTime;

    if (result && result.timestamp === testValue.timestamp) {
      return { status: 'healthy', latency };
    } else {
      return { status: 'unhealthy', latency, error: 'Data integrity check failed' };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      status: 'unhealthy',
      latency,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}