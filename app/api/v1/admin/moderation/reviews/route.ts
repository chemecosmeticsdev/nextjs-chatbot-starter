import { NextRequest, NextResponse } from 'next/server';
import { ContentModerationService } from '@/lib/services/content-moderation';
import { UserReportingService } from '@/lib/services/user-reporting';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';
import { db } from '@/lib/db';
import { contentModerationViolations, contentModerationReviews } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export interface ReviewViolationRequest {
  violationId: string;
  action: 'approve' | 'reject' | 'escalate';
  reviewNotes?: string;
  adminId: string;
}

export interface ProcessAppealRequest {
  appealId: string;
  decision: 'approved' | 'rejected';
  adminResponse: string;
  reviewedBy: string;
}

/**
 * Admin moderation review management
 * GET /api/v1/admin/moderation/reviews - Get pending reviews
 * POST /api/v1/admin/moderation/reviews - Review violation
 */

/**
 * Get pending moderation reviews
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const severity = searchParams.get('severity');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate admin authentication
    const adminId = await validateAdminAuth(request);
    if (!adminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    // Build query conditions
    const conditions = [eq(contentModerationReviews.reviewStatus, status)];
    if (severity) {
      // This would need a join to check violation severity
    }

    // Get pending reviews with violation details
    const reviews = await db
      .select({
        reviewId: contentModerationReviews.id,
        violationId: contentModerationViolations.id,
        messageId: contentModerationViolations.messageId,
        ruleId: contentModerationViolations.ruleId,
        userId: contentModerationViolations.userId,
        chatbotId: contentModerationViolations.chatbotId,
        violationType: contentModerationViolations.violationType,
        severity: contentModerationViolations.severity,
        confidenceScore: contentModerationViolations.confidenceScore,
        originalContent: contentModerationViolations.originalContent,
        flaggedContent: contentModerationViolations.flaggedContent,
        userIdentifier: contentModerationViolations.userIdentifier,
        status: contentModerationViolations.status,
        createdAt: contentModerationViolations.createdAt,
        reviewStatus: contentModerationReviews.reviewStatus,
        reviewedAt: contentModerationReviews.reviewedAt,
        reviewedBy: contentModerationReviews.reviewedBy,
        reviewNotes: contentModerationReviews.reviewNotes
      })
      .from(contentModerationReviews)
      .leftJoin(
        contentModerationViolations,
        eq(contentModerationReviews.violationId, contentModerationViolations.id)
      )
      .where(and(...conditions))
      .orderBy(desc(contentModerationViolations.createdAt))
      .limit(limit)
      .offset(offset);

    // Log the access
    await AuditLogger.logSecurityEvent({
      userId: adminId,
      eventType: SecurityEventType.DATA_ACCESS,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/admin/moderation/reviews',
      method: 'GET',
      details: {
        action: 'admin_reviews_accessed',
        status,
        severity,
        limit,
        offset,
        reviewCount: reviews.length
      }
    });

    return NextResponse.json({
      reviews,
      total: reviews.length, // Would implement proper count in production
      limit,
      offset,
      hasMore: reviews.length === limit
    });

  } catch (error) {
    console.error('Get moderation reviews error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve moderation reviews',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Review a content moderation violation
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: ReviewViolationRequest | ProcessAppealRequest = await request.json();

    // Validate admin authentication
    const adminId = await validateAdminAuth(request);
    if (!adminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    // Handle appeal processing
    if ('appealId' in body) {
      return await processAppeal(body, request, adminId);
    }

    // Handle violation review
    return await reviewViolation(body as ReviewViolationRequest, request, adminId);

  } catch (error) {
    console.error('Moderation review error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process review',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Review a violation
 */
async function reviewViolation(
  body: ReviewViolationRequest,
  request: NextRequest,
  adminId: string
): Promise<NextResponse> {
  // Validate required fields
  if (!body.violationId || !body.action || !body.adminId) {
    return NextResponse.json(
      {
        error: 'Missing required fields: violationId, action, and adminId are required',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // Validate action
  const validActions = ['approve', 'reject', 'escalate'];
  if (!validActions.includes(body.action)) {
    return NextResponse.json(
      {
        error: 'Invalid action. Must be one of: approve, reject, escalate',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // Process the review
  const result = await ContentModerationService.reviewViolation(
    body.violationId,
    body.action,
    body.adminId,
    body.reviewNotes
  );

  if (!result) {
    return NextResponse.json(
      {
        error: 'Failed to process violation review',
        code: 'REVIEW_FAILED'
      },
      { status: 400 }
    );
  }

  // Log the review
  await AuditLogger.logSecurityEvent({
    userId: adminId,
    eventType: SecurityEventType.ADMIN_ACTION,
    severity: 'info',
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: '/api/v1/admin/moderation/reviews',
    method: 'POST',
    details: {
      action: 'violation_reviewed',
      violationId: body.violationId,
      reviewAction: body.action,
      adminId: body.adminId,
      reviewNotes: body.reviewNotes
    }
  });

  return NextResponse.json({
    success: true,
    message: `Violation ${body.action}ed successfully`,
    violationId: body.violationId,
    action: body.action
  });
}

/**
 * Process an appeal
 */
async function processAppeal(
  body: ProcessAppealRequest,
  request: NextRequest,
  adminId: string
): Promise<NextResponse> {
  // Validate required fields
  if (!body.appealId || !body.decision || !body.adminResponse || !body.reviewedBy) {
    return NextResponse.json(
      {
        error: 'Missing required fields: appealId, decision, adminResponse, and reviewedBy are required',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // Validate decision
  const validDecisions = ['approved', 'rejected'];
  if (!validDecisions.includes(body.decision)) {
    return NextResponse.json(
      {
        error: 'Invalid decision. Must be either approved or rejected',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // Process the appeal
  const result = await UserReportingService.processAppeal(
    body.appealId,
    body.decision,
    body.adminResponse,
    body.reviewedBy
  );

  if (!result) {
    return NextResponse.json(
      {
        error: 'Failed to process appeal',
        code: 'APPEAL_FAILED'
      },
      { status: 400 }
    );
  }

  // Log the appeal processing
  await AuditLogger.logSecurityEvent({
    userId: adminId,
    eventType: SecurityEventType.ADMIN_ACTION,
    severity: 'info',
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: '/api/v1/admin/moderation/reviews',
    method: 'POST',
    details: {
      action: 'appeal_processed',
      appealId: body.appealId,
      decision: body.decision,
      reviewedBy: body.reviewedBy
    }
  });

  return NextResponse.json({
    success: true,
    message: `Appeal ${body.decision} successfully`,
    appealId: body.appealId,
    decision: body.decision
  });
}

/**
 * Validate admin authentication
 * In production, this would check JWT token or session for admin role
 */
async function validateAdminAuth(request: NextRequest): Promise<string | null> {
  // Check for admin API key in headers
  const apiKey = request.headers.get('x-admin-api-key');
  if (apiKey === 'admin-dev-key') {
    return 'admin-user-id'; // Development only
  }

  // Check Authorization header for JWT
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // In production, verify JWT and check for admin role
    // For now, accept any Bearer token as admin
    return 'admin-from-jwt';
  }

  return null;
}