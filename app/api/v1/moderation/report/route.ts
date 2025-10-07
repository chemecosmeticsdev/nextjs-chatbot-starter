import { NextRequest, NextResponse } from 'next/server';
import { UserReportingService } from '@/lib/services/user-reporting';
import { getClientIdentifier } from '@/lib/security/rate-limiter';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';
import type { UserReportData } from '@/lib/services/user-reporting';

export interface SubmitReportRequest {
  messageId: string;
  reportCategory: 'spam' | 'inappropriate' | 'harassment' | 'misinformation' | 'offensive_language' | 'privacy_violation' | 'copyright' | 'other';
  reportReason: string;
  additionalDetails?: string;
  userId?: string;
  chatbotId: string;
  conversationId: string;
}

/**
 * User content reporting endpoint
 * POST /api/v1/moderation/report
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: SubmitReportRequest = await request.json();

    // Validate required fields
    if (!body.messageId || !body.reportCategory || !body.reportReason || !body.chatbotId || !body.conversationId) {
      return NextResponse.json(
        {
          error: 'Missing required fields: messageId, reportCategory, reportReason, chatbotId, and conversationId are required',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Validate report category
    const validCategories = ['spam', 'inappropriate', 'harassment', 'misinformation', 'offensive_language', 'privacy_violation', 'copyright', 'other'];
    if (!validCategories.includes(body.reportCategory)) {
      return NextResponse.json(
        {
          error: 'Invalid report category',
          code: 'INVALID_INPUT',
          validCategories
        },
        { status: 400 }
      );
    }

    // Build report data
    const userIdentifier = getClientIdentifier(request, body.userId);
    const reportData: UserReportData = {
      messageId: body.messageId,
      reportCategory: body.reportCategory,
      reportReason: body.reportReason,
      additionalDetails: body.additionalDetails,
      userIdentifier,
      userId: body.userId,
      chatbotId: body.chatbotId,
      conversationId: body.conversationId
    };

    // Submit the report
    const result = await UserReportingService.submitReport(reportData);

    // Log the report submission
    await AuditLogger.logSecurityEvent({
      userId: body.userId,
      eventType: SecurityEventType.INVALID_INPUT,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/report',
      method: 'POST',
      details: {
        action: 'user_report_submitted',
        messageId: body.messageId,
        reportCategory: body.reportCategory,
        chatbotId: body.chatbotId,
        conversationId: body.conversationId,
        reportId: result.reportId,
        success: result.success
      }
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('User report submission error:', error);

    // Log the error
    await AuditLogger.logSecurityEvent({
      eventType: SecurityEventType.MALICIOUS_REQUEST,
      severity: 'warning',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/report',
      method: 'POST',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'user_report_error'
      }
    });

    return NextResponse.json(
      {
        error: 'Failed to submit report. Please try again later.',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Get user's report history
 * GET /api/v1/moderation/report?userIdentifier={id}&limit={n}&offset={n}
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

    // Get user reports
    const result = await UserReportingService.getUserReports(userIdentifier, { limit, offset });

    // Log the access
    await AuditLogger.logSecurityEvent({
      eventType: SecurityEventType.DATA_ACCESS,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/report',
      method: 'GET',
      details: {
        action: 'user_reports_accessed',
        userIdentifier,
        limit,
        offset,
        totalReports: result.total
      }
    });

    return NextResponse.json({
      reports: result.reports,
      total: result.total,
      limit,
      offset,
      hasMore: result.total > offset + limit
    });

  } catch (error) {
    console.error('Get user reports error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve reports',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}