/**
 * Manual Job Processing Trigger Endpoint
 * Forces job processing for testing and debugging
 */

import { NextRequest, NextResponse } from 'next/server';

// Disable caching for debug endpoint
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const { priority, maxJobs = 5, startManager = false } = body;

    const result = {
      timestamp: new Date().toISOString(),
      requestedAction: {
        priority: priority || 'all',
        maxJobs,
        startManager
      },
      results: {}
    };

    // Import required services
    const { jobQueue, JobPriority } = await import('@/lib/services/job-queue');
    const { jobQueueManager } = await import('@/lib/services/job-processors');

    // Check if we should start the job queue manager first
    if (startManager) {
      try {
        const status = jobQueueManager.getStatus();

        if (!status.running) {
          console.log('[TRIGGER] Starting job queue manager...');
          await jobQueueManager.start();

          result.results.managerStart = {
            status: 'success',
            message: 'Job queue manager started',
            newStatus: jobQueueManager.getStatus()
          };
        } else {
          result.results.managerStart = {
            status: 'already_running',
            message: 'Job queue manager was already running',
            currentStatus: status
          };
        }
      } catch (startError: any) {
        result.results.managerStart = {
          status: 'failed',
          error: startError.message
        };
      }
    }

    // Get list of priorities to process
    const priorities = priority && priority !== 'all'
      ? [priority]
      : [JobPriority.CRITICAL, JobPriority.HIGH, JobPriority.NORMAL, JobPriority.LOW];

    result.results.jobProcessing = {};

    // Process jobs for each priority
    for (const priorityLevel of priorities) {
      try {
        console.log(`[TRIGGER] Processing ${priorityLevel} priority jobs...`);

        // Receive jobs from queue
        const jobs = await jobQueue.receiveJobs(priorityLevel, maxJobs);

        result.results.jobProcessing[priorityLevel] = {
          status: 'success',
          jobsFound: jobs.length,
          jobs: []
        };

        if (jobs.length === 0) {
          result.results.jobProcessing[priorityLevel].message = 'No jobs found in queue';
          continue;
        }

        // Process each job manually
        for (const { job, receiptHandle } of jobs) {
          try {
            console.log(`[TRIGGER] Processing job ${job.id} (type: ${job.type})`);

            // Find appropriate processor
            const processors = await import('@/lib/services/job-processors');
            const processor = [
              new processors.AIResponseProcessor(),
              new processors.EnhancedDocumentProcessingProcessor(),
              new processors.GoogleDriveProcessor(),
              new processors.DocumentProcessor(),
              new processors.AnalyticsProcessor()
            ].find(p => p.canProcess(job.type));

            if (!processor) {
              result.results.jobProcessing[priorityLevel].jobs.push({
                jobId: job.id,
                status: 'failed',
                error: 'No processor found for job type',
                jobType: job.type
              });

              // Complete job to remove from queue
              await jobQueue.completeJob(receiptHandle, priorityLevel);
              continue;
            }

            // Process the job
            await processor.process(job);

            // Complete job to remove from queue
            await jobQueue.completeJob(receiptHandle, priorityLevel);

            result.results.jobProcessing[priorityLevel].jobs.push({
              jobId: job.id,
              status: 'completed',
              jobType: job.type,
              processor: processor.constructor.name
            });

            console.log(`[TRIGGER] Successfully processed job ${job.id}`);

          } catch (jobError: any) {
            console.error(`[TRIGGER] Failed to process job ${job.id}:`, jobError);

            result.results.jobProcessing[priorityLevel].jobs.push({
              jobId: job.id,
              status: 'failed',
              error: jobError.message,
              jobType: job.type
            });

            // Still complete the job to prevent reprocessing
            try {
              await jobQueue.completeJob(receiptHandle, priorityLevel);
            } catch (completeError) {
              console.error(`[TRIGGER] Failed to complete failed job ${job.id}:`, completeError);
            }
          }
        }

      } catch (priorityError: any) {
        result.results.jobProcessing[priorityLevel] = {
          status: 'failed',
          error: priorityError.message
        };
      }
    }

    // Get final status
    try {
      result.results.finalStatus = {
        jobQueueManager: jobQueueManager.getStatus(),
        timestamp: new Date().toISOString()
      };
    } catch (statusError: any) {
      result.results.finalStatus = {
        error: statusError.message
      };
    }

    const response = NextResponse.json(result, { status: 200 });

    // Add cache prevention headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('Surrogate-Control', 'no-store');

    return response;

  } catch (error: any) {
    console.error('[TRIGGER] Manual job processing failed:', error);

    const errorResponse = NextResponse.json({
      error: error?.message || 'Manual job processing failed',
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  // GET request shows usage information
  const usage = {
    endpoint: '/api/debug/trigger-job-processing',
    method: 'POST',
    description: 'Manually trigger job processing for testing and debugging',
    parameters: {
      priority: 'Optional: "critical", "high", "normal", "low", or "all" (default: "all")',
      maxJobs: 'Optional: Maximum number of jobs to process per priority (default: 5)',
      startManager: 'Optional: Whether to start the job queue manager first (default: false)'
    },
    examples: [
      {
        description: 'Process all jobs in all queues',
        request: 'POST /api/debug/trigger-job-processing',
        body: '{}'
      },
      {
        description: 'Process only critical priority jobs',
        request: 'POST /api/debug/trigger-job-processing',
        body: '{ "priority": "critical", "maxJobs": 3 }'
      },
      {
        description: 'Start manager and process all jobs',
        request: 'POST /api/debug/trigger-job-processing',
        body: '{ "startManager": true }'
      }
    ]
  };

  return NextResponse.json(usage, { status: 200 });
}