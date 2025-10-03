import { NextRequest, NextResponse } from 'next/server';
import { ConversationService } from '@/lib/services/conversation-service';
import { AuthTokenService } from '@/lib/auth';
import { validateConversationCreate } from '@/lib/validation/conversation';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * POST /api/v1/conversations
 *
 * Create a new conversation session
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const rawBody = await request.json();

    // Validate conversation creation data
    const validatedRequest = validateConversationCreate(rawBody);

    // Create conversation
    const conversation = await ConversationService.createConversation(
      validatedRequest,
      user.id
    );

    return NextResponse.json(
      createSuccessResponse(conversation, 'Conversation created successfully'),
      { status: 201 }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/conversations:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid conversation data', 'VALIDATION_ERROR', {
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
      createErrorResponse('Failed to create conversation', 'CONVERSATION_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/conversations
 *
 * List conversations with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const status = searchParams.get('status'); // active, ended, etc.

    // Get conversations from the service
    const conversations = await ConversationService.getConversations({
      userId: user.id,
      limit,
      status,
    });

    return NextResponse.json(
      createSuccessResponse(conversations, 'Conversations retrieved successfully'),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in GET /api/v1/conversations:', error);

    return NextResponse.json(
      createErrorResponse('Failed to retrieve conversations', 'CONVERSATION_ERROR'),
      { status: 500 }
    );
  }
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