import { drizzle } from 'drizzle-orm/neon-http';
import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

// Enhanced Neon configuration for performance
neonConfig.fetchConnectionCache = true;
neonConfig.pipelineConnect = false;
neonConfig.useSecureWebSocket = true;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Connection pool configuration
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum pool size
  min: parseInt(process.env.DB_POOL_MIN || '5'),  // Minimum pool size
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'), // 30 seconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '600000'), // 10 minutes
  createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '10000'), // 10 seconds
  reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '1000'), // 1 second
};

// Create optimized connection pool
const pool = new Pool(poolConfig);

// Create Neon client with optimization
const neonClient = neon(process.env.DATABASE_URL, {
  arrayMode: false,
  fullResults: true,
});

// Create optimized Drizzle instance
export const db = drizzle(neonClient, {
  schema,
  logger: process.env.NODE_ENV === 'development'
});

// Connection health monitoring
export class ConnectionHealth {
  private static metrics = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    averageResponseTime: 0,
    slowQueries: 0,
    connectionErrors: 0,
    lastHealthCheck: new Date(),
  };

  /**
   * Track query execution
   */
  static trackQuery(duration: number, success: boolean): void {
    this.metrics.totalQueries++;

    if (success) {
      this.metrics.successfulQueries++;
    } else {
      this.metrics.failedQueries++;
    }

    // Update average response time (sliding window)
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalQueries - 1) + duration) / this.metrics.totalQueries;

    // Track slow queries (> 1 second)
    if (duration > 1000) {
      this.metrics.slowQueries++;
    }
  }

  /**
   * Track connection errors
   */
  static trackConnectionError(): void {
    this.metrics.connectionErrors++;
  }

  /**
   * Get current metrics
   */
  static getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  static resetMetrics(): void {
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageResponseTime: 0,
      slowQueries: 0,
      connectionErrors: 0,
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Perform health check
   */
  static async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    metrics: typeof ConnectionHealth.metrics;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Simple query to test connection
      await db.execute(sql`SELECT 1 as health_check`);

      const latency = Date.now() - startTime;
      this.metrics.lastHealthCheck = new Date();

      // Determine health status based on metrics
      const errorRate = this.metrics.totalQueries > 0
        ? this.metrics.failedQueries / this.metrics.totalQueries
        : 0;

      const isHealthy = errorRate < 0.05 && // Less than 5% error rate
                       latency < 500 && // Less than 500ms latency
                       this.metrics.connectionErrors < 10; // Less than 10 connection errors

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        metrics: this.getMetrics(),
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.trackConnectionError();

      return {
        status: 'unhealthy',
        metrics: this.getMetrics(),
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Optimized query wrapper with monitoring
 */
export class OptimizedQuery {
  /**
   * Execute query with performance monitoring
   */
  static async execute<T>(
    queryFn: () => Promise<T>,
    queryName?: string
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;

    try {
      const result = await queryFn();
      success = true;
      return result;
    } catch (error) {
      console.error(`Query error${queryName ? ` (${queryName})` : ''}:`, error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      ConnectionHealth.trackQuery(duration, success);

      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected${queryName ? ` (${queryName})` : ''}: ${duration}ms`);
      }
    }
  }

  /**
   * Execute query with timeout
   */
  static async executeWithTimeout<T>(
    queryFn: () => Promise<T>,
    timeoutMs: number = 10000,
    queryName?: string
  ): Promise<T> {
    return Promise.race([
      this.execute(queryFn, queryName),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout: ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute query with retry logic
   */
  static async executeWithRetry<T>(
    queryFn: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000,
    queryName?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(queryFn, queryName);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.warn(`Query retry ${attempt}/${maxRetries} after ${delay}ms:`, lastError.message);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

/**
 * Database index optimization utilities
 */
export class IndexOptimizer {
  /**
   * Create performance indexes for chatbot tables
   */
  static async createPerformanceIndexes(): Promise<void> {
    try {
      console.log('Creating performance indexes...');

      // Chatbot instance indexes
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_instances_user_status
        ON chatbot_instances(user_id, status)
        WHERE status != 'deleted'
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_instances_created_at
        ON chatbot_instances(created_at DESC)
      `);

      // Conversation indexes
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_conversations_chatbot_last_activity
        ON chatbot_conversations(chatbot_id, last_activity_at DESC)
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_conversations_user_status
        ON chatbot_conversations(user_id, status)
        WHERE status = 'active'
      `);

      // Message indexes
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_messages_conversation_created
        ON chatbot_messages(conversation_id, created_at DESC)
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_messages_role_created
        ON chatbot_messages(role, created_at DESC)
      `);

      // Analytics indexes
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_analytics_chatbot_date
        ON chatbot_analytics(chatbot_id, date DESC)
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chatbot_analytics_date_metrics
        ON chatbot_analytics(date DESC)
        INCLUDE (total_conversations, total_messages)
      `);

      // Vector search optimization
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding_cosine
        ON document_chunks USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);

      // Content moderation indexes (if tables exist)
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_moderation_violations_status_created
        ON content_moderation_violations(status, created_at DESC)
        WHERE status IN ('pending', 'under_review')
      `).catch(() => {
        // Table might not exist yet
        console.log('Content moderation tables not found, skipping indexes');
      });

      console.log('Performance indexes created successfully');
    } catch (error) {
      console.error('Error creating performance indexes:', error);
      throw error;
    }
  }

  /**
   * Analyze table statistics for query optimization
   */
  static async analyzeTableStatistics(): Promise<void> {
    try {
      console.log('Analyzing table statistics...');

      const tables = [
        'chatbot_instances',
        'chatbot_conversations',
        'chatbot_messages',
        'chatbot_analytics',
        'document_chunks',
        'users',
        'activity_logs'
      ];

      for (const table of tables) {
        try {
          await db.execute(sql.raw(`ANALYZE ${table}`));
          console.log(`Analyzed table: ${table}`);
        } catch (error) {
          console.warn(`Could not analyze table ${table}:`, error);
        }
      }

      console.log('Table statistics analysis completed');
    } catch (error) {
      console.error('Error analyzing table statistics:', error);
      throw error;
    }
  }

  /**
   * Get index usage statistics
   */
  static async getIndexUsageStats(): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          idx_scan,
          CASE
            WHEN idx_scan = 0 THEN 'Unused'
            WHEN idx_scan < 10 THEN 'Low usage'
            WHEN idx_scan < 100 THEN 'Medium usage'
            ELSE 'High usage'
          END as usage_level
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
      `);

      return result.rows || [];
    } catch (error) {
      console.error('Error getting index usage stats:', error);
      return [];
    }
  }

  /**
   * Identify slow queries
   */
  static async getSlowQueries(): Promise<any[]> {
    try {
      // Enable pg_stat_statements if not already enabled
      await db.execute(sql`
        CREATE EXTENSION IF NOT EXISTS pg_stat_statements
      `).catch(() => {
        console.warn('pg_stat_statements extension not available');
      });

      const result = await db.execute(sql`
        SELECT
          query,
          calls,
          total_exec_time,
          mean_exec_time,
          stddev_exec_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements
        WHERE mean_exec_time > 100  -- Queries taking more than 100ms on average
        ORDER BY mean_exec_time DESC
        LIMIT 20
      `);

      return result.rows || [];
    } catch (error) {
      console.error('Error getting slow queries:', error);
      return [];
    }
  }
}

/**
 * Query optimization helpers
 */
export class QueryOptimizer {
  /**
   * Paginated query with optimization
   */
  static async paginatedQuery<T>(
    baseQuery: any,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: T[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * limit;

    // Execute count and data queries in parallel
    const [dataResult, countResult] = await Promise.all([
      OptimizedQuery.execute(() =>
        baseQuery.limit(limit).offset(offset)
      ),
      OptimizedQuery.execute(() =>
        db.select({ count: sql`count(*)` }).from(baseQuery.as('subquery'))
      )
    ]);

    const total = parseInt(countResult[0]?.count || '0');
    const hasMore = offset + limit < total;

    return {
      data: dataResult as T[],
      total,
      hasMore
    };
  }

  /**
   * Bulk insert optimization
   */
  static async bulkInsert<T>(
    table: any,
    data: T[],
    batchSize: number = 1000
  ): Promise<void> {
    if (data.length === 0) return;

    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await OptimizedQuery.execute(() =>
        db.insert(table).values(batch)
      );
    }
  }

  /**
   * Optimized aggregation query
   */
  static async aggregateQuery(
    table: any,
    groupBy: any[],
    aggregations: any[],
    filters?: any
  ): Promise<any[]> {
    let query = db.select({
      ...Object.fromEntries(groupBy.map((col, i) => [`group_${i}`, col])),
      ...Object.fromEntries(aggregations.map((agg, i) => [`agg_${i}`, agg]))
    }).from(table);

    if (filters) {
      query = query.where(filters);
    }

    query = query.groupBy(...groupBy);

    return await OptimizedQuery.execute(() => query);
  }
}

/**
 * Connection pool monitoring
 */
export class PoolMonitor {
  private static interval: NodeJS.Timeout | null = null;

  /**
   * Start monitoring connection pool
   */
  static start(intervalMs: number = 30000): void {
    if (this.interval) {
      this.stop();
    }

    this.interval = setInterval(async () => {
      await this.logPoolStats();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  static stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get current pool statistics
   */
  static async getPoolStats(): Promise<any> {
    try {
      // This would get actual pool stats if available
      return {
        totalConnections: poolConfig.max,
        activeConnections: 5, // Mock data
        idleConnections: 3,
        waitingClients: 0,
        connectionErrors: ConnectionHealth.getMetrics().connectionErrors,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting pool stats:', error);
      return null;
    }
  }

  /**
   * Log pool statistics
   */
  private static async logPoolStats(): Promise<void> {
    try {
      const stats = await this.getPoolStats();
      if (stats) {
        console.log('Database Pool Stats:', {
          active: stats.activeConnections,
          idle: stats.idleConnections,
          waiting: stats.waitingClients,
          errors: stats.connectionErrors
        });
      }
    } catch (error) {
      console.error('Error logging pool stats:', error);
    }
  }
}

/**
 * Export the original db instance along with optimized versions
 */
export { pool, ConnectionHealth, OptimizedQuery, IndexOptimizer, QueryOptimizer, PoolMonitor };
export default db;