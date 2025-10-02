import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/lib/services/analytics';
import { AuthTokenService } from '@/lib/auth';
import { validatePerformanceMetricsQuery } from '@/lib/validation/analytics';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/analytics/performance
 *
 * Retrieve performance metrics and analysis
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check user permissions (admin or super_admin required)
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const queryData = {
      timeRange: {
        startDate: searchParams.get('start_date') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: searchParams.get('end_date') || new Date().toISOString(),
        timezone: searchParams.get('timezone') || 'UTC'
      },
      metricTypes: searchParams.get('metric_types')?.split(',').filter(Boolean) as Array<
        'response_time' | 'knowledge_search_time' | 'embedding_generation_time' |
        'llm_response_time' | 'total_request_time' | 'error_rate' | 'cache_hit_rate' | 'concurrent_sessions'
      > || undefined,
      aggregation: (searchParams.get('aggregation') as 'avg' | 'min' | 'max' | 'sum' | 'count' | 'percentile') || 'avg',
      percentile: parseInt(searchParams.get('percentile') || '95'),
      granularity: (searchParams.get('granularity') as 'minute' | 'hour' | 'day') || 'hour'
    };

    // Validate query data
    const validatedQuery = validatePerformanceMetricsQuery(queryData);

    // Generate performance metrics
    const performanceResult = await AnalyticsService.generatePerformanceMetrics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(performanceResult, 'Performance metrics retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/v1/analytics/performance:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid query parameters', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve performance metrics', 'PERFORMANCE_METRICS_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/analytics/performance
 *
 * Retrieve performance metrics with complex query body
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check user permissions (admin or super_admin required)
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const rawBody = await request.json();

    // Validate query data
    const validatedQuery = validatePerformanceMetricsQuery(rawBody);

    // Generate performance metrics
    const performanceResult = await AnalyticsService.generatePerformanceMetrics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(performanceResult, 'Performance metrics retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/analytics/performance:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid request body', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve performance metrics', 'PERFORMANCE_METRICS_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function PUT() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}