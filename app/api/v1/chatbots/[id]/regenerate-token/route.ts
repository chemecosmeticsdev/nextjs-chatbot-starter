import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { ChatbotService } from '@/lib/db/chatbot-service';
import {
  validateChatbotId,
  formatValidationError,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/validation/chatbot';
import { z } from 'zod';

/**
 * POST /api/v1/chatbots/[id]/regenerate-token
 * Regenerate API key for a chatbot
 */
export async function POST(
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

    // Validate chatbot ID
    let validatedParams;
    try {
      validatedParams = validateChatbotId(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      validatedParams.id,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse(
          'Access denied to this chatbot',
          'FORBIDDEN'
        ),
        { status: 403 }
      );
    }

    // Check if chatbot exists
    const existingChatbot = await ChatbotService.getChatbotById(validatedParams.id);
    if (!existingChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Regenerate API key
    const result = await ChatbotService.regenerateApiKey(validatedParams.id);

    if (!result) {
      return NextResponse.json(
        createErrorResponse(
          'Failed to regenerate API key',
          'REGENERATION_FAILED'
        ),
        { status: 500 }
      );
    }

    // Log the regeneration event for security audit
    console.log(`API key regenerated for chatbot ${validatedParams.id} by user ${user.id} (${user.email})`);

    // Return new API key and hint
    const response = createSuccessResponse({
      apiKey: result.apiKey,
      hint: result.hint,
      message: 'API key regenerated successfully',
      warning: 'Please update your applications with the new API key. The old key is now invalid.'
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Regenerate API key error:', error);
    return NextResponse.json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      ),
      { status: 500 }
    );
  }
}

/**
 * Other HTTP methods are not allowed
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