import { NextRequest, NextResponse } from 'next/server';
import { ConversationService } from '@/lib/services/conversation-service';
import { AuthTokenService } from '@/lib/auth';
import { validateConversationQuery } from '@/lib/validation/conversation';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/chatbots/{id}/conversations
 *
 * List conversations for a specific chatbot
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

    // Parse query parameters
    const queryData = {
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      includeMessages: searchParams.get('include_messages') === 'true',
      integrationType: searchParams.get('integration_type') as any,
      isActive: searchParams.get('is_active') ? searchParams.get('is_active') === 'true' : undefined,
      dateRange: {
        from: searchParams.get('date_from') || undefined,
        to: searchParams.get('date_to') || undefined
      }
    };

    // Validate query parameters
    const validatedQuery = validateConversationQuery(queryData);

    // Get conversations
    const result = await ConversationService.listConversations(
      params.id,
      validatedQuery
    );

    return NextResponse.json(
      createSuccessResponse(
        {
          conversations: result.conversations,
          pagination: {
            total: result.total,
            limit: validatedQuery.limit,
            offset: validatedQuery.offset,
            hasMore: (validatedQuery.offset + validatedQuery.limit) < result.total
          }
        },
        'Conversations retrieved successfully'
      )
    );

  } catch (error) {
    console.error('Error in GET /api/v1/chatbots/{id}/conversations:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid query parameters', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to get conversations', 'CONVERSATION_ERROR'),
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