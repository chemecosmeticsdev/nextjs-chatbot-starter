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

    if (result && result.length > 0) {
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          response_time_ms: duration,
          test_query_result: result[0],
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
          response_time_ms: duration
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