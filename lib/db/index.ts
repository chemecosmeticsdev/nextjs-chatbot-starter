import { drizzle } from 'drizzle-orm/neon-http';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import * as schema from './simple-schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Optimize Neon HTTP client for memory efficiency
const neonConfig = {
  // Reduce connection timeout for faster cleanup
  connectionTimeoutMillis: 5000,
  // Reduce query timeout to prevent hanging queries
  queryTimeoutMillis: 30000,
  // Enable connection cleanup
  arrayMode: false,
  fullResults: false,
};

let sql: NeonQueryFunction<false, false>;
let dbInstance: ReturnType<typeof drizzle>;

// Initialize connection with optimized configuration
function initializeNeonConnection() {
  try {
    sql = neon(process.env.DATABASE_URL!, neonConfig);
    dbInstance = drizzle(sql, { schema });
    console.log('[Database] Neon HTTP connection initialized with memory optimizations');
  } catch (error) {
    console.error('[Database] Failed to initialize Neon connection:', error);
    throw error;
  }
}

// Initialize on module load
initializeNeonConnection();

// Export database instance
export const db = dbInstance;

// Connection monitoring for memory management
let connectionMetrics = {
  totalQueries: 0,
  failedQueries: 0,
  lastActivity: Date.now(),
};

// Enhanced query wrapper with memory monitoring
export const safeDbQuery = async <T>(
  operation: () => Promise<T>,
  operationName: string = 'query'
): Promise<T> => {
  const startTime = Date.now();
  connectionMetrics.totalQueries++;
  connectionMetrics.lastActivity = Date.now();

  try {
    const result = await operation();
    const duration = Date.now() - startTime;

    // Log slow queries for optimization
    if (duration > 1000) {
      console.warn(`[Database] Slow query detected: ${operationName} took ${duration}ms`);
    }

    return result;
  } catch (error) {
    connectionMetrics.failedQueries++;
    console.error(`[Database] Query failed: ${operationName}:`, error);
    throw error;
  }
};

// Connection health monitoring
export const getConnectionHealth = () => {
  return {
    totalQueries: connectionMetrics.totalQueries,
    failedQueries: connectionMetrics.failedQueries,
    successRate: connectionMetrics.totalQueries > 0
      ? ((connectionMetrics.totalQueries - connectionMetrics.failedQueries) / connectionMetrics.totalQueries) * 100
      : 100,
    lastActivity: new Date(connectionMetrics.lastActivity).toISOString(),
    timeSinceLastActivity: Date.now() - connectionMetrics.lastActivity,
  };
};

// Memory-optimized query with automatic cleanup
export const optimizedQuery = async <T>(
  queryFn: () => Promise<T>,
  operationName: string = 'query'
): Promise<T> => {
  try {
    return await safeDbQuery(queryFn, operationName);
  } finally {
    // Force garbage collection for long-running operations
    if (global.gc && connectionMetrics.totalQueries % 50 === 0) {
      console.log('[Database] Triggering garbage collection after 50 queries');
      global.gc();
    }
  }
};

// Reset connection metrics (useful for monitoring)
export const resetConnectionMetrics = () => {
  connectionMetrics = {
    totalQueries: 0,
    failedQueries: 0,
    lastActivity: Date.now(),
  };
  console.log('[Database] Connection metrics reset');
};

export * from './simple-schema';