import { NextRequest, NextResponse } from 'next/server';
import { performanceMonitor } from '@/lib/services/performance-monitor';
import { z } from 'zod';

// Request schema for filtering metrics
const performanceQuerySchema = z.object({
  timeWindow: z.string().optional().default('3600000'), // 1 hour default
  type: z.string().optional(),
  source: z.string().optional(),
  includeDetails: z.string().optional().transform(val => val === 'true')
});

/**
 * GET /api/v1/monitoring/performance
 * Get real-time performance metrics and analytics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      timeWindow: searchParams.get('timeWindow') || '3600000',
      type: searchParams.get('type') || undefined,
      source: searchParams.get('source') || undefined,
      includeDetails: searchParams.get('includeDetails') || 'false'
    };

    const validatedParams = performanceQuerySchema.parse(queryParams);
    const timeWindow = parseInt(validatedParams.timeWindow);

    // Get real-time metrics dashboard
    const realtimeMetrics = await performanceMonitor.getRealtimeMetrics();

    // Get performance analytics for the specified time window
    const analytics = performanceMonitor.getAnalytics(timeWindow);

    // Get system health status
    const systemHealth = await performanceMonitor.checkSystemHealth();

    // Get active operations
    const activeOperations = performanceMonitor.getActiveOperations();

    const response = {
      success: true,
      data: {
        realtime: realtimeMetrics,
        analytics: analytics.summary,
        systemHealth: {
          overall: systemHealth.overall,
          services: systemHealth.services.map(service => ({
            name: service.service,
            status: service.status,
            latency: service.latencyMs,
            lastCheck: service.lastCheck
          }))
        },
        activeOperations: activeOperations.length,
        timeWindow: {
          duration: timeWindow,
          durationLabel: timeWindow === 3600000 ? '1 hour' : `${Math.round(timeWindow / 60000)} minutes`
        }
      },
      timestamp: new Date().toISOString()
    };

    // Include detailed metrics if requested
    if (validatedParams.includeDetails) {
      response.data.details = {
        operations: analytics.operations.slice(-50), // Last 50 operations
        bulkOperations: analytics.bulkOperations,
        activeOperationDetails: activeOperations
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Monitoring] Performance API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/monitoring/performance/alerts
 * Get active alerts and performance issues
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { level, resolved } = body;

    // Get alerts based on filters
    const alerts = performanceMonitor.getActiveAlerts(level);

    // Filter by resolved status if specified
    const filteredAlerts = resolved !== undefined
      ? alerts.filter(alert => alert.resolved === resolved)
      : alerts;

    return NextResponse.json({
      success: true,
      data: {
        alerts: filteredAlerts,
        summary: {
          total: filteredAlerts.length,
          critical: filteredAlerts.filter(a => a.level === 'critical').length,
          error: filteredAlerts.filter(a => a.level === 'error').length,
          warning: filteredAlerts.filter(a => a.level === 'warning').length,
          info: filteredAlerts.filter(a => a.level === 'info').length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Monitoring] Alerts API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}