import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/lib/services/analytics';
import { AuthTokenService } from '@/lib/auth';
import { validateUserActivityEvent } from '@/lib/validation/analytics';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * POST /api/v1/analytics/activity
 *
 * Track user activity events
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

    const rawBody = await request.json();

    // Add user information to the event if not provided
    const eventData = {
      ...rawBody,
      userId: rawBody.userId || user.id,
      timestamp: rawBody.timestamp || new Date().toISOString()
    };

    // Get additional request context
    const userAgent = request.headers.get('user-agent') || undefined;
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     undefined;

    if (userAgent && !eventData.userAgent) {
      eventData.userAgent = userAgent;
    }
    if (ipAddress && !eventData.ipAddress) {
      eventData.ipAddress = ipAddress;
    }

    // Validate activity event data
    const validatedEvent = validateUserActivityEvent(eventData);

    // Track the activity
    const activityId = await AnalyticsService.trackUserActivity(validatedEvent);

    return NextResponse.json(
      createSuccessResponse(
        { activityId, timestamp: validatedEvent.timestamp },
        'User activity tracked successfully'
      ),
      { status: 201 }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/analytics/activity:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid activity event data', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to track user activity', 'ACTIVITY_TRACKING_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function GET() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

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