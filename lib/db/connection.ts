import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Initialize application setup only at runtime (not during build)
if (typeof window === 'undefined' && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production')) {
  try {
    // Only import setup when actually needed at runtime
    import('../setup').then(module => {
      // Setup is imported but initializeApplication should be called explicitly
      console.log('[Database] Setup module loaded for runtime use');
    }).catch(error => {
      console.warn('[Database] Setup module not available during build:', error.message);
    });
  } catch (error) {
    console.warn('[Database] Setup import skipped during build:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Database connection state
let client: postgres.Sql<{}>;
let dbInstance: ReturnType<typeof drizzle>;

// Connection configuration
const connectionConfig = {
  max: 10, // Maximum number of connections in the pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  ssl: 'require', // Always require SSL for Neon
};

// Initialize connection
function initializeConnection() {
  client = postgres(process.env.DATABASE_URL!, connectionConfig);
  dbInstance = drizzle(client, { schema });
  console.log('[Database] Connection initialized');
}

// Initialize on module load
initializeConnection();

// Export database instance
export const db = dbInstance;

// Type for database instance
export type Database = typeof db;

/**
 * Refresh database connection to see schema changes
 * Useful when schema changes occur and need to be reflected immediately
 */
export const refreshConnection = async () => {
  try {
    console.log('[Database] Refreshing connection...');

    // Close existing connection if it exists
    if (client) {
      await client.end();
    }

    // Create new connection
    initializeConnection();

    // Test the new connection
    await dbInstance.execute('SELECT 1');

    console.log('[Database] Connection refreshed successfully');
    return true;
  } catch (error) {
    console.error('[Database] Failed to refresh connection:', error);
    throw error;
  }
};

/**
 * Get a fresh database connection for critical operations
 * This bypasses any connection caching issues
 */
export const getFreshConnection = () => {
  const freshClient = postgres(process.env.DATABASE_URL!, connectionConfig);
  return drizzle(freshClient, { schema });
};

/**
 * Test database connection health with detailed diagnostics
 */
export const testConnection = async () => {
  try {
    const startTime = Date.now();
    await dbInstance.execute('SELECT 1');
    const responseTime = Date.now() - startTime;

    console.log(`[Database] Health check passed in ${responseTime}ms`);
    return {
      healthy: true,
      message: 'Connection successful',
      responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Database] Health check failed:', errorMessage);

    return {
      healthy: false,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 200)
      } : null
    };
  }
};

/**
 * Enhanced database query wrapper with error monitoring
 */
export const safeQuery = async <T>(operation: () => Promise<T>, operationName: string): Promise<T> => {
  const startTime = Date.now();
  try {
    console.log(`[Database] Starting ${operationName}...`);
    const result = await operation();
    const duration = Date.now() - startTime;
    console.log(`[Database] ${operationName} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Database] ${operationName} failed after ${duration}ms:`, error);

    // Check for specific database errors and provide helpful guidance
    if (error instanceof Error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.error('[Database] Column error detected - attempting connection refresh...');
        try {
          await refreshConnection();
          console.log('[Database] Connection refreshed, retrying operation...');
          return await operation();
        } catch (refreshError) {
          console.error('[Database] Connection refresh failed:', refreshError);
          throw error;
        }
      }

      if (error.message.includes('connection') || error.message.includes('timeout')) {
        console.error('[Database] Connection issue detected');
        throw new Error(`Database connection error: ${error.message}`);
      }

      if (error.message.includes('permission') || error.message.includes('denied')) {
        console.error('[Database] Permission error detected');
        throw new Error(`Database permission error: ${error.message}`);
      }
    }

    throw error;
  }
};

/**
 * Monitor database performance metrics
 */
export const getDatabaseMetrics = async () => {
  try {
    const startTime = Date.now();

    // Test basic connection
    const healthCheck = await testConnection();

    // Query database statistics
    const statsQuery = `
      SELECT
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;

    const stats = await dbInstance.execute(statsQuery);
    const totalTime = Date.now() - startTime;

    return {
      health: healthCheck,
      performance: {
        totalResponseTime: totalTime,
        statsQueryTime: totalTime - (healthCheck.responseTime || 0)
      },
      tableStats: stats.rows,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Database] Failed to get metrics:', error);
    return {
      health: { healthy: false, message: error instanceof Error ? error.message : 'Unknown error' },
      performance: null,
      tableStats: [],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Helper function to close connection (useful for testing)
export const closeConnection = async () => {
  if (client) {
    await client.end();
    console.log('[Database] Connection closed');
  }
};