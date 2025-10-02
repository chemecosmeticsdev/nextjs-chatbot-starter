import { NextRequest, NextResponse } from 'next/server';
import { ConversationService } from '@/lib/services/conversation-service';
import { AuthTokenService } from '@/lib/auth';
import { validateMessageSend } from '@/lib/validation/conversation';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * POST /api/v1/conversations/{id}/messages
 *
 * Send a message and get AI response
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

    const rawBody = await request.json();

    // Validate message data
    const validatedRequest = validateMessageSend(rawBody);

    // Send message and get response
    const { userMessage, assistantMessage } = await ConversationService.sendMessage(
      params.id,
      validatedRequest,
      user.id
    );

    return NextResponse.json(
      createSuccessResponse(
        {
          userMessage,
          assistantMessage,
          conversationId: params.id
        },
        'Message processed successfully'
      ),
      { status: 201 }
    );

  } catch (error) {
    console.error('Error in POST /api/v1/conversations/{id}/messages:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid message data', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        createErrorResponse('Conversation not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('technical difficulties')) {
      return NextResponse.json(
        createErrorResponse('AI service temporarily unavailable', 'SERVICE_UNAVAILABLE'),
        { status: 503 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to process message', 'MESSAGE_ERROR'),
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