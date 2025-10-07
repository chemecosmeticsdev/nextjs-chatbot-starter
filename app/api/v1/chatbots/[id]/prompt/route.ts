import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import {
  updatePromptSchema,
  type UpdatePromptRequest
} from '@/lib/validation/prompt';
import { formatValidationErrors } from '@/lib/validation/common';

/**
 * GET /api/v1/chatbots/[id]/prompt
 *
 * Get current system prompt for a chatbot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Validate chatbot ID
    const chatbotId = params.id;
    if (!chatbotId || typeof chatbotId !== 'string') {
      return NextResponse.json(
        createErrorResponse('Invalid chatbot ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      chatbotId,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied to this chatbot', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Get chatbot with current prompt
    const chatbot = await ChatbotService.getChatbotById(chatbotId);
    if (!chatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Get prompt history for this chatbot
    const promptHistory = await ChatbotService.getPromptHistory(chatbotId, {
      page: 1,
      limit: 10
    });

    return NextResponse.json(
      createSuccessResponse({
        currentPrompt: chatbot.currentSystemPrompt,
        history: promptHistory.prompts,
        pagination: promptHistory.pagination
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting chatbot prompt:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/chatbots/[id]/prompt
 *
 * Update system prompt for a chatbot
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Validate chatbot ID
    const chatbotId = params.id;
    if (!chatbotId || typeof chatbotId !== 'string') {
      return NextResponse.json(
        createErrorResponse('Invalid chatbot ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      chatbotId,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied to this chatbot', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body: UpdatePromptRequest;
    try {
      const rawBody = await request.json();
      body = updatePromptSchema.parse(rawBody);
    } catch (error) {
      return NextResponse.json(
        createErrorResponse(
          'Validation failed',
          'VALIDATION_ERROR',
          formatValidationErrors(error)
        ),
        { status: 400 }
      );
    }

    // Check if chatbot exists
    const existingChatbot = await ChatbotService.getChatbotById(chatbotId);
    if (!existingChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Update the system prompt
    const result = await ChatbotService.updateSystemPrompt(
      chatbotId,
      body.prompt,
      user.id,
      body.description
    );

    if (!result) {
      return NextResponse.json(
        createErrorResponse('Failed to update prompt', 'UPDATE_FAILED'),
        { status: 500 }
      );
    }

    // Log the prompt update for security audit
    console.log(
      `System prompt updated for chatbot ${chatbotId} by user ${user.id} - ` +
      `Version: ${result.version}, Length: ${body.prompt.length} chars`
    );

    return NextResponse.json(
      createSuccessResponse({
        message: 'System prompt updated successfully',
        currentPrompt: result.prompt,
        version: result.version,
        updatedAt: result.updatedAt
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error updating chatbot prompt:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
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