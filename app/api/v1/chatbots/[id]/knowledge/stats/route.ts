import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import { AuthTokenService } from '@/lib/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * GET /api/v1/chatbots/{id}/knowledge/stats
 *
 * Get knowledge base usage statistics for a chatbot
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
    const timeframe = searchParams.get('timeframe') || '24h';

    // Get search analytics for this chatbot
    const analytics = await KnowledgeBaseService.getSearchAnalytics({
      timeframe: timeframe as any,
      chatbotId: params.id,
      includeFailedQueries: false,
      groupBy: 'day'
    });

    // Get knowledge base statistics
    const knowledgeStats = await KnowledgeBaseService.getKnowledgeBaseStats();

    // Format response with chatbot-specific data
    const stats = {
      chatbotId: params.id,
      timeframe,
      searchAnalytics: analytics,
      knowledgeBase: {
        totalDocuments: knowledgeStats.totalDocuments,
        totalChunks: knowledgeStats.totalChunks,
        documentsByCategory: knowledgeStats.documentsByCategory,
        processingStats: knowledgeStats.processingStats
      },
      generatedAt: new Date().toISOString()
    };

    return NextResponse.json(
      createSuccessResponse(stats, 'Knowledge base statistics retrieved successfully')
    );

  } catch (error) {
    console.error('Error in GET /api/v1/chatbots/{id}/knowledge/stats:', error);

    return NextResponse.json(
      createErrorResponse('Failed to get knowledge base statistics', 'STATS_ERROR'),
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