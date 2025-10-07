/**
 * API endpoint for refreshing database connection
 * POST /api/v1/admin/refresh-db - Refresh database connection to see schema changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshConnection, testConnection } from '@/lib/db/connection';

/**
 * POST /api/v1/admin/refresh-db
 * Refresh database connection to see schema changes
 */
export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now();

    // Test current connection
    const healthBefore = await testConnection();

    // Refresh the connection
    await refreshConnection();

    // Test new connection
    const healthAfter = await testConnection();

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        message: 'Database connection refreshed successfully',
        healthBefore,
        healthAfter,
        processingTime
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Database refresh API error:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to refresh database connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/v1/admin/refresh-db
 * Test current database connection health
 */
export async function GET(request: NextRequest) {
  try {
    const health = await testConnection();

    return NextResponse.json({
      success: true,
      data: {
        connection: health,
        timestamp: new Date().toISOString()
      }
    }, { status: health.healthy ? 200 : 503 });

  } catch (error) {
    console.error('Database health check API error:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to check database connection health',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}