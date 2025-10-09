/**
 * Job Processing Diagnostic Test Endpoint
 * Tests SQS message polling, job processing, and queue status
 */

import { NextRequest, NextResponse } from 'next/server';

// Disable caching for debug endpoint
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const testResults = {
      timestamp: new Date().toISOString(),
      tests: {
        jobQueueService: {},
        jobQueueManager: {},
        sqsPolling: {},
        queueInspection: {}
      }
    };

    // Test 1: Job Queue Service
    try {
      const { jobQueue, JobPriority } = await import('@/lib/services/job-queue');

      testResults.tests.jobQueueService = {
        loaded: true,
        hasReceiveJobsMethod: typeof jobQueue.receiveJobs === 'function',
        hasValidateConnectivityMethod: typeof jobQueue.validateStartupConnectivity === 'function'
      };

      // Test SQS connectivity
      try {
        await jobQueue.validateStartupConnectivity();
        testResults.tests.jobQueueService.connectivityTest = 'success';
      } catch (connError: any) {
        testResults.tests.jobQueueService.connectivityTest = `failed: ${connError.message}`;
      }

      // Test message polling for each priority
      testResults.tests.sqsPolling = {};
      const priorities = [JobPriority.CRITICAL, JobPriority.HIGH, JobPriority.NORMAL, JobPriority.LOW];

      for (const priority of priorities) {
        try {
          console.log(`[DEBUG] Testing ${priority} queue polling...`);

          // Test receiving jobs with a short wait (2 seconds max)
          const startTime = Date.now();
          const jobs = await jobQueue.receiveJobs(priority, 5); // Try to get up to 5 messages
          const duration = Date.now() - startTime;

          testResults.tests.sqsPolling[priority] = {
            status: 'success',
            messagesReceived: jobs.length,
            pollingDuration: `${duration}ms`,
            messages: jobs.map(({ job }) => ({
              id: job.id,
              type: job.type,
              priority: job.priority,
              createdAt: job.createdAt
            }))
          };

        } catch (pollingError: any) {
          testResults.tests.sqsPolling[priority] = {
            status: 'failed',
            error: pollingError.message,
            errorCode: pollingError.Code || pollingError.code,
            errorName: pollingError.name
          };
        }
      }

    } catch (serviceError: any) {
      testResults.tests.jobQueueService = {
        loaded: false,
        error: serviceError.message
      };
    }

    // Test 2: Job Queue Manager
    try {
      const { jobQueueManager } = await import('@/lib/services/job-processors');

      const status = jobQueueManager.getStatus();

      testResults.tests.jobQueueManager = {
        loaded: true,
        status: {
          running: status.running,
          queueCount: status.queueCount,
          currentlyProcessing: status.currentlyProcessing,
          maxConcurrentJobs: status.maxConcurrentJobs,
          memoryUsage: status.memoryUsage
        },
        methods: {
          hasGetStatus: typeof jobQueueManager.getStatus === 'function',
          hasStart: typeof jobQueueManager.start === 'function',
          hasStop: typeof jobQueueManager.stop === 'function'
        }
      };

      // Check if intervals are actually running
      if (status.queueCount === 0 && status.running) {
        testResults.tests.jobQueueManager.warning = 'Manager reports running but no active intervals detected';
      }

      // Check memory usage
      if (status.memoryUsage.utilization > 0.8) {
        testResults.tests.jobQueueManager.warning = `High memory usage: ${Math.round(status.memoryUsage.utilization * 100)}%`;
      }

    } catch (managerError: any) {
      testResults.tests.jobQueueManager = {
        loaded: false,
        error: managerError.message
      };
    }

    // Test 3: Queue Inspection via AWS SDK
    try {
      const { SQSClient, GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');

      const client = new SQSClient({
        region: process.env.DEFAULT_REGION || 'ap-southeast-1',
        credentials: {
          accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
        },
        maxAttempts: 2,
        requestTimeout: 5000
      });

      testResults.tests.queueInspection = {};

      const queueUrls = {
        critical: process.env.SQS_CRITICAL_QUEUE_URL,
        high: process.env.SQS_HIGH_QUEUE_URL,
        normal: process.env.SQS_NORMAL_QUEUE_URL,
        low: process.env.SQS_LOW_QUEUE_URL
      };

      for (const [priority, queueUrl] of Object.entries(queueUrls)) {
        if (!queueUrl) {
          testResults.tests.queueInspection[priority] = {
            status: 'missing',
            error: 'Queue URL not configured'
          };
          continue;
        }

        try {
          const command = new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: [
              'ApproximateNumberOfMessages',
              'ApproximateNumberOfMessagesNotVisible',
              'ApproximateNumberOfMessagesDelayed',
              'VisibilityTimeout',
              'MessageRetentionPeriod'
            ]
          });

          const response = await client.send(command);

          testResults.tests.queueInspection[priority] = {
            status: 'success',
            queueUrl,
            attributes: {
              messagesAvailable: parseInt(response.Attributes?.ApproximateNumberOfMessages || '0'),
              messagesInFlight: parseInt(response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0'),
              messagesDelayed: parseInt(response.Attributes?.ApproximateNumberOfMessagesDelayed || '0'),
              visibilityTimeout: parseInt(response.Attributes?.VisibilityTimeout || '0'),
              messageRetentionPeriod: parseInt(response.Attributes?.MessageRetentionPeriod || '0')
            }
          };

        } catch (queueError: any) {
          testResults.tests.queueInspection[priority] = {
            status: 'failed',
            queueUrl,
            error: queueError.message,
            errorCode: queueError.Code || queueError.code
          };
        }
      }

    } catch (inspectionError: any) {
      testResults.tests.queueInspection = {
        error: `Failed to load AWS SDK: ${inspectionError.message}`
      };
    }

    const response = NextResponse.json(testResults, { status: 200 });

    // Add cache prevention headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');

    return response;

  } catch (error: any) {
    console.error('[DEBUG JOB PROCESSING] Test error:', error);

    const errorResponse = NextResponse.json({
      error: error?.message || 'Job processing test failed',
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