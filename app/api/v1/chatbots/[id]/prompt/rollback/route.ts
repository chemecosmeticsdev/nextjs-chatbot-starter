import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import {
  rollbackPromptSchema,
  type RollbackPromptRequest
} from '@/lib/validation/prompt';
import { formatValidationErrors } from '@/lib/validation/common';

/**
 * POST /api/v1/chatbots/[id]/prompt/rollback
 *
 * Rollback system prompt to a previous version
 */
export async function POST(
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
    let body: RollbackPromptRequest;
    try {
      const rawBody = await request.json();
      body = rollbackPromptSchema.parse(rawBody);
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

    // Get the specific prompt version to rollback to
    const targetPromptVersion = await ChatbotService.getPromptVersion(
      chatbotId,
      body.version
    );

    if (!targetPromptVersion) {
      return NextResponse.json(
        createErrorResponse(
          `Prompt version ${body.version} not found`,
          'VERSION_NOT_FOUND'
        ),
        { status: 404 }
      );
    }

    // Perform the rollback
    const rollbackResult = await ChatbotService.rollbackPrompt(
      chatbotId,
      body.version,
      user.id,
      body.reason
    );

    if (!rollbackResult) {
      return NextResponse.json(
        createErrorResponse('Failed to rollback prompt', 'ROLLBACK_FAILED'),
        { status: 500 }
      );
    }

    // Log the rollback for security audit
    console.log(
      `Prompt rollback for chatbot ${chatbotId} by user ${user.id} - ` +
      `Rolled back to version ${body.version}, Reason: ${body.reason || 'No reason provided'}`
    );

    return NextResponse.json(
      createSuccessResponse({
        message: 'Prompt rolled back successfully',
        rolledBackToVersion: body.version,
        newCurrentVersion: rollbackResult.newVersion,
        prompt: rollbackResult.prompt,
        rollbackReason: body.reason,
        rolledBackAt: rollbackResult.rolledBackAt,
        previousPrompt: {
          version: rollbackResult.previousVersion,
          preview: existingChatbot.currentSystemPrompt?.substring(0, 200) + '...'
        }
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error rolling back prompt:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
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