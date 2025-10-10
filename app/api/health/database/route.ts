import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

/**
 * Database health check endpoint
 * Tests database connectivity and basic query execution
 */
export async function GET(request: NextRequest) {
  try {
    const start = Date.now();

    // Test basic database connectivity
    const result = await db.execute(sql`SELECT 1 as test, current_timestamp as timestamp`);

    const duration = Date.now() - start;

    // Handle different result structures from Drizzle ORM
    // When fullResults: false, result might be an array directly
    // or have a .rows property
    const rows = Array.isArray(result) ? result : (result as any)?.rows || [];

    if (rows && rows.length > 0) {
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          response_time_ms: duration,
          test_query_result: rows[0],
          connection_info: {
            url_configured: !!process.env.DATABASE_URL,
            // Don't expose actual URL in health check
          }
        }
      });
    } else {
      return NextResponse.json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          error: 'Query returned no results',
          response_time_ms: duration,
          debug_info: {
            result_type: typeof result,
            result_is_array: Array.isArray(result),
            result_keys: result ? Object.keys(result) : []
          }
        }
      }, { status: 503 });
    }

  } catch (error) {
    console.error('Database health check failed:', error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown database error',
        connection_info: {
          url_configured: !!process.env.DATABASE_URL,
          error_type: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      }
    }, { status: 503 });
  }
}