import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/lib/services/analytics';
import { AuthTokenService } from '@/lib/auth';
import { validateDashboardMetricsQuery } from '@/lib/validation/analytics';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/analytics/dashboard
 *
 * Retrieve dashboard metrics for real-time monitoring
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
      timeRange: searchParams.get('start_date') && searchParams.get('end_date') ? {
        startDate: searchParams.get('start_date')!,
        endDate: searchParams.get('end_date')!,
        timezone: searchParams.get('timezone') || 'UTC'
      } : undefined,
      realTime: searchParams.get('real_time') === 'true',
      metricsToInclude: searchParams.get('metrics')?.split(',').filter(Boolean) as Array<
        'total_conversations' | 'active_users' | 'average_response_time' |
        'knowledge_base_queries' | 'error_rate' | 'user_satisfaction' |
        'popular_topics' | 'peak_usage_times'
      > || undefined,
      chatbotIds: searchParams.get('chatbot_ids')?.split(',').filter(Boolean) || undefined,
      refreshInterval: parseInt(searchParams.get('refresh_interval') || '30')
    };

    // Validate query data
    const validatedQuery = validateDashboardMetricsQuery(queryData);

    // Generate dashboard metrics
    const dashboardResult = await AnalyticsService.generateDashboardMetrics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(dashboardResult, 'Dashboard metrics retrieved successfully'),
      {
        status: 200,
        headers: {
          'Cache-Control': validatedQuery.realTime ? 'no-cache' : 'public, max-age=300' // 5 minutes cache for non-real-time
        }
      }
    );

  } catch (error) {
    console.error('Error in GET /api/v1/analytics/dashboard:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid query parameters', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve dashboard metrics', 'DASHBOARD_METRICS_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/analytics/dashboard
 *
 * Retrieve dashboard metrics with complex query body
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
    const validatedQuery = validateDashboardMetricsQuery(rawBody);

    // Generate dashboard metrics
    const dashboardResult = await AnalyticsService.generateDashboardMetrics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(dashboardResult, 'Dashboard metrics retrieved successfully'),
      {
        status: 200,
        headers: {
          'Cache-Control': validatedQuery.realTime ? 'no-cache' : 'public, max-age=300' // 5 minutes cache for non-real-time
        }
      }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/analytics/dashboard:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid request body', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve dashboard metrics', 'DASHBOARD_METRICS_ERROR'),
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