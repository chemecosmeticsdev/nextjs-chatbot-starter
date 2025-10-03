import { NextRequest, NextResponse } from 'next/server';
import { ComplianceLogger } from '@/lib/services/compliance-logger';
import { UserReportingService } from '@/lib/services/user-reporting';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';

export interface AnalyticsRequest {
  startDate: string;
  endDate: string;
  chatbotId?: string;
  reportType?: 'summary' | 'detailed' | 'compliance';
  format?: 'json' | 'csv';
}

/**
 * Admin moderation analytics and reporting
 * GET /api/v1/admin/moderation/analytics - Get analytics data
 * POST /api/v1/admin/moderation/analytics/export - Export compliance report
 */

/**
 * Get moderation analytics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const chatbotId = searchParams.get('chatbotId') || undefined;
    const reportType = searchParams.get('reportType') || 'summary';

    // Validate admin authentication
    const adminId = await validateAdminAuth(request);
    if (!adminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    // Validate date parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: startDate and endDate are required',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        {
          error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    if (start >= end) {
      return NextResponse.json(
        {
          error: 'Start date must be before end date',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Get analytics data based on report type
    let analyticsData;

    switch (reportType) {
      case 'compliance':
        analyticsData = await ComplianceLogger.generateComplianceReport(start, end, chatbotId);
        break;
      case 'detailed':
        analyticsData = await getDetailedAnalytics(start, end, chatbotId);
        break;
      case 'summary':
      default:
        analyticsData = await getSummaryAnalytics(start, end, chatbotId);
        break;
    }

    // Log the analytics access
    await AuditLogger.logSecurityEvent({
      userId: adminId,
      eventType: SecurityEventType.DATA_ACCESS,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/admin/moderation/analytics',
      method: 'GET',
      details: {
        action: 'analytics_accessed',
        reportType,
        startDate: startDate,
        endDate: endDate,
        chatbotId
      }
    });

    return NextResponse.json({
      reportType,
      timeframe: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      chatbotId,
      data: analyticsData,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get moderation analytics error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve analytics data',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Export compliance report
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: AnalyticsRequest = await request.json();

    // Validate admin authentication
    const adminId = await validateAdminAuth(request);
    if (!adminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!body.startDate || !body.endDate) {
      return NextResponse.json(
        {
          error: 'Missing required fields: startDate and endDate are required',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    const format = body.format || 'json';

    // Generate compliance report
    const report = await ComplianceLogger.generateComplianceReport(start, end, body.chatbotId);

    // Export in requested format
    let exportResult;
    if (format === 'csv') {
      exportResult = await ComplianceLogger.exportDataForCompliance('csv', start, end, body.chatbotId);
    } else {
      exportResult = {
        downloadUrl: null,
        data: report
      };
    }

    // Log the export
    await AuditLogger.logSecurityEvent({
      userId: adminId,
      eventType: SecurityEventType.DATA_EXPORT,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/admin/moderation/analytics',
      method: 'POST',
      details: {
        action: 'compliance_report_exported',
        format,
        startDate: body.startDate,
        endDate: body.endDate,
        chatbotId: body.chatbotId
      }
    });

    return NextResponse.json({
      success: true,
      format,
      timeframe: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      chatbotId: body.chatbotId,
      downloadUrl: exportResult.downloadUrl,
      data: format === 'json' ? exportResult.data : undefined,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Export compliance report error:', error);

    return NextResponse.json(
      {
        error: 'Failed to export compliance report',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Get summary analytics
 */
async function getSummaryAnalytics(
  startDate: Date,
  endDate: Date,
  chatbotId?: string
): Promise<any> {
  // Get reporting statistics
  const reportingStats = await UserReportingService.getReportingStats({
    startDate,
    endDate
  });

  return {
    overview: {
      totalReports: reportingStats.totalReports,
      totalAppeals: reportingStats.totalAppeals,
      appealSuccessRate: reportingStats.appealSuccessRate,
      averageReviewTime: reportingStats.averageReviewTime
    },
    reportsByCategory: reportingStats.reportsByCategory,
    topReportedChatbots: reportingStats.topReportedChatbots
  };
}

/**
 * Get detailed analytics
 */
async function getDetailedAnalytics(
  startDate: Date,
  endDate: Date,
  chatbotId?: string
): Promise<any> {
  // This would implement more detailed analytics
  // For now, return extended summary data
  const summary = await getSummaryAnalytics(startDate, endDate, chatbotId);

  return {
    ...summary,
    trends: {
      // Would implement trend analysis
      dailyReports: [],
      weeklyReports: [],
      monthlyReports: []
    },
    patterns: {
      // Would implement pattern analysis
      commonViolations: [],
      timeDistribution: {},
      userBehavior: {}
    }
  };
}

/**
 * Validate admin authentication
 * In production, this would check JWT token or session for admin role
 */
async function validateAdminAuth(request: NextRequest): Promise<string | null> {
  // Check for admin API key in headers
  const apiKey = request.headers.get('x-admin-api-key');
  if (apiKey === 'admin-dev-key') {
    return 'admin-user-id'; // Development only
  }

  // Check Authorization header for JWT
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // In production, verify JWT and check for admin role
    // For now, accept any Bearer token as admin
    return 'admin-from-jwt';
  }

  return null;
}