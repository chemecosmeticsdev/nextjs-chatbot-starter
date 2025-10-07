import { Redis } from '@upstash/redis';

/**
 * Centralized caching service using Upstash Redis
 * Provides high-performance caching with graceful degradation
 */
export class CacheService {
  private redis: Redis | null = null;
  private defaultTTL = 300; // 5 minutes
  private isHealthy = false;
  private lastHealthCheck = 0;
  private healthCheckInterval = 30000; // 30 seconds
  private isConfigured = false;

  constructor() {
    // Check if Redis credentials are configured
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    const redisToken = process.env.UPSTASH_REDIS_TOKEN;

    if (redisUrl && redisToken) {
      try {
        this.redis = new Redis({
          url: redisUrl,
          token: redisToken,
          // Optimize for serverless
          automaticDeserialization: false,
          retry: {
            retries: 3,
            retryDelay: (attempt) => Math.min(attempt * 50, 500)
          }
        });
        this.isConfigured = true;
        this.isHealthy = true;
        console.log('[CacheService] Upstash Redis configured successfully');
      } catch (error) {
        console.warn('[CacheService] Failed to initialize Redis:', error);
        this.isConfigured = false;
        this.isHealthy = false;
      }
    } else {
      console.warn('[CacheService] Upstash Redis credentials not configured - cache will be disabled');
      this.isConfigured = false;
      this.isHealthy = false;
    }
  }

  /**
   * Get value from cache with automatic JSON parsing
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConfigured || !this.redis) {
        return null; // Graceful degradation
      }

      await this.checkHealth();

      if (!this.isHealthy) {
        console.warn(`Cache unavailable, skipping get for key: ${key}`);
        return null;
      }

      const cached = await this.redis.get(key);

      if (cached === null || cached === undefined) {
        return null;
      }

      // Handle both string and already parsed JSON
      if (typeof cached === 'string') {
        try {
          return JSON.parse(cached) as T;
        } catch {
          // If it's not JSON, return as is
          return cached as T;
        }
      }

      return cached as T;
    } catch (error) {
      console.error('Cache get error:', error);
      this.markUnhealthy();
      return null; // Graceful degradation
    }
  }

  /**
   * Set value in cache with automatic JSON serialization
   */
  async set<T>(
    key: string,
    value: T,
    expirationSeconds?: number
  ): Promise<void> {
    try {
      if (!this.isConfigured || !this.redis) {
        return; // Graceful degradation
      }

      await this.checkHealth();

      if (!this.isHealthy) {
        console.warn(`Cache unavailable, skipping set for key: ${key}`);
        return;
      }

      const ttl = expirationSeconds || this.defaultTTL;
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

      await this.redis.setex(key, ttl, serializedValue);
    } catch (error) {
      console.error('Cache set error:', error);
      this.markUnhealthy();
      // Don't throw - cache failures shouldn't break functionality
    }
  }

  /**
   * Delete specific cache key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.checkHealth();

      if (!this.isHealthy) {
        console.warn(`Cache unavailable, skipping delete for key: ${key}`);
        return;
      }

      await this.redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
      this.markUnhealthy();
    }
  }

  /**
   * Invalidate cache keys matching a pattern
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      await this.checkHealth();

      if (!this.isHealthy) {
        console.warn(`Cache unavailable, skipping invalidation for pattern: ${pattern}`);
        return;
      }

      // Use SCAN for safe pattern matching
      let cursor = 0;
      const keysToDelete: string[] = [];

      do {
        const result = await this.redis.scan(cursor, {
          match: pattern,
          count: 100
        });

        cursor = result[0];
        keysToDelete.push(...result[1]);
      } while (cursor !== 0);

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
      this.markUnhealthy();
    }
  }

  /**
   * Get value from cache or fetch from source function
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    try {
      const value = await fetchFunction();

      // Cache the result asynchronously (don't wait)
      this.set(key, value, ttl).catch(error => {
        console.error('Background cache set failed:', error);
      });

      return value;
    } catch (error) {
      console.error('Fetch function failed:', error);
      throw error;
    }
  }

  /**
   * Increment a counter in cache
   */
  async increment(key: string, by: number = 1, ttl?: number): Promise<number> {
    try {
      await this.checkHealth();

      if (!this.isHealthy) {
        console.warn(`Cache unavailable, skipping increment for key: ${key}`);
        return by; // Return the increment value as fallback
      }

      const result = await this.redis.incrby(key, by);

      // Set TTL if specified and this is a new key
      if (ttl && result === by) {
        await this.redis.expire(key, ttl);
      }

      return result;
    } catch (error) {
      console.error('Cache increment error:', error);
      this.markUnhealthy();
      return by; // Fallback value
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      await this.checkHealth();

      if (!this.isHealthy || keys.length === 0) {
        return keys.map(() => null);
      }

      const values = await this.redis.mget(...keys);

      return values.map(value => {
        if (value === null || value === undefined) {
          return null;
        }

        if (typeof value === 'string') {
          try {
            return JSON.parse(value) as T;
          } catch {
            return value as T;
          }
        }

        return value as T;
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      this.markUnhealthy();
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs at once
   */
  async mset<T>(pairs: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      await this.checkHealth();

      if (!this.isHealthy || pairs.length === 0) {
        return;
      }

      // Prepare data for mset
      const msetData: string[] = [];
      const expirations: Array<{ key: string; ttl: number }> = [];

      for (const pair of pairs) {
        msetData.push(pair.key);
        msetData.push(typeof pair.value === 'string' ? pair.value : JSON.stringify(pair.value));

        if (pair.ttl) {
          expirations.push({ key: pair.key, ttl: pair.ttl });
        }
      }

      // Set all values
      await this.redis.mset(...msetData);

      // Set TTLs for keys that need them
      const expirePromises = expirations.map(({ key, ttl }) =>
        this.redis.expire(key, ttl)
      );

      if (expirePromises.length > 0) {
        await Promise.all(expirePromises);
      }
    } catch (error) {
      console.error('Cache mset error:', error);
      this.markUnhealthy();
    }
  }

  /**
   * Check if cache is healthy
   */
  private async checkHealth(): Promise<void> {
    if (!this.isConfigured || !this.redis) {
      this.isHealthy = false;
      return;
    }

    const now = Date.now();

    // Skip health check if recently performed
    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    try {
      // Simple ping test
      await this.redis.ping();
      this.isHealthy = true;
      this.lastHealthCheck = now;
    } catch (error) {
      console.error('Cache health check failed:', error);
      this.markUnhealthy();
    }
  }

  /**
   * Mark cache as unhealthy
   */
  private markUnhealthy(): void {
    this.isHealthy = false;
    // Reset health check timer to retry sooner
    this.lastHealthCheck = 0;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    healthy: boolean;
    configured: boolean;
    lastHealthCheck: Date;
    info?: any;
  }> {
    try {
      const info = this.isHealthy && this.redis ? await this.redis.info() : null;

      return {
        healthy: this.isHealthy,
        configured: this.isConfigured,
        lastHealthCheck: new Date(this.lastHealthCheck),
        info: info || (this.isConfigured ? null : { message: 'Redis credentials not configured' })
      };
    } catch (error) {
      return {
        healthy: false,
        configured: this.isConfigured,
        lastHealthCheck: new Date(this.lastHealthCheck),
        info: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clear(): Promise<void> {
    try {
      await this.checkHealth();

      if (!this.isHealthy) {
        console.warn('Cache unavailable, skipping clear operation');
        return;
      }

      await this.redis.flushall();
    } catch (error) {
      console.error('Cache clear error:', error);
      this.markUnhealthy();
    }
  }
}

// Export singleton instance
export const cache = new CacheService();

// Cache key builders for consistency
export const CacheKeys = {
  // User-related caches
  user: (userId: string) => `user:${userId}`,
  userPermissions: (userId: string) => `user:permissions:${userId}`,
  userSession: (sessionId: string) => `session:${sessionId}`,

  // Chatbot-related caches
  chatbot: (chatbotId: string) => `chatbot:${chatbotId}`,
  chatbotConfig: (chatbotId: string) => `chatbot:config:${chatbotId}`,
  chatbotStats: (chatbotId: string) => `chatbot:stats:${chatbotId}`,

  // Analytics caches
  analytics: (key: string) => `analytics:${key}`,
  dashboardMetrics: (chatbotId: string, timeRange: string) =>
    `dashboard:metrics:${chatbotId}:${timeRange}`,
  realtimeMetrics: (chatbotId: string) => `realtime:${chatbotId}`,

  // Knowledge base caches
  knowledgeBase: (query: string) => `kb:${Buffer.from(query).toString('base64')}`,
  documentStats: (documentId: string) => `doc:stats:${documentId}`,

  // API response caches
  apiResponse: (endpoint: string, params: string) => `api:${endpoint}:${params}`,

  // Search caches
  searchResults: (queryHash: string) => `search:${queryHash}`,
  popularQueries: () => 'search:popular',

  // System caches
  systemHealth: () => 'system:health',
  activeConnections: () => 'system:connections'
} as const;

export type CacheKeyBuilder = typeof CacheKeys;