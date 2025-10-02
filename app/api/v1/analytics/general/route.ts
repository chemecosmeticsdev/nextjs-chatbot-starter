import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/lib/services/analytics';
import { AuthTokenService } from '@/lib/auth';
import { validateAnalyticsQuery } from '@/lib/validation/analytics';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/analytics/general
 *
 * Retrieve general analytics data based on query parameters
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
      filters: {
        chatbotIds: searchParams.get('chatbot_ids')?.split(',').filter(Boolean) || undefined,
        userIds: searchParams.get('user_ids')?.split(',').filter(Boolean) || undefined,
        sessionIds: searchParams.get('session_ids')?.split(',').filter(Boolean) || undefined,
        messageTypes: searchParams.get('message_types')?.split(',').filter(Boolean) as ('user' | 'assistant')[] || undefined,
        responseCategories: searchParams.get('response_categories')?.split(',').filter(Boolean) || undefined,
        knowledgeBaseUsed: searchParams.get('knowledge_base_used') === 'true' ? true : searchParams.get('knowledge_base_used') === 'false' ? false : undefined,
        errorOccurred: searchParams.get('error_occurred') === 'true' ? true : searchParams.get('error_occurred') === 'false' ? false : undefined
      },
      granularity: (searchParams.get('granularity') as 'hour' | 'day' | 'week' | 'month') || 'day',
      includeBreakdown: searchParams.get('include_breakdown') === 'true'
    };

    // Remove undefined values from filters
    Object.keys(queryData.filters).forEach(key => {
      if (queryData.filters[key as keyof typeof queryData.filters] === undefined) {
        delete queryData.filters[key as keyof typeof queryData.filters];
      }
    });

    // Validate query data
    const validatedQuery = validateAnalyticsQuery(queryData);

    // Generate analytics
    const analyticsResult = await AnalyticsService.generateAnalytics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(analyticsResult, 'Analytics data retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/v1/analytics/general:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid query parameters', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve analytics data', 'ANALYTICS_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/analytics/general
 *
 * Retrieve general analytics data with complex query body
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
    const validatedQuery = validateAnalyticsQuery(rawBody);

    // Generate analytics
    const analyticsResult = await AnalyticsService.generateAnalytics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(analyticsResult, 'Analytics data retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/analytics/general:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid request body', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve analytics data', 'ANALYTICS_ERROR'),
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