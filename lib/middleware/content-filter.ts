import { NextRequest, NextResponse } from 'next/server';
import { ContentModerationService } from '@/lib/services/content-moderation';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { getClientIdentifier } from '@/lib/security/rate-limiter';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';
import type { ModerationContext, ModerationResult } from '@/lib/db/schema';

export interface ContentFilterOptions {
  enabled?: boolean;
  blockOnViolation?: boolean;
  severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
  exemptRoles?: string[];
  logViolations?: boolean;
  rateLimitViolators?: boolean;
  customHandler?: (result: ModerationResult, context: ModerationContext) => Promise<NextResponse | null>;
}

/**
 * Content filtering middleware for protecting chat endpoints
 */
export function withContentFilter(options: ContentFilterOptions = {}) {
  return function (handler: Function) {
    return async function contentFilterMiddleware(
      request: NextRequest,
      context?: any
    ): Promise<NextResponse> {
      try {
        // Skip filtering if disabled
        if (options.enabled === false) {
          return await handler(request, context);
        }

        // Extract content to moderate
        const body = await request.json().catch(() => ({}));
        const contentToModerate = extractContentFromRequest(body);

        if (!contentToModerate) {
          return await handler(request, context);
        }

        // Build moderation context
        const moderationContext = await buildModerationContext(request, body, contentToModerate);

        // Check if user is exempt from moderation
        if (await isUserExempt(moderationContext.userId, options.exemptRoles)) {
          return await handler(request, context);
        }

        // Perform content moderation
        const moderationResult = await ContentModerationService.moderateContent(moderationContext);

        // Handle moderation result
        const response = await handleModerationResult(
          moderationResult,
          moderationContext,
          options,
          request
        );

        if (response) {
          return response; // Content was blocked or flagged
        }

        // Content is allowed, proceed with original handler
        return await handler(request, context);

      } catch (error) {
        console.error('Content filter middleware error:', error);

        // Log the error
        await AuditLogger.logSecurityEvent({
          eventType: SecurityEventType.MALICIOUS_REQUEST,
          severity: 'critical',
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
          endpoint: new URL(request.url).pathname,
          method: request.method,
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            middleware: 'content-filter'
          }
        });

        // Fail safe: allow content if moderation fails
        return await handler(request, context);
      }
    };
  };
}

/**
 * Extract content that needs moderation from request body
 */
function extractContentFromRequest(body: any): string | null {
  // Handle different request formats
  if (body.content) return body.content;
  if (body.message) return body.message;
  if (body.text) return body.text;
  if (body.prompt) return body.prompt;
  if (body.query) return body.query;

  // Handle nested content
  if (body.data?.content) return body.data.content;
  if (body.data?.message) return body.data.message;

  // Handle array of messages
  if (body.messages && Array.isArray(body.messages)) {
    return body.messages
      .map((msg: any) => msg.content || msg.message || msg.text)
      .filter(Boolean)
      .join(' ');
  }

  return null;
}

/**
 * Build moderation context from request
 */
async function buildModerationContext(
  request: NextRequest,
  body: any,
  content: string
): Promise<ModerationContext> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');

  // Extract chatbot ID from URL (e.g., /api/v1/chatbots/{id}/chat)
  const chatbotIdIndex = pathParts.indexOf('chatbots') + 1;
  const chatbotId = pathParts[chatbotIdIndex] || 'unknown';

  // Extract user information
  const userId = extractUserIdFromRequest(request, body);
  const userIdentifier = getClientIdentifier(request, userId);

  return {
    messageContent: content,
    userId,
    chatbotId,
    conversationId: body.conversationId || body.sessionId || 'unknown',
    userIdentifier,
    metadata: {
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      sessionId: body.sessionId,
      endpoint: url.pathname,
      method: request.method
    }
  };
}

/**
 * Extract user ID from request (from auth header, session, or body)
 */
function extractUserIdFromRequest(request: NextRequest, body: any): string | undefined {
  // Try to extract from Authorization header (JWT)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      // This would decode JWT to get user ID in production
      // For now, return placeholder
      return 'user-from-jwt';
    } catch (error) {
      // Invalid JWT
    }
  }

  // Try to extract from session cookie
  const sessionCookie = request.cookies.get('session');
  if (sessionCookie) {
    // This would decode session to get user ID in production
    return 'user-from-session';
  }

  // Try to extract from request body
  if (body.userId) return body.userId;

  return undefined;
}

/**
 * Check if user is exempt from content moderation
 */
async function isUserExempt(userId: string | undefined, exemptRoles?: string[]): Promise<boolean> {
  if (!userId || !exemptRoles?.length) return false;

  // This would check user roles against exempt roles in production
  // For now, exempt admin and super_admin by default
  const defaultExemptRoles = ['admin', 'super_admin'];
  const allExemptRoles = [...defaultExemptRoles, ...exemptRoles];

  // Placeholder: In production, query user role from database
  const userRole = 'user'; // This would come from actual user lookup

  return allExemptRoles.includes(userRole);
}

/**
 * Handle moderation result and determine response
 */
async function handleModerationResult(
  result: ModerationResult,
  context: ModerationContext,
  options: ContentFilterOptions,
  request: NextRequest
): Promise<NextResponse | null> {
  // No violation detected
  if (!result.isViolation) {
    return null;
  }

  // Log the violation
  if (options.logViolations !== false) {
    await AuditLogger.logSecurityEvent({
      userId: context.userId,
      eventType: SecurityEventType.MALICIOUS_REQUEST,
      severity: result.severity === 'critical' || result.severity === 'high' ? 'critical' : 'warning',
      ipAddress: context.metadata?.ipAddress,
      userAgent: context.metadata?.userAgent,
      endpoint: context.metadata?.endpoint,
      method: context.metadata?.method,
      details: {
        chatbotId: context.chatbotId,
        conversationId: context.conversationId,
        violatedRules: result.violatedRules,
        severity: result.severity,
        confidence: result.confidenceScore,
        action: result.action,
        flaggedContent: result.flaggedContent,
        reasoning: result.reasoning
      },
      blocked: result.action === 'block'
    });
  }

  // Apply rate limiting for violators
  if (options.rateLimitViolators && result.severity !== 'low') {
    const identifier = getClientIdentifier(request, context.userId);
    const rateLimitResult = await rateLimiters.auth.checkLimit(identifier);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded due to content violations',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfter
        },
        { status: 429 }
      );
    }
  }

  // Use custom handler if provided
  if (options.customHandler) {
    const customResponse = await options.customHandler(result, context);
    if (customResponse) return customResponse;
  }

  // Check severity threshold
  const severityPriority = getSeverityPriority(result.severity);
  const thresholdPriority = getSeverityPriority(options.severityThreshold || 'medium');

  if (severityPriority < thresholdPriority) {
    // Below threshold, log but allow
    return null;
  }

  // Handle based on action
  switch (result.action) {
    case 'block':
      return createBlockedResponse(result);

    case 'escalate':
      // Block for now, but create escalation record
      await createEscalationRecord(context, result);
      return createBlockedResponse(result);

    case 'flag':
      // Allow but flag for review
      await createFlagRecord(context, result);
      return options.blockOnViolation
        ? createBlockedResponse(result, true)
        : null;

    case 'allow':
    default:
      return null;
  }
}

/**
 * Create blocked content response
 */
function createBlockedResponse(result: ModerationResult, flagged = false): NextResponse {
  const message = flagged
    ? 'Message has been flagged for review'
    : 'Message blocked due to content policy violation';

  return NextResponse.json(
    {
      error: message,
      code: flagged ? 'CONTENT_FLAGGED' : 'CONTENT_BLOCKED',
      details: {
        severity: result.severity,
        confidence: result.confidenceScore,
        reasoning: result.reasoning
      }
    },
    { status: flagged ? 202 : 400 }
  );
}

/**
 * Create escalation record for high-severity violations
 */
async function createEscalationRecord(
  context: ModerationContext,
  result: ModerationResult
): Promise<void> {
  try {
    // This would create an escalation record in the moderation system
    await AuditLogger.logSecurityEvent({
      userId: context.userId,
      eventType: SecurityEventType.MALICIOUS_REQUEST,
      severity: 'critical',
      ipAddress: context.metadata?.ipAddress,
      userAgent: context.metadata?.userAgent,
      endpoint: context.metadata?.endpoint,
      method: context.metadata?.method,
      details: {
        escalation: true,
        chatbotId: context.chatbotId,
        violatedRules: result.violatedRules,
        flaggedContent: result.flaggedContent,
        reasoning: result.reasoning
      }
    });
  } catch (error) {
    console.error('Error creating escalation record:', error);
  }
}

/**
 * Create flag record for moderate violations
 */
async function createFlagRecord(
  context: ModerationContext,
  result: ModerationResult
): Promise<void> {
  try {
    await AuditLogger.logSecurityEvent({
      userId: context.userId,
      eventType: SecurityEventType.INVALID_INPUT,
      severity: 'warning',
      ipAddress: context.metadata?.ipAddress,
      userAgent: context.metadata?.userAgent,
      endpoint: context.metadata?.endpoint,
      method: context.metadata?.method,
      details: {
        flagged: true,
        chatbotId: context.chatbotId,
        violatedRules: result.violatedRules,
        flaggedContent: result.flaggedContent,
        reasoning: result.reasoning
      }
    });
  } catch (error) {
    console.error('Error creating flag record:', error);
  }
}

/**
 * Get severity priority for comparison
 */
function getSeverityPriority(severity: string): number {
  switch (severity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

/**
 * Convenience function for common chat endpoint filtering
 */
export function withChatContentFilter(options: Partial<ContentFilterOptions> = {}) {
  return withContentFilter({
    enabled: true,
    blockOnViolation: true,
    severityThreshold: 'medium',
    logViolations: true,
    rateLimitViolators: true,
    exemptRoles: ['admin', 'super_admin'],
    ...options
  });
}

/**
 * Convenience function for API endpoint filtering (more permissive)
 */
export function withApiContentFilter(options: Partial<ContentFilterOptions> = {}) {
  return withContentFilter({
    enabled: true,
    blockOnViolation: false,
    severityThreshold: 'high',
    logViolations: true,
    rateLimitViolators: false,
    ...options
  });
}

/**
 * Convenience function for admin/internal endpoints (minimal filtering)
 */
export function withAdminContentFilter(options: Partial<ContentFilterOptions> = {}) {
  return withContentFilter({
    enabled: true,
    blockOnViolation: false,
    severityThreshold: 'critical',
    logViolations: true,
    rateLimitViolators: false,
    exemptRoles: ['admin', 'super_admin', 'moderator'],
    ...options
  });
}