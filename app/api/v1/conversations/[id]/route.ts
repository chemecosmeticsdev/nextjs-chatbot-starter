import { NextRequest, NextResponse } from 'next/server';
import { ConversationService } from '@/lib/services/conversation-service';
import { AuthTokenService } from '@/lib/auth';
import { validateConversationUpdate } from '@/lib/validation/conversation';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/conversations/{id}
 *
 * Get conversation details and history
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

    const { searchParams } = new URL(request.url);
    const includeMessages = searchParams.get('include_messages') === 'true';

    // Get conversation
    const conversation = await ConversationService.getConversation(
      params.id,
      includeMessages
    );

    if (!conversation) {
      return NextResponse.json(
        createErrorResponse('Conversation not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      createSuccessResponse(conversation, 'Conversation retrieved successfully')
    );

  } catch (error) {
    console.error('Error in GET /api/v1/conversations/{id}:', error);

    return NextResponse.json(
      createErrorResponse('Failed to get conversation', 'CONVERSATION_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/conversations/{id}
 *
 * Update conversation metadata or end conversation
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

    const rawBody = await request.json();

    // Validate update data
    const validatedRequest = validateConversationUpdate(rawBody);

    // Update conversation
    const conversation = await ConversationService.updateConversation(
      params.id,
      validatedRequest
    );

    return NextResponse.json(
      createSuccessResponse(conversation, 'Conversation updated successfully')
    );

  } catch (error) {
    console.error('Error in PUT /api/v1/conversations/{id}:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid update data', 'VALIDATION_ERROR', {
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

    return NextResponse.json(
      createErrorResponse('Failed to update conversation', 'CONVERSATION_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/conversations/{id}
 *
 * End conversation session (soft delete)
 */
export async function DELETE(
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

    // Delete conversation
    await ConversationService.deleteConversation(params.id);

    return NextResponse.json(
      createSuccessResponse(null, 'Conversation ended successfully')
    );

  } catch (error) {
    console.error('Error in DELETE /api/v1/conversations/{id}:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        createErrorResponse('Conversation not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to end conversation', 'CONVERSATION_ERROR'),
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

export async function PATCH() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}