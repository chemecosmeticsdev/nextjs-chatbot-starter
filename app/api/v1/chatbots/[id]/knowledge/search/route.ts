import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import { ActivityTracker } from '@/lib/services/activity-tracker';
import { AuthTokenService } from '@/lib/auth';
import { validateKnowledgeBaseSearch } from '@/lib/validation/knowledge-base';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * POST /api/v1/chatbots/{id}/knowledge/search
 *
 * Search knowledge base with chatbot-specific filters and tracking
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

    // Validate search request
    const validatedRequest = validateKnowledgeBaseSearch(rawBody);

    const startTime = Date.now();

    // Perform vector search
    const searchResult = await KnowledgeBaseService.vectorSearch(validatedRequest);

    const searchTime = Date.now() - startTime;

    // Log search for analytics (if session ID provided)
    const sessionId = request.headers.get('x-session-id');
    if (sessionId) {
      try {
        await KnowledgeBaseService.logSearchQuery(
          user.id,
          validatedRequest.query,
          validatedRequest.filters,
          searchResult.results.length,
          searchTime,
          sessionId,
          'chatbot-api'
        );

        // Track with ActivityTracker
        await ActivityTracker.trackKnowledgeSearch(
          sessionId,
          validatedRequest.query,
          searchResult.results.length,
          searchTime
        );
      } catch (error) {
        console.warn('Failed to log search analytics:', error);
      }
    }

    return NextResponse.json(
      createSuccessResponse(
        {
          ...searchResult,
          searchTime,
          chatbotId: params.id
        },
        'Knowledge base search completed successfully'
      )
    );

  } catch (error) {
    console.error('Error in POST /api/v1/chatbots/{id}/knowledge/search:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid search request', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Knowledge base search failed', 'SEARCH_ERROR'),
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