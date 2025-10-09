/**
 * SQS Configuration Test Endpoint
 * Tests actual SQS configuration and connectivity
 */

import { NextRequest, NextResponse } from 'next/server';

// Disable caching for debug endpoint
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        region: process.env.DEFAULT_REGION,
        hasAwsCredentials: !!(process.env.BAWS_ACCESS_KEY_ID && process.env.BAWS_SECRET_ACCESS_KEY),
      },
      sqsEnvironmentVariables: {
        critical: {
          queue: process.env.SQS_CRITICAL_QUEUE_URL || 'MISSING',
          dlq: process.env.SQS_CRITICAL_DLQ_URL || 'MISSING'
        },
        high: {
          queue: process.env.SQS_HIGH_QUEUE_URL || 'MISSING',
          dlq: process.env.SQS_HIGH_DLQ_URL || 'MISSING'
        },
        normal: {
          queue: process.env.SQS_NORMAL_QUEUE_URL || 'MISSING',
          dlq: process.env.SQS_NORMAL_DLQ_URL || 'MISSING'
        },
        low: {
          queue: process.env.SQS_LOW_QUEUE_URL || 'MISSING',
          dlq: process.env.SQS_LOW_DLQ_URL || 'MISSING'
        }
      }
    };

    // Test job queue configuration
    try {
      const { jobQueue } = await import('@/lib/services/job-queue');

      // Test basic queue operations
      const testResults = {
        queueServiceLoaded: true,
        connectivityTest: 'pending'
      };

      try {
        // Test SQS connectivity validation
        await jobQueue.validateStartupConnectivity();
        testResults.connectivityTest = 'success';
      } catch (connError: any) {
        testResults.connectivityTest = `failed: ${connError.message}`;
      }

      debugInfo.jobQueueTest = testResults;

    } catch (importError: any) {
      debugInfo.jobQueueTest = {
        queueServiceLoaded: false,
        error: importError.message
      };
    }

    // Test job queue manager
    try {
      const { jobQueueManager } = await import('@/lib/services/job-processors');

      debugInfo.jobQueueManager = {
        loaded: true,
        isRunning: typeof jobQueueManager.isRunning === 'function'
          ? await jobQueueManager.isRunning()
          : jobQueueManager.isRunning || false
      };

    } catch (managerError: any) {
      debugInfo.jobQueueManager = {
        loaded: false,
        error: managerError.message
      };
    }

    const response = NextResponse.json(debugInfo, { status: 200 });

    // Add cache prevention headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');

    return response;

  } catch (error: any) {
    console.error('[DEBUG SQS] Test error:', error);

    const errorResponse = NextResponse.json({
      error: error?.message || 'SQS test failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });

    // Add cache prevention headers to error response too
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    errorResponse.headers.set('Pragma', 'no-cache');
    errorResponse.headers.set('Expires', '0');
    errorResponse.headers.set('Surrogate-Control', 'no-store');

    return errorResponse;
  }
}