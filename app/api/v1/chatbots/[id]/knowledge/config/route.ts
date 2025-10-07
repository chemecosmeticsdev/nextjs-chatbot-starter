import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { AuthTokenService } from '@/lib/auth';
import { ChatbotKnowledgeIntegration } from '@/lib/services/chatbot-knowledge-integration';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';
import { z } from 'zod';

// Knowledge base configuration schema
const knowledgeConfigSchema = z.object({
  enableKnowledgeBase: z.boolean().optional(),
  searchThreshold: z.number().min(0.5).max(1.0).optional(),
  maxSearchResults: z.number().int().min(1).max(10).optional(),
  knowledgeSourceFilters: z.object({
    documentTypes: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    supplierIds: z.array(z.string().uuid()).optional()
  }).optional()
}).strict();

/**
 * GET /api/v1/chatbots/{id}/knowledge/config
 *
 * Get current knowledge base configuration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Get chatbot details
    const chatbot = await ChatbotService.getChatbotById(params.id, user.id);
    if (!chatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Extract knowledge base configuration
    const knowledgeConfig = chatbot.configuration?.knowledgeBase ||
      ChatbotKnowledgeIntegration.getDefaultKnowledgeConfig();

    return NextResponse.json(
      createSuccessResponse(
        {
          chatbotId: params.id,
          knowledgeBaseConfig: knowledgeConfig
        },
        'Knowledge base configuration retrieved successfully'
      )
    );

  } catch (error) {
    console.error('Error in GET /api/v1/chatbots/{id}/knowledge/config:', error);

    return NextResponse.json(
      createErrorResponse('Failed to get knowledge base configuration', 'CONFIG_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/chatbots/{id}/knowledge/config
 *
 * Update knowledge base configuration
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Validate configuration data
    const validatedConfig = knowledgeConfigSchema.parse(rawBody);

    // Get current chatbot
    const chatbot = await ChatbotService.getChatbotById(params.id, user.id);
    if (!chatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Validate and merge configuration
    const validatedKnowledgeConfig = ChatbotKnowledgeIntegration.validateKnowledgeConfig(validatedConfig);

    const updatedConfiguration = ChatbotKnowledgeIntegration.mergeKnowledgeConfig(
      chatbot.configuration || {},
      validatedKnowledgeConfig
    );

    // Update chatbot configuration
    const updatedChatbot = await ChatbotService.updateChatbot(
      params.id,
      { configuration: updatedConfiguration },
      user.id
    );

    return NextResponse.json(
      createSuccessResponse(
        {
          chatbotId: params.id,
          knowledgeBaseConfig: updatedChatbot.configuration.knowledgeBase,
          updatedAt: updatedChatbot.updatedAt
        },
        'Knowledge base configuration updated successfully'
      )
    );

  } catch (error) {
    console.error('Error in PUT /api/v1/chatbots/{id}/knowledge/config:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid configuration data', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to update knowledge base configuration', 'CONFIG_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function POST() {
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