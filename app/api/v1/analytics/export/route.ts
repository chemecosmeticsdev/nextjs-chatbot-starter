import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/lib/services/analytics';
import { AuthTokenService } from '@/lib/auth';
import { validateExportRequest } from '@/lib/validation/analytics';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * POST /api/v1/analytics/export
 *
 * Export analytics data in various formats
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

    // Check user permissions (admin or super_admin required)
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const rawBody = await request.json();

    // Validate export request data
    const validatedRequest = validateExportRequest(rawBody);

    // Check for data privacy settings
    if (validatedRequest.filters.includePersonalData && user.role !== 'super_admin') {
      return NextResponse.json(
        createErrorResponse('Super admin permissions required for personal data export', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Export analytics data
    const exportResult = await AnalyticsService.exportAnalyticsData(validatedRequest);

    return NextResponse.json(
      createSuccessResponse(exportResult, 'Analytics data export initiated successfully'),
      { status: 202 } // Accepted - processing async
    );

  } catch (error) {
    console.error('Error in POST /api/v1/analytics/export:', error);

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        createErrorResponse('Invalid export request data', 'VALIDATION_ERROR', {
          details: error.message
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to initiate analytics data export', 'EXPORT_ERROR'),
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