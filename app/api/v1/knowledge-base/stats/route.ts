import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import {
  knowledgeBaseStatsSchema,
  searchAnalyticsSchema,
  type KnowledgeBaseStatsRequest,
  type SearchAnalyticsRequest
} from '@/lib/validation/knowledge-base';
import { formatValidationErrors } from '@/lib/validation/common';

/**
 * GET /api/v1/knowledge-base/stats
 *
 * Get knowledge base statistics and analytics
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
    const type = searchParams.get('type') || 'general';

    if (type === 'general') {
      // Get general knowledge base statistics
      let statsParams: KnowledgeBaseStatsRequest = {};

      try {
        const fromDate = searchParams.get('from_date');
        const toDate = searchParams.get('to_date');
        const groupBy = searchParams.get('group_by') as any;

        if (fromDate || toDate || groupBy) {
          statsParams = knowledgeBaseStatsSchema.parse({
            dateRange: fromDate || toDate ? {
              from: fromDate ? new Date(fromDate).toISOString() : undefined,
              to: toDate ? new Date(toDate).toISOString() : undefined
            } : undefined,
            groupBy
          });
        }
      } catch (error) {
        return NextResponse.json(
          createErrorResponse(
            'Invalid parameters',
            'VALIDATION_ERROR',
            formatValidationErrors(error)
          ),
          { status: 400 }
        );
      }

      const dateRange = statsParams.dateRange ? {
        from: statsParams.dateRange.from ? new Date(statsParams.dateRange.from) : undefined,
        to: statsParams.dateRange.to ? new Date(statsParams.dateRange.to) : undefined
      } : undefined;

      const stats = await KnowledgeBaseService.getKnowledgeBaseStats(dateRange);

      return NextResponse.json(
        createSuccessResponse({
          type: 'general_stats',
          stats,
          generatedAt: new Date()
        }),
        { status: 200 }
      );

    } else if (type === 'search') {
      // Get search performance analytics
      let analyticsParams: SearchAnalyticsRequest = {};

      try {
        const timeframe = searchParams.get('timeframe') as any;
        const chatbotId = searchParams.get('chatbot_id');
        const includeFailedQueries = searchParams.get('include_failed') === 'true';
        const groupBy = searchParams.get('group_by') as any;

        analyticsParams = searchAnalyticsSchema.parse({
          timeframe,
          chatbotId,
          includeFailedQueries,
          groupBy
        });
      } catch (error) {
        return NextResponse.json(
          createErrorResponse(
            'Invalid parameters',
            'VALIDATION_ERROR',
            formatValidationErrors(error)
          ),
          { status: 400 }
        );
      }

      const analytics = await KnowledgeBaseService.getSearchPerformanceMetrics(
        analyticsParams.timeframe,
        analyticsParams.chatbotId || undefined
      );

      return NextResponse.json(
        createSuccessResponse({
          type: 'search_analytics',
          analytics,
          timeframe: analyticsParams.timeframe,
          generatedAt: new Date()
        }),
        { status: 200 }
      );

    } else if (type === 'processing') {
      // Get document processing status overview
      const processingStats = await getProcessingOverview();

      return NextResponse.json(
        createSuccessResponse({
          type: 'processing_overview',
          processing: processingStats,
          generatedAt: new Date()
        }),
        { status: 200 }
      );

    } else {
      return NextResponse.json(
        createErrorResponse('Invalid stats type', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error getting knowledge base stats:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/knowledge-base/stats
 *
 * Generate custom analytics report
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

    // Check admin permissions for custom reports
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions for custom reports', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    let reportParams: any;
    try {
      reportParams = await request.json();
    } catch (error) {
      return NextResponse.json(
        createErrorResponse('Invalid JSON in request body', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Generate custom report based on parameters
    const report = await generateCustomReport(reportParams);

    // Log report generation
    console.log(
      `Custom analytics report generated - User: ${user.id}, ` +
      `Type: ${reportParams.type || 'unknown'}, Parameters: ${JSON.stringify(reportParams)}`
    );

    return NextResponse.json(
      createSuccessResponse({
        report,
        parameters: reportParams,
        generatedBy: user.id,
        generatedAt: new Date()
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error generating custom report:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/knowledge-base/stats
 *
 * Clear cache and regenerate statistics
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check admin permissions
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions to clear cache', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'search_cache';

    if (type === 'search_cache') {
      // Clear expired search cache
      const clearedCount = await KnowledgeBaseService.clearExpiredCache();

      // Log cache clearing
      console.log(`Search cache cleared - User: ${user.id}, Entries cleared: ${clearedCount}`);

      return NextResponse.json(
        createSuccessResponse({
          message: 'Search cache cleared successfully',
          entriesCleared: clearedCount
        }),
        { status: 200 }
      );

    } else {
      return NextResponse.json(
        createErrorResponse('Invalid cache type', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Get processing overview statistics
 */
async function getProcessingOverview(): Promise<any> {
  try {
    // Get current processing status
    const stats = await KnowledgeBaseService.getKnowledgeBaseStats();

    // Get recent processing activity (last 24 hours)
    const recentActivity = await getRecentProcessingActivity();

    return {
      currentStatus: stats.processingStats,
      recentActivity,
      totalDocuments: stats.totalDocuments,
      totalChunks: stats.totalChunks,
      avgChunksPerDocument: stats.avgChunksPerDocument
    };
  } catch (error) {
    console.error('Error getting processing overview:', error);
    return {
      currentStatus: { pending: 0, processing: 0, completed: 0, failed: 0 },
      recentActivity: [],
      totalDocuments: 0,
      totalChunks: 0,
      avgChunksPerDocument: 0
    };
  }
}

/**
 * Get recent processing activity
 */
async function getRecentProcessingActivity(): Promise<any[]> {
  try {
    // This would require activity logs or processing timestamps
    // For now, return empty array as placeholder
    return [];
  } catch (error) {
    console.error('Error getting recent processing activity:', error);
    return [];
  }
}

/**
 * Generate custom analytics report
 */
async function generateCustomReport(params: any): Promise<any> {
  try {
    const reportType = params.type || 'general';
    const dateRange = params.dateRange;

    switch (reportType) {
      case 'usage_trends':
        return await generateUsageTrendsReport(dateRange);
      case 'performance_analysis':
        return await generatePerformanceReport(dateRange);
      case 'content_analysis':
        return await generateContentAnalysisReport(dateRange);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  } catch (error) {
    console.error('Error generating custom report:', error);
    return {
      error: 'Failed to generate report',
      type: params.type || 'unknown'
    };
  }
}

/**
 * Generate usage trends report
 */
async function generateUsageTrendsReport(dateRange?: any): Promise<any> {
  // Placeholder implementation
  return {
    type: 'usage_trends',
    summary: 'Usage trends analysis would be implemented here',
    dateRange
  };
}

/**
 * Generate performance analysis report
 */
async function generatePerformanceReport(dateRange?: any): Promise<any> {
  // Placeholder implementation
  return {
    type: 'performance_analysis',
    summary: 'Performance analysis would be implemented here',
    dateRange
  };
}

/**
 * Generate content analysis report
 */
async function generateContentAnalysisReport(dateRange?: any): Promise<any> {
  // Placeholder implementation
  return {
    type: 'content_analysis',
    summary: 'Content analysis would be implemented here',
    dateRange
  };
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

export async function PATCH() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}