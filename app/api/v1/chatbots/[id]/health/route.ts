import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { ChatbotService } from '@/lib/db/chatbot-service';
import {
  validateChatbotId,
  formatValidationError,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/validation/chatbot';
import { z } from 'zod';

/**
 * GET /api/v1/chatbots/[id]/health
 * Get chatbot health status and metrics
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

    // Validate chatbot ID
    let validatedParams;
    try {
      validatedParams = validateChatbotId(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      validatedParams.id,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse(
          'Access denied to this chatbot',
          'FORBIDDEN'
        ),
        { status: 403 }
      );
    }

    // Get chatbot health metrics
    const healthData = await ChatbotService.getChatbotHealth(validatedParams.id);

    if (!healthData) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Additional health checks
    const healthChecks = {
      database: await performDatabaseHealthCheck(),
      configuration: await performConfigurationHealthCheck(validatedParams.id),
      api: await performApiHealthCheck()
    };

    // Determine overall health status
    const overallStatus = determineOverallHealth(healthData.status, healthChecks);

    // Build comprehensive health response
    const response = createSuccessResponse({
      status: overallStatus,
      chatbotStatus: healthData.status,
      metrics: healthData.metrics,
      healthChecks,
      timestamp: new Date().toISOString(),
      summary: generateHealthSummary(overallStatus, healthData.metrics, healthChecks)
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Get chatbot health API error:', error);

    // Return error health status
    const errorResponse = createSuccessResponse({
      status: 'error' as const,
      chatbotStatus: 'error' as const,
      metrics: {
        uptime: 0,
        responseTime: 0,
        errorRate: 100,
        totalRequests: 0,
        lastRequest: null
      },
      healthChecks: {
        database: false,
        configuration: false,
        api: false
      },
      timestamp: new Date().toISOString(),
      summary: 'Health check failed due to internal error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * Perform database connectivity health check
 */
async function performDatabaseHealthCheck(): Promise<boolean> {
  try {
    // Simple database query to check connectivity
    const result = await ChatbotService.listChatbots({ limit: 1 });
    return result.pagination.total >= 0; // Even 0 results indicate successful connection
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Perform configuration health check for specific chatbot
 */
async function performConfigurationHealthCheck(chatbotId: string): Promise<boolean> {
  try {
    const chatbot = await ChatbotService.getChatbotById(chatbotId);
    if (!chatbot) return false;

    // Check if configuration is valid
    const config = chatbot.configuration as any;
    const required = ['model', 'temperature', 'maxTokens'];

    return required.every(field => config[field] !== undefined && config[field] !== null);
  } catch (error) {
    console.error('Configuration health check failed:', error);
    return false;
  }
}

/**
 * Perform API health check
 */
async function performApiHealthCheck(): Promise<boolean> {
  try {
    // Check if the API server is responding properly
    // This is a simple check - in production you might want to check external dependencies
    return true;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}

/**
 * Determine overall health status based on individual checks
 */
function determineOverallHealth(
  chatbotStatus: 'healthy' | 'warning' | 'error',
  healthChecks: { database: boolean; configuration: boolean; api: boolean }
): 'healthy' | 'warning' | 'error' {
  // If any critical check fails, overall status is error
  if (!healthChecks.database || !healthChecks.api) {
    return 'error';
  }

  // If configuration check fails or chatbot status is error, return error
  if (!healthChecks.configuration || chatbotStatus === 'error') {
    return 'error';
  }

  // If chatbot status is warning, return warning
  if (chatbotStatus === 'warning') {
    return 'warning';
  }

  // All checks pass
  return 'healthy';
}

/**
 * Generate human-readable health summary
 */
function generateHealthSummary(
  status: 'healthy' | 'warning' | 'error',
  metrics: any,
  healthChecks: { database: boolean; configuration: boolean; api: boolean }
): string {
  if (status === 'healthy') {
    return `Chatbot is running normally. Response time: ${metrics.responseTime}ms, Error rate: ${metrics.errorRate}%`;
  }

  if (status === 'warning') {
    const issues = [];
    if (metrics.errorRate > 5) issues.push('High error rate');
    if (metrics.responseTime > 1000) issues.push('Slow response time');
    return `Chatbot has minor issues: ${issues.join(', ')}`;
  }

  // Error status
  const failures = [];
  if (!healthChecks.database) failures.push('Database connection');
  if (!healthChecks.configuration) failures.push('Configuration');
  if (!healthChecks.api) failures.push('API server');

  return `Chatbot is experiencing critical issues: ${failures.join(', ')} failed`;
}

/**
 * Other HTTP methods are not allowed
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