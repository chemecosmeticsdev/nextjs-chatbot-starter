import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RedisCache, cacheInstances } from '@/lib/cache/redis-cache';

// Mock Redis client
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  flushall: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  isReady: true,
  isOpen: true
};

// Mock Redis module
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

describe('RedisCache', () => {
  let cache: RedisCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new RedisCache({
      namespace: 'test',
      ttl: 300,
      maxRetries: 3
    });
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('Basic Operations', () => {
    it('should get value from cache', async () => {
      const testValue = { data: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testValue));

      const result = await cache.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
      expect(result).toEqual(testValue);
    });

    it('should return null for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cache.get('non-existent');

      expect(result).toBeNull();
    });

    it('should set value in cache with TTL', async () => {
      const testValue = { data: 'test' };
      mockRedisClient.set.mockResolvedValue('OK');

      await cache.set('test-key', testValue, 600);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:test-key',
        JSON.stringify(testValue),
        { EX: 600 }
      );
    });

    it('should use default TTL when not specified', async () => {
      const testValue = { data: 'test' };
      mockRedisClient.set.mockResolvedValue('OK');

      await cache.set('test-key', testValue);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:test-key',
        JSON.stringify(testValue),
        { EX: 300 }
      );
    });

    it('should delete value from cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await cache.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent key', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await cache.del('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('Advanced Operations', () => {
    it('should check if key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cache.exists('test-key');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe(true);
    });

    it('should clear all keys with namespace', async () => {
      mockRedisClient.keys.mockResolvedValue(['test:key1', 'test:key2']);
      mockRedisClient.del.mockResolvedValue(2);

      const result = await cache.clear();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['test:key1', 'test:key2']);
      expect(result).toBe(2);
    });

    it('should get TTL for key', async () => {
      mockRedisClient.ttl.mockResolvedValue(150);

      const result = await cache.getTTL('test-key');

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe(150);
    });

    it('should update TTL for key', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await cache.updateTTL('test-key', 600);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('test:test-key', 600);
      expect(result).toBe(true);
    });
  });

  describe('Wrapper Function', () => {
    it('should execute function and cache result', async () => {
      const testValue = { data: 'test' };
      const testFunction = jest.fn().mockResolvedValue(testValue);
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await cache.wrap('test-key', testFunction);

      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
      expect(testFunction).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:test-key',
        JSON.stringify(testValue),
        { EX: 300 }
      );
      expect(result).toEqual(testValue);
    });

    it('should return cached value without executing function', async () => {
      const cachedValue = { data: 'cached' };
      const testFunction = jest.fn();
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedValue));

      const result = await cache.wrap('test-key', testFunction);

      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
      expect(testFunction).not.toHaveBeenCalled();
      expect(result).toEqual(cachedValue);
    });

    it('should handle function errors gracefully', async () => {
      const error = new Error('Function failed');
      const testFunction = jest.fn().mockRejectedValue(error);
      mockRedisClient.get.mockResolvedValue(null);

      await expect(cache.wrap('test-key', testFunction)).rejects.toThrow('Function failed');
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Connection failed'));

      const result = await cache.get('test-key');

      expect(result).toBeNull();
    });

    it('should handle JSON parsing errors', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json');

      const result = await cache.get('test-key');

      expect(result).toBeNull();
    });

    it('should retry operations on temporary failures', async () => {
      mockRedisClient.get
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue(JSON.stringify({ data: 'test' }));

      const result = await cache.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ data: 'test' });
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when Redis is connected', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const health = await cache.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.connected).toBe(true);
      expect(health.lastPing).toBeDefined();
    });

    it('should return unhealthy status when Redis is disconnected', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection failed'));

      const health = await cache.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.connected).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should track cache statistics', async () => {
      // Simulate cache hits and misses
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify({ data: 'cached' }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ data: 'cached2' }));

      await cache.get('key1'); // hit
      await cache.get('key2'); // miss
      await cache.get('key3'); // hit

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.67, 2);
    });

    it('should reset statistics', async () => {
      await cache.get('test-key');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.operations).toBe(0);
    });
  });
});

describe('Cache Instances', () => {
  it('should have predefined cache instances', () => {
    expect(cacheInstances.chatbots).toBeInstanceOf(RedisCache);
    expect(cacheInstances.vectorSearch).toBeInstanceOf(RedisCache);
    expect(cacheInstances.analytics).toBeInstanceOf(RedisCache);
    expect(cacheInstances.sessions).toBeInstanceOf(RedisCache);
    expect(cacheInstances.general).toBeInstanceOf(RedisCache);
  });

  it('should have different namespaces for each instance', () => {
    expect(cacheInstances.chatbots['namespace']).toBe('chatbots');
    expect(cacheInstances.vectorSearch['namespace']).toBe('vector_search');
    expect(cacheInstances.analytics['namespace']).toBe('analytics');
    expect(cacheInstances.sessions['namespace']).toBe('sessions');
    expect(cacheInstances.general['namespace']).toBe('general');
  });

  it('should have appropriate TTL settings for each instance', () => {
    expect(cacheInstances.chatbots['defaultTTL']).toBe(600); // 10 minutes
    expect(cacheInstances.vectorSearch['defaultTTL']).toBe(300); // 5 minutes
    expect(cacheInstances.analytics['defaultTTL']).toBe(1800); // 30 minutes
    expect(cacheInstances.sessions['defaultTTL']).toBe(3600); // 1 hour
    expect(cacheInstances.general['defaultTTL']).toBe(900); // 15 minutes
  });
});

describe('Cache Performance', () => {
  it('should handle high volume operations efficiently', async () => {
    const promises = [];

    for (let i = 0; i < 100; i++) {
      promises.push(cache.set(`key-${i}`, { data: `value-${i}` }));
    }

    const startTime = Date.now();
    await Promise.all(promises);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should handle concurrent read/write operations', async () => {
    const writePromises = [];
    const readPromises = [];

    // Concurrent writes
    for (let i = 0; i < 50; i++) {
      writePromises.push(cache.set(`write-key-${i}`, { data: `write-value-${i}` }));
    }

    // Concurrent reads
    for (let i = 0; i < 50; i++) {
      readPromises.push(cache.get(`read-key-${i}`));
    }

    await expect(Promise.all([...writePromises, ...readPromises])).resolves.toBeDefined();
  });
});