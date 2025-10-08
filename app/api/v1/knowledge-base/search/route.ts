import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import {
  adaptiveKnowledgeBaseSearchSchema,
  type AdaptiveKnowledgeBaseSearchRequest,
  type KnowledgeBaseSearchResponse
} from '@/lib/validation/knowledge-base';
import { formatValidationErrors } from '@/lib/validation/common';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/knowledge-base/search
 *
 * Perform vector similarity search across document chunks
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Parse and validate request body
    let searchParams: AdaptiveKnowledgeBaseSearchRequest;
    try {
      const rawBody = await request.json();
      searchParams = adaptiveKnowledgeBaseSearchSchema.parse(rawBody);
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

    // Get client IP and session for analytics
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';
    const sessionId = request.headers.get('x-session-id') || undefined;

    // Perform enhanced adaptive vector search
    const searchStartTime = Date.now();
    let searchResult;
    let searchMethod = 'vector';
    let thresholdUsed = searchParams.threshold;

    try {
      if (searchParams.enableAdaptiveThreshold) {
        // Use adaptive search with dynamic threshold selection
        const { AdaptiveSearchService } = await import('@/lib/services/adaptive-search');
        const adaptiveParams = {
          query: searchParams.query,
          limit: searchParams.limit,
          baseThreshold: searchParams.threshold,
          enableFallback: searchParams.enableFallback,
          maxFallbackAttempts: searchParams.maxFallbackAttempts,
          minimumResults: searchParams.minimumResults,
          filters: searchParams.filters || {},
          includeContent: searchParams.includeContent,
          cacheResults: searchParams.cacheResults
        };

        const adaptiveResult = await AdaptiveSearchService.adaptiveSearch(adaptiveParams);
        searchResult = {
          results: adaptiveResult.results,
          searchTime: Date.now() - searchStartTime,
          cached: adaptiveResult.cached || false
        };
        searchMethod = adaptiveResult.searchMethod || 'adaptive';
        thresholdUsed = adaptiveResult.thresholdUsed || searchParams.threshold;
      } else {
        // Use basic vector search
        searchResult = await KnowledgeBaseService.vectorSearch(searchParams);
        searchMethod = 'vector';
      }
    } catch (error) {
      console.error('Enhanced search failed, falling back to basic vector search:', error);
      // Fallback to basic vector search if enhanced search fails
      searchResult = await KnowledgeBaseService.vectorSearch(searchParams);
      searchMethod = 'vector_fallback';
    }

    // Log search query for analytics
    await KnowledgeBaseService.logSearchQuery(
      user.id,
      searchParams.query,
      searchParams.filters || {},
      searchResult.results.length,
      searchResult.searchTime,
      sessionId,
      clientIP
    );

    // Log search for audit purposes
    console.log(
      `Knowledge base search - User: ${user.id}, Query: "${searchParams.query}", ` +
      `Method: ${searchMethod}, Threshold: ${thresholdUsed}, ` +
      `Results: ${searchResult.results.length}, Time: ${searchResult.searchTime}ms, ` +
      `Cached: ${searchResult.cached}`
    );

    const response: KnowledgeBaseSearchResponse = {
      success: true,
      data: {
        query: searchParams.query,
        results: searchResult.results,
        totalResults: searchResult.results.length,
        searchTime: searchResult.searchTime,
        cached: searchResult.cached,
        filters: searchParams.filters,
        searchMethod,
        thresholdUsed
      }
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Error performing knowledge base search:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/knowledge-base/search
 *
 * Get search suggestions or recent queries
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'recent'; // 'recent' or 'suggestions'
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (type === 'recent') {
      // Get recent search queries for this user
      const recentQueries = await KnowledgeBaseService.getRecentQueries(user.id, limit);

      return NextResponse.json(
        createSuccessResponse({
          type: 'recent_queries',
          queries: recentQueries
        }),
        { status: 200 }
      );
    } else if (type === 'suggestions') {
      // Get search suggestions based on popular queries
      const suggestions = await KnowledgeBaseService.getSearchSuggestions(limit);

      return NextResponse.json(
        createSuccessResponse({
          type: 'suggestions',
          suggestions: suggestions
        }),
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        createErrorResponse('Invalid type parameter', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error getting search data:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
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