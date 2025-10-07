import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';

/**
 * GET /api/v1/chatbots/[id]/prompt/history
 *
 * Get prompt version history for a chatbot
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        createErrorResponse('Invalid pagination parameters', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Get prompt history
    const promptHistory = await ChatbotService.getPromptHistory(chatbotId, {
      page,
      limit
    });

    return NextResponse.json(
      createSuccessResponse({
        history: promptHistory.prompts,
        pagination: promptHistory.pagination
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting prompt history:', error);
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