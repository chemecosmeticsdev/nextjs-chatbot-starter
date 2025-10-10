import { NextRequest, NextResponse } from 'next/server';

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: string;
  required: boolean;
}

interface ConfigCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  masked?: boolean;
}

/**
 * Health check endpoint for production configuration validation
 * GET /api/health - Basic health check
 * GET /api/health?detailed=true - Detailed health check with configuration validation
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detailed') === 'true';
  const includeSecrets = searchParams.get('secrets') === 'true' && process.env.NODE_ENV === 'development';

  try {
    const results: HealthCheckResult[] = [];

    // Basic service health
    results.push({
      service: 'api',
      status: 'healthy',
      details: 'API service is running',
      required: true
    });

    if (detailed) {
      // Configuration checks
      const configChecks: ConfigCheck[] = [
        // Database
        { name: 'DATABASE_URL', value: process.env.DATABASE_URL, required: true, masked: true },

        // AWS Configuration
        { name: 'BAWS_ACCESS_KEY_ID', value: process.env.BAWS_ACCESS_KEY_ID, required: true, masked: true },
        { name: 'BAWS_SECRET_ACCESS_KEY', value: process.env.BAWS_SECRET_ACCESS_KEY, required: true, masked: true },
        { name: 'DEFAULT_REGION', value: process.env.DEFAULT_REGION, required: true },
        { name: 'BEDROCK_REGION', value: process.env.BEDROCK_REGION, required: true },
        { name: 'AWS_ACCOUNT_ID', value: process.env.AWS_ACCOUNT_ID, required: true },

        // Step Functions
        { name: 'STEPFUNCTIONS_S3_BUCKET', value: process.env.STEPFUNCTIONS_S3_BUCKET, required: true },
        { name: 'STEPFUNCTIONS_STATE_MACHINE_ARN', value: process.env.STEPFUNCTIONS_STATE_MACHINE_ARN, required: false },

        // S3
        { name: 'S3_DOCUMENT_BUCKET', value: process.env.S3_DOCUMENT_BUCKET, required: true },

        // SQS
        { name: 'SQS_CRITICAL_QUEUE_URL', value: process.env.SQS_CRITICAL_QUEUE_URL, required: false },
        { name: 'SQS_HIGH_QUEUE_URL', value: process.env.SQS_HIGH_QUEUE_URL, required: false },
        { name: 'SQS_NORMAL_QUEUE_URL', value: process.env.SQS_NORMAL_QUEUE_URL, required: false },
        { name: 'SQS_LOW_QUEUE_URL', value: process.env.SQS_LOW_QUEUE_URL, required: false },

        // Cognito (REQUIRED for authentication)
        { name: 'COGNITO_USER_POOL_ID', value: process.env.COGNITO_USER_POOL_ID, required: true },
        { name: 'COGNITO_CLIENT_ID', value: process.env.COGNITO_CLIENT_ID, required: true },
        { name: 'COGNITO_REGION', value: process.env.COGNITO_REGION, required: true },

        // External APIs
        { name: 'MISTRAL_API_KEY', value: process.env.MISTRAL_API_KEY, required: false, masked: true },
        { name: 'GITHUB_PAT', value: process.env.GITHUB_PAT, required: false, masked: true },

        // App Configuration
        { name: 'NEXT_PUBLIC_APP_URL', value: process.env.NEXT_PUBLIC_APP_URL, required: true },
        { name: 'JWT_SECRET', value: process.env.JWT_SECRET, required: true, masked: true },
        { name: 'NEXT_PUBLIC_WS_URL', value: process.env.NEXT_PUBLIC_WS_URL, required: false },
      ];

      // Check database connectivity
      try {
        // Simple query to check database connection
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/health/database`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          results.push({
            service: 'database',
            status: 'healthy',
            details: 'Database connection successful',
            required: true
          });
        } else {
          results.push({
            service: 'database',
            status: 'unhealthy',
            details: 'Database connection failed',
            required: true
          });
        }
      } catch (error) {
        results.push({
          service: 'database',
          status: 'unhealthy',
          details: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          required: true
        });
      }

      // Validate environment configuration
      const missingRequired: string[] = [];
      const missingOptional: string[] = [];

      configChecks.forEach(check => {
        if (!check.value || check.value.trim() === '') {
          if (check.required) {
            missingRequired.push(check.name);
          } else {
            missingOptional.push(check.name);
          }
        }
      });

      // Configuration status
      if (missingRequired.length === 0) {
        results.push({
          service: 'configuration',
          status: missingOptional.length > 0 ? 'degraded' : 'healthy',
          details: missingOptional.length > 0
            ? `Some optional configuration missing: ${missingOptional.join(', ')}`
            : 'All required configuration present',
          required: true
        });
      } else {
        results.push({
          service: 'configuration',
          status: 'unhealthy',
          details: `Missing required configuration: ${missingRequired.join(', ')}`,
          required: true
        });
      }

      // AWS Step Functions check
      const stepFunctionsArn = process.env.STEPFUNCTIONS_STATE_MACHINE_ARN;
      if (stepFunctionsArn) {
        try {
          // Test AWS credentials and Step Functions access
          const testResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/health/step-functions`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });

          if (testResponse.ok) {
            results.push({
              service: 'step_functions',
              status: 'healthy',
              details: 'Step Functions service accessible',
              required: false
            });
          } else {
            results.push({
              service: 'step_functions',
              status: 'degraded',
              details: 'Step Functions service not accessible',
              required: false
            });
          }
        } catch (error) {
          results.push({
            service: 'step_functions',
            status: 'degraded',
            details: `Step Functions check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            required: false
          });
        }
      } else {
        results.push({
          service: 'step_functions',
          status: 'degraded',
          details: 'Step Functions not configured (STEPFUNCTIONS_STATE_MACHINE_ARN missing)',
          required: false
        });
      }

      // Include configuration details in development
      if (includeSecrets) {
        const configDetails = configChecks.map(check => ({
          name: check.name,
          value: check.value ? (check.masked ? '***REDACTED***' : check.value) : undefined,
          required: check.required,
          status: check.value ? 'present' : 'missing'
        }));

        return NextResponse.json({
          status: 'detailed',
          timestamp: new Date().toISOString(),
          results,
          configuration: configDetails,
          environment: process.env.NODE_ENV
        });
      }
    }

    // Determine overall status
    const hasUnhealthy = results.some(r => r.status === 'unhealthy' && r.required);
    const hasDegraded = results.some(r => r.status === 'degraded' && r.required);

    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    console.error('Health check error:', error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      results: [{
        service: 'health_check',
        status: 'unhealthy',
        details: 'Health check service error',
        required: true
      }]
    }, { status: 500 });
  }
}