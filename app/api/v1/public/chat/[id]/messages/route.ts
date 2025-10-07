import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '@/lib/security/api-keys';
import { ConversationService } from '@/lib/services/conversation-service';
import { ApiUsageService } from '@/lib/services/api-usage-service';
import { rateLimiters } from '@/lib/middleware/rate-limit';
import { sanitizeInput } from '@/lib/middleware/sanitize';
import { PublicApiValidator } from '@/lib/validation/public-api';
import { createErrorResponse, createSuccessResponse } from '@/lib/utils/api-response';

/**
 * Public API endpoint for sending messages to chatbots
 * POST /api/v1/public/chat/{id}/messages
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatbotId = params.id;

    // Extract API key from headers
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return createErrorResponse('API key required', 401, {
        code: 'MISSING_API_KEY',
        details: 'Include API key in x-api-key header or Authorization: Bearer token'
      });
    }

    // Verify API key and get permissions
    const apiKeyData = await ApiKeyService.verifyApiKey(apiKey);
    if (!apiKeyData) {
      return createErrorResponse('Invalid API key', 401, {
        code: 'INVALID_API_KEY'
      });
    }

    // Check API key permissions
    if (!apiKeyData.scopes.includes('public') && !apiKeyData.scopes.includes('read')) {
      return createErrorResponse('Insufficient permissions', 403, {
        code: 'INSUFFICIENT_PERMISSIONS',
        required_scopes: ['public', 'read']
      });
    }

    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const rateLimitKey = `${apiKeyData.id}:${clientIp}`;
    const rateLimitResult = await rateLimiters.api.checkLimit(rateLimitKey);

    if (!rateLimitResult.allowed) {
      return createErrorResponse('Rate limit exceeded', 429, {
        code: 'RATE_LIMIT_EXCEEDED',
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = PublicApiValidator.validateChatMessage(body);

    if (!validation.success) {
      return createErrorResponse('Invalid request data', 400, {
        code: 'VALIDATION_ERROR',
        errors: validation.errors
      });
    }

    const { message, sessionId, userId, metadata } = validation.data;

    // Sanitize message content
    const sanitizedMessage = sanitizeInput(message);

    // Track API usage
    await ApiUsageService.trackUsage(apiKeyData.id, {
      endpoint: '/chat/messages',
      method: 'POST',
      chatbotId,
      userId: userId || 'anonymous',
      messageLength: sanitizedMessage.length,
      metadata
    });

    // Process the chat message
    const response = await ConversationService.processMessage({
      chatbotId,
      message: sanitizedMessage,
      sessionId,
      userId: userId || `api_user_${apiKeyData.id}`,
      source: 'public_api',
      metadata: {
        ...metadata,
        apiKeyId: apiKeyData.id,
        clientIp,
        userAgent: request.headers.get('user-agent')
      }
    });

    return createSuccessResponse({
      message: response.message,
      sessionId: response.sessionId,
      messageId: response.messageId,
      timestamp: response.timestamp,
      usage: {
        tokensUsed: response.tokensUsed,
        responseTime: response.responseTime,
        vectorSearchResults: response.vectorSearchResults?.length || 0
      }
    });

  } catch (error) {
    console.error('Public API error:', error);

    return createErrorResponse(
      'Internal server error',
      500,
      { code: 'INTERNAL_ERROR' }
    );
  }
}

/**
 * Get conversation history
 * GET /api/v1/public/chat/{id}/messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatbotId = params.id;
    const { searchParams } = new URL(request.url);

    // Extract API key
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return createErrorResponse('API key required', 401, {
        code: 'MISSING_API_KEY'
      });
    }

    // Verify API key
    const apiKeyData = await ApiKeyService.verifyApiKey(apiKey);
    if (!apiKeyData || !apiKeyData.scopes.includes('read')) {
      return createErrorResponse('Invalid API key or insufficient permissions', 401, {
        code: 'UNAUTHORIZED'
      });
    }

    // Parse query parameters
    const sessionId = searchParams.get('sessionId');
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!sessionId) {
      return createErrorResponse('Session ID required', 400, {
        code: 'MISSING_SESSION_ID'
      });
    }

    // Track API usage
    await ApiUsageService.trackUsage(apiKeyData.id, {
      endpoint: '/chat/messages',
      method: 'GET',
      chatbotId,
      userId: userId || 'anonymous'
    });

    // Get conversation history
    const messages = await ConversationService.getConversationHistory({
      chatbotId,
      sessionId,
      userId,
      limit,
      offset
    });

    return createSuccessResponse({
      messages: messages.map(msg => ({
        id: msg.id,
        message: msg.message,
        role: msg.role,
        timestamp: msg.createdAt,
        metadata: msg.metadata
      })),
      pagination: {
        limit,
        offset,
        total: messages.length
      }
    });

  } catch (error) {
    console.error('Public API error:', error);

    return createErrorResponse(
      'Internal server error',
      500,
      { code: 'INTERNAL_ERROR' }
    );
  }
}