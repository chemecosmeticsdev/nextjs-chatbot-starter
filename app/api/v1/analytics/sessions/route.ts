import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/lib/services/analytics';
import { AuthTokenService } from '@/lib/auth';
import { validateSessionAnalyticsQuery } from '@/lib/validation/analytics';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/analytics/sessions
 *
 * Retrieve session analytics data
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
      pagination: {
        page: parseInt(searchParams.get('page') || '1'),
        limit: parseInt(searchParams.get('limit') || '20'),
        sortBy: searchParams.get('sort_by') || undefined,
        sortOrder: (searchParams.get('sort_order') as 'asc' | 'desc') || 'desc'
      },
      filters: {
        chatbotIds: searchParams.get('chatbot_ids')?.split(',').filter(Boolean) || undefined,
        userIds: searchParams.get('user_ids')?.split(',').filter(Boolean) || undefined,
        minDuration: searchParams.get('min_duration') ? parseInt(searchParams.get('min_duration')!) : undefined,
        maxDuration: searchParams.get('max_duration') ? parseInt(searchParams.get('max_duration')!) : undefined,
        messageCountRange: (searchParams.get('min_messages') || searchParams.get('max_messages')) ? {
          min: parseInt(searchParams.get('min_messages') || '0'),
          max: parseInt(searchParams.get('max_messages') || '1000')
        } : undefined,
        hasErrors: searchParams.get('has_errors') === 'true' ? true : searchParams.get('has_errors') === 'false' ? false : undefined,
        knowledgeBaseUsed: searchParams.get('knowledge_base_used') === 'true' ? true : searchParams.get('knowledge_base_used') === 'false' ? false : undefined
      }
    };

    // Remove undefined values from filters
    Object.keys(queryData.filters).forEach(key => {
      if (queryData.filters[key as keyof typeof queryData.filters] === undefined) {
        delete queryData.filters[key as keyof typeof queryData.filters];
      }
    });

    // Validate query data
    const validatedQuery = validateSessionAnalyticsQuery(queryData);

    // Generate session analytics
    const sessionResult = await AnalyticsService.generateSessionAnalytics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(sessionResult, 'Session analytics retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/v1/analytics/sessions:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid query parameters', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve session analytics', 'SESSION_ANALYTICS_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/analytics/sessions
 *
 * Retrieve session analytics with complex query body
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
    const validatedQuery = validateSessionAnalyticsQuery(rawBody);

    // Generate session analytics
    const sessionResult = await AnalyticsService.generateSessionAnalytics(validatedQuery);

    return NextResponse.json(
      createSuccessResponse(sessionResult, 'Session analytics retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/analytics/sessions:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid request body', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve session analytics', 'SESSION_ANALYTICS_ERROR'),
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