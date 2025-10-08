import { NextRequest, NextResponse } from 'next/server';
import { UserReportingService } from '@/lib/services/user-reporting';
import { getClientIdentifier } from '@/lib/security/rate-limiter';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';
import type { AppealData } from '@/lib/services/user-reporting';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export interface SubmitAppealRequest {
  violationId: string;
  appealReason: string;
  additionalContext?: string;
  userId?: string;
}

/**
 * Content moderation appeal endpoint
 * POST /api/v1/moderation/appeal
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: SubmitAppealRequest = await request.json();

    // Validate required fields
    if (!body.violationId || !body.appealReason) {
      return NextResponse.json(
        {
          error: 'Missing required fields: violationId and appealReason are required',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Validate appeal reason length
    if (body.appealReason.length < 10) {
      return NextResponse.json(
        {
          error: 'Appeal reason must be at least 10 characters long',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    if (body.appealReason.length > 2000) {
      return NextResponse.json(
        {
          error: 'Appeal reason must not exceed 2000 characters',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Build appeal data
    const userIdentifier = getClientIdentifier(request, body.userId);
    const appealData: AppealData = {
      violationId: body.violationId,
      appealReason: body.appealReason,
      additionalContext: body.additionalContext,
      userId: body.userId,
      userIdentifier
    };

    // Submit the appeal
    const result = await UserReportingService.submitAppeal(appealData);

    // Log the appeal submission
    await AuditLogger.logSecurityEvent({
      userId: body.userId,
      eventType: SecurityEventType.INVALID_INPUT,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/appeal',
      method: 'POST',
      details: {
        action: 'appeal_submitted',
        violationId: body.violationId,
        appealId: result.appealId,
        success: result.success
      }
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Appeal submission error:', error);

    // Log the error
    await AuditLogger.logSecurityEvent({
      eventType: SecurityEventType.MALICIOUS_REQUEST,
      severity: 'warning',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/appeal',
      method: 'POST',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'appeal_submission_error'
      }
    });

    return NextResponse.json(
      {
        error: 'Failed to submit appeal. Please try again later.',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Get user's appeal history
 * GET /api/v1/moderation/appeal?userIdentifier={id}&limit={n}&offset={n}
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userIdentifier = searchParams.get('userIdentifier');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!userIdentifier) {
      return NextResponse.json(
        {
          error: 'Missing required parameter: userIdentifier',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          error: 'Limit must be between 1 and 100',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        {
          error: 'Offset must be non-negative',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Get user appeals
    const result = await UserReportingService.getUserAppeals(userIdentifier, { limit, offset });

    // Log the access
    await AuditLogger.logSecurityEvent({
      eventType: SecurityEventType.DATA_ACCESS,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/appeal',
      method: 'GET',
      details: {
        action: 'user_appeals_accessed',
        userIdentifier,
        limit,
        offset,
        totalAppeals: result.total
      }
    });

    return NextResponse.json({
      appeals: result.appeals,
      total: result.total,
      limit,
      offset,
      hasMore: result.total > offset + limit
    });

  } catch (error) {
    console.error('Get user appeals error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve appeals',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}