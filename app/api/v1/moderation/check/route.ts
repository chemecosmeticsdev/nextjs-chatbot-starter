import { NextRequest, NextResponse } from 'next/server';
import { ContentModerationService } from '@/lib/services/content-moderation';
import { getClientIdentifier } from '@/lib/security/rate-limiter';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';
import type { ModerationContext } from '@/lib/db/schema';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export interface CheckContentRequest {
  content: string;
  chatbotId: string;
  conversationId?: string;
  userId?: string;
  userIdentifier?: string;
}

export interface CheckContentResponse {
  allowed: boolean;
  violations?: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  confidence?: number;
  reasoning?: string;
  action?: 'allow' | 'flag' | 'escalate' | 'block';
  estimatedReviewTime?: string;
}

/**
 * Content pre-validation endpoint for real-time moderation
 * POST /api/v1/moderation/check
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CheckContentRequest = await request.json();

    // Validate required fields
    if (!body.content || !body.chatbotId) {
      return NextResponse.json(
        {
          error: 'Missing required fields: content and chatbotId are required',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Build moderation context
    const userIdentifier = body.userIdentifier || getClientIdentifier(request, body.userId);
    const context: ModerationContext = {
      messageContent: body.content,
      userId: body.userId,
      chatbotId: body.chatbotId,
      conversationId: body.conversationId || 'unknown',
      userIdentifier,
      metadata: {
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        endpoint: '/api/v1/moderation/check',
        method: 'POST'
      }
    };

    // Perform content moderation
    const result = await ContentModerationService.moderateContent(context);

    // Log the check for audit purposes
    await AuditLogger.logSecurityEvent({
      userId: body.userId,
      eventType: SecurityEventType.INVALID_INPUT,
      severity: result.isViolation ? 'warning' : 'info',
      ipAddress: context.metadata?.ipAddress,
      userAgent: context.metadata?.userAgent,
      endpoint: context.metadata?.endpoint,
      method: context.metadata?.method,
      details: {
        action: 'content_moderation_check',
        chatbotId: body.chatbotId,
        conversationId: body.conversationId,
        isViolation: result.isViolation,
        violatedRules: result.violatedRules,
        severity: result.severity,
        confidence: result.confidenceScore,
        reasoning: result.reasoning
      }
    });

    // Build response
    const response: CheckContentResponse = {
      allowed: !result.isViolation || result.action === 'allow',
      violations: result.isViolation ? result.violatedRules : undefined,
      severity: result.isViolation ? result.severity : undefined,
      confidence: result.isViolation ? result.confidenceScore : undefined,
      reasoning: result.isViolation ? result.reasoning : undefined,
      action: result.action,
      estimatedReviewTime: result.isViolation && result.action !== 'allow'
        ? getEstimatedReviewTime(result.severity)
        : undefined
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Content moderation check error:', error);

    // Log the error
    await AuditLogger.logSecurityEvent({
      eventType: SecurityEventType.MALICIOUS_REQUEST,
      severity: 'critical',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/moderation/check',
      method: 'POST',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'content_moderation_check_error'
      }
    });

    return NextResponse.json(
      {
        error: 'Content moderation service temporarily unavailable',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Get estimated review time based on severity
 */
function getEstimatedReviewTime(severity: string): string {
  const timeMap: Record<string, string> = {
    low: '24-48 hours',
    medium: '12-24 hours',
    high: '4-12 hours',
    critical: '1-4 hours'
  };

  return timeMap[severity] || '24-48 hours';
}