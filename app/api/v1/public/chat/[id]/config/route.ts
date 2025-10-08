import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '@/lib/security/api-keys';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { ApiUsageService } from '@/lib/services/api-usage-service';
import { createErrorResponse, createSuccessResponse } from '@/lib/utils/api-response';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Get public chatbot configuration for widget integration
 * GET /api/v1/public/chat/{id}/config
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chatbotId = params.id;

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
    if (!apiKeyData || !apiKeyData.scopes.includes('public')) {
      return createErrorResponse('Invalid API key or insufficient permissions', 401, {
        code: 'UNAUTHORIZED'
      });
    }

    // Track API usage
    await ApiUsageService.trackUsage(apiKeyData.id, {
      endpoint: '/chat/config',
      method: 'GET',
      chatbotId
    });

    // Get chatbot configuration
    const chatbot = await ChatbotService.getChatbotById(chatbotId);

    if (!chatbot) {
      return createErrorResponse('Chatbot not found', 404, {
        code: 'CHATBOT_NOT_FOUND'
      });
    }

    if (!chatbot.isActive) {
      return createErrorResponse('Chatbot is not active', 403, {
        code: 'CHATBOT_INACTIVE'
      });
    }

    // Return only public configuration data
    const publicConfig = {
      id: chatbot.id,
      name: chatbot.name,
      description: chatbot.description,
      settings: {
        maxTokens: chatbot.maxTokens,
        temperature: chatbot.temperature,
        greeting: chatbot.greetingMessage,
        theme: chatbot.uiConfig?.theme || 'default',
        colors: chatbot.uiConfig?.colors,
        branding: chatbot.uiConfig?.branding,
        features: {
          typing: chatbot.uiConfig?.showTyping || true,
          timestamps: chatbot.uiConfig?.showTimestamps || false,
          userAvatar: chatbot.uiConfig?.showUserAvatar || true,
          botAvatar: chatbot.uiConfig?.showBotAvatar || true,
          feedback: chatbot.uiConfig?.allowFeedback || true,
          fileUpload: chatbot.uiConfig?.allowFileUpload || false
        }
      },
      limits: {
        maxMessageLength: 2000,
        rateLimitPerMinute: 20,
        sessionTimeout: 30 * 60 * 1000 // 30 minutes
      },
      supportedFormats: ['text', 'markdown'],
      version: '1.0',
      lastUpdated: chatbot.updatedAt
    };

    return createSuccessResponse(publicConfig);

  } catch (error) {
    console.error('Public API config error:', error);

    return createErrorResponse(
      'Internal server error',
      500,
      { code: 'INTERNAL_ERROR' }
    );
  }
}