/**
 * SQS Health Check API Endpoint
 * Provides real-time monitoring of SQS connectivity and job queue status
 * Also provides backup initialization of job queue manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { jobQueue } from '@/lib/services/job-queue';

interface SQSHealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  sqs: {
    isHealthy: boolean;
    lastHealthCheck: string;
    connectivity: {
      [priority: string]: {
        status: 'connected' | 'failed' | 'unknown';
        queueUrl?: string;
        lastTest?: string;
        error?: string;
      };
    };
  };
  jobQueue: {
    isRunning: boolean;
    autoStartAttempted?: boolean;
    autoStartSuccess?: boolean;
    initializationMethod?: 'instrumentation' | 'health-endpoint' | 'unknown';
    stats?: {
      totalProcessed: number;
      totalFailed: number;
      currentlyProcessing: number;
    };
  };
  environment: {
    region: string;
    credentials: 'configured' | 'missing';
    queueUrls: {
      [priority: string]: 'configured' | 'missing';
    };
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('[API] SQS health check requested');

    const healthData: SQSHealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      sqs: {
        isHealthy: false,
        lastHealthCheck: 'Never',
        connectivity: {}
      },
      jobQueue: {
        isRunning: false
      },
      environment: {
        region: process.env.DEFAULT_REGION || 'not-configured',
        credentials: (process.env.BAWS_ACCESS_KEY_ID && process.env.BAWS_SECRET_ACCESS_KEY) ? 'configured' : 'missing',
        queueUrls: {
          critical: process.env.SQS_CRITICAL_QUEUE_URL ? 'configured' : 'missing',
          high: process.env.SQS_HIGH_QUEUE_URL ? 'configured' : 'missing',
          normal: process.env.SQS_NORMAL_QUEUE_URL ? 'configured' : 'missing',
          low: process.env.SQS_LOW_QUEUE_URL ? 'configured' : 'missing'
        }
      }
    };

    // Test SQS connectivity in real-time
    try {
      console.log('[API] Testing SQS connectivity...');

      // Force a fresh health check
      await jobQueue.validateStartupConnectivity();

      // Get job queue health status (this is a simplified check)
      // Note: We're accessing private methods indirectly through the API
      const isHealthy = await testJobQueueHealth();

      healthData.sqs.isHealthy = isHealthy;
      healthData.sqs.lastHealthCheck = new Date().toISOString();

      // Test individual queue connectivity
      const priorities = ['critical', 'high', 'normal', 'low'];
      for (const priority of priorities) {
        const queueUrl = process.env[`SQS_${priority.toUpperCase()}_QUEUE_URL`];

        if (queueUrl) {
          try {
            // Test basic queue access
            await testQueueConnectivity(queueUrl, priority);
            healthData.sqs.connectivity[priority] = {
              status: 'connected',
              queueUrl,
              lastTest: new Date().toISOString()
            };
          } catch (error: any) {
            healthData.sqs.connectivity[priority] = {
              status: 'failed',
              queueUrl,
              lastTest: new Date().toISOString(),
              error: error?.message || 'Unknown error'
            };
            healthData.status = 'degraded';
          }
        } else {
          healthData.sqs.connectivity[priority] = {
            status: 'unknown',
            error: 'Queue URL not configured'
          };
          healthData.status = 'degraded';
        }
      }

      // Check and potentially start job queue manager (backup initialization)
      try {
        console.log('[API] Checking job queue manager status...');

        // Try to get the job queue manager instance
        const { jobQueueManager } = await import('@/lib/services/job-processors');

        // Check if job queue manager is running
        const isJobQueueRunning = await checkJobQueueManagerStatus(jobQueueManager);

        healthData.jobQueue.isRunning = isJobQueueRunning;

        if (!isJobQueueRunning) {
          console.log('[API] Job queue manager not running, attempting to start...');
          healthData.jobQueue.autoStartAttempted = true;

          try {
            await jobQueueManager.start();
            healthData.jobQueue.autoStartSuccess = true;
            healthData.jobQueue.isRunning = true;
            healthData.jobQueue.initializationMethod = 'health-endpoint';
            console.log('[API] Job queue manager started successfully via health endpoint');
          } catch (startError: any) {
            console.error('[API] Failed to start job queue manager:', startError);
            healthData.jobQueue.autoStartSuccess = false;
            healthData.status = 'degraded';
          }
        } else {
          healthData.jobQueue.initializationMethod = 'instrumentation';
          console.log('[API] Job queue manager already running');
        }

      } catch (jobQueueError: any) {
        console.error('[API] Job queue manager check failed:', jobQueueError);
        healthData.jobQueue.isRunning = false;
        healthData.status = 'degraded';
      }

      // Determine overall status
      if (!healthData.sqs.isHealthy) {
        healthData.status = 'unhealthy';
      }

      console.log('[API] SQS health check completed', { status: healthData.status });

    } catch (error: any) {
      console.error('[API] SQS health check failed:', error);

      healthData.status = 'unhealthy';
      healthData.sqs.isHealthy = false;
      healthData.sqs.lastHealthCheck = new Date().toISOString();
    }

    // Return appropriate HTTP status based on health
    const httpStatus = healthData.status === 'healthy' ? 200 :
                      healthData.status === 'degraded' ? 207 : 503;

    return NextResponse.json(healthData, { status: httpStatus });

  } catch (error: any) {
    console.error('[API] SQS health endpoint error:', error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error?.message || 'Health check failed',
      sqs: { isHealthy: false, lastHealthCheck: 'Failed' },
      jobQueue: { isRunning: false },
      environment: {
        region: process.env.DEFAULT_REGION || 'not-configured',
        credentials: 'unknown',
        queueUrls: {}
      }
    }, { status: 503 });
  }
}

/**
 * Check if job queue manager is actually running
 */
async function checkJobQueueManagerStatus(jobQueueManager: any): Promise<boolean> {
  try {
    // Check if the job queue manager has an isRunning method or property
    if (typeof jobQueueManager.isRunning === 'function') {
      return await jobQueueManager.isRunning();
    } else if (typeof jobQueueManager.isRunning === 'boolean') {
      return jobQueueManager.isRunning;
    }

    // Check if it has a status property
    if (jobQueueManager.status) {
      return jobQueueManager.status === 'running';
    }

    // If no clear status method, try to check if the manager has workers
    if (jobQueueManager.workers && Array.isArray(jobQueueManager.workers)) {
      return jobQueueManager.workers.length > 0;
    }

    // Fallback: assume it's not running if we can't determine status
    return false;
  } catch (error) {
    console.error('[checkJobQueueManagerStatus] Error checking status:', error);
    return false;
  }
}

/**
 * Test job queue health (simplified version)
 */
async function testJobQueueHealth(): Promise<boolean> {
  try {
    // This is a basic test - in production we might add more sophisticated checks
    return process.env.BAWS_ACCESS_KEY_ID &&
           process.env.BAWS_SECRET_ACCESS_KEY &&
           process.env.SQS_CRITICAL_QUEUE_URL &&
           process.env.SQS_HIGH_QUEUE_URL &&
           process.env.SQS_NORMAL_QUEUE_URL &&
           process.env.SQS_LOW_QUEUE_URL ? true : false;
  } catch {
    return false;
  }
}

/**
 * Test connectivity to a specific queue
 */
async function testQueueConnectivity(queueUrl: string, priority: string): Promise<void> {
  const { SQSClient, GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');

  const client = new SQSClient({
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
    },
    maxAttempts: 2, // Quick test
    requestTimeout: 5000 // 5 second timeout
  });

  const command = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['ApproximateNumberOfMessages']
  });

  await client.send(command);
}