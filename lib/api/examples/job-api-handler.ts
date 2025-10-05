import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, CommonSchemas, ErrorCodes, ApiError, type ApiContext } from '../handler';
import { jobQueue, JobFactory, JobType, JobPriority, type Job } from '@/lib/services/job-queue';

// POST /api/jobs/ai-response
export const queueAIResponseHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      body: z.object({
        conversationId: z.string().uuid(),
        chatbotId: z.string().uuid(),
        priority: z.nativeEnum(JobPriority).default(JobPriority.HIGH),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 30, // 30 AI response requests per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { conversationId, chatbotId, priority } = context.validatedBody;

    try {
      // Create AI response generation job
      const job = JobFactory.aiResponse(conversationId, chatbotId, priority);
      const jobId = await jobQueue.addJob(job);

      return {
        jobId,
        message: 'AI response generation queued successfully',
        estimatedTime: priority === JobPriority.CRITICAL ? '10-30 seconds' :
                      priority === JobPriority.HIGH ? '30-60 seconds' : '1-5 minutes'
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to queue AI response: ${error.message}`
      );
    }
  }
);

// POST /api/jobs/document-processing
export const queueDocumentProcessingHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      body: z.object({
        documentId: z.string().uuid(),
        priority: z.nativeEnum(JobPriority).default(JobPriority.NORMAL),
        options: z.object({
          extractText: z.boolean().default(true),
          createEmbeddings: z.boolean().default(true),
          updateSearchIndex: z.boolean().default(true),
        }).optional(),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 300000, // 5 minutes
      max: 10, // 10 document processing requests per 5 minutes
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { documentId, priority, options } = context.validatedBody;

    try {
      // Create document processing job
      const job = JobFactory.documentProcessing(documentId, context.userId, priority);

      // Add processing options to payload
      if (options) {
        job.payload.options = options;
      }

      const jobId = await jobQueue.addJob(job);

      return {
        jobId,
        message: 'Document processing queued successfully',
        options,
        estimatedTime: '2-10 minutes depending on document size'
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to queue document processing: ${error.message}`
      );
    }
  }
);

// POST /api/jobs/batch-analytics
export const queueBatchAnalyticsHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      body: z.object({
        chatbotIds: z.array(z.string().uuid()).min(1).max(50),
        analyticsTypes: z.array(z.nativeEnum(JobType)).refine(
          types => types.every(type => [
            JobType.CONVERSATION_ANALYTICS,
            JobType.DASHBOARD_METRICS_UPDATE,
            JobType.USAGE_STATS_CALCULATION
          ].includes(type)),
          'Invalid analytics job type'
        ),
        priority: z.nativeEnum(JobPriority).default(JobPriority.LOW),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 600000, // 10 minutes
      max: 5, // 5 batch analytics requests per 10 minutes
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotIds, analyticsTypes, priority } = context.validatedBody;

    try {
      const jobs: Array<Omit<Job, 'id'>> = [];

      // Create jobs for each combination of chatbot and analytics type
      for (const chatbotId of chatbotIds) {
        for (const analyticsType of analyticsTypes) {
          jobs.push({
            type: analyticsType,
            priority,
            payload: { chatbotId },
            metadata: {
              chatbotId,
              userId: context.userId,
              batchId: `batch_${Date.now()}`
            }
          });
        }
      }

      // Queue all jobs as a batch
      const jobIds = await jobQueue.addJobBatch(jobs);

      return {
        jobIds,
        totalJobs: jobs.length,
        message: `${jobs.length} analytics jobs queued successfully`,
        estimatedTime: '10-30 minutes for full batch completion'
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to queue batch analytics: ${error.message}`
      );
    }
  }
);

// POST /api/jobs/schedule
export const scheduleJobHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      body: z.object({
        jobType: z.nativeEnum(JobType),
        priority: z.nativeEnum(JobPriority).default(JobPriority.NORMAL),
        scheduledFor: z.string().datetime(),
        payload: z.record(z.any()),
        metadata: z.record(z.any()).optional(),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 300000, // 5 minutes
      max: 20, // 20 scheduled jobs per 5 minutes
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { jobType, priority, scheduledFor, payload, metadata } = context.validatedBody;

    try {
      const scheduledDate = new Date(scheduledFor);
      const now = new Date();

      // Validate scheduled time
      if (scheduledDate <= now) {
        throw new ApiError(
          ErrorCodes.VALIDATION_ERROR,
          'Scheduled time must be in the future'
        );
      }

      // Limit how far in the future we can schedule (max 30 days)
      const maxFuture = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (scheduledDate > maxFuture) {
        throw new ApiError(
          ErrorCodes.VALIDATION_ERROR,
          'Cannot schedule jobs more than 30 days in the future'
        );
      }

      const job = {
        type: jobType,
        priority,
        payload,
        metadata: {
          ...metadata,
          userId: context.userId,
          scheduledBy: context.userId
        }
      };

      const jobId = await jobQueue.scheduleJob(job, scheduledDate);

      return {
        jobId,
        scheduledFor: scheduledDate.toISOString(),
        message: 'Job scheduled successfully'
      };

    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to schedule job: ${error.message}`
      );
    }
  }
);

// GET /api/jobs/[jobId]
export const getJobStatusHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: z.object({
        jobId: z.string().min(1),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 10, // 10 seconds for frequently changing job status
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 100, // 100 status checks per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { jobId } = context.validatedParams;

    try {
      const status = await jobQueue.getJobStatus(jobId);

      if (status.status === 'not_found') {
        throw new ApiError(
          ErrorCodes.NOT_FOUND,
          `Job with ID ${jobId} not found`
        );
      }

      return {
        jobId,
        ...status,
        // Add user-friendly status messages
        statusMessage: this.getStatusMessage(status.status, status.progress)
      };

    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get job status: ${error.message}`
      );
    }
  }
);

// DELETE /api/jobs/[jobId]
export const cancelJobHandler = createApiHandler(
  {
    method: 'DELETE',
    validation: {
      params: z.object({
        jobId: z.string().min(1),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 50, // 50 cancellations per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { jobId } = context.validatedParams;

    try {
      const success = await jobQueue.cancelJob(jobId);

      if (!success) {
        throw new ApiError(
          ErrorCodes.INVALID_REQUEST,
          'Job could not be cancelled (may already be processing or completed)'
        );
      }

      return {
        jobId,
        message: 'Job cancelled successfully'
      };

    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to cancel job: ${error.message}`
      );
    }
  }
);

// GET /api/jobs/queue/stats
export const getQueueStatsHandler = createApiHandler(
  {
    method: 'GET',
    auth: {
      required: true,
      roles: ['admin'], // Only admins can view queue stats
    },
    cache: {
      ttl: 30, // 30 seconds for queue stats
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 60, // 60 requests per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    try {
      const stats = await jobQueue.getQueueStats();

      // Calculate total metrics
      const totalQueued = Object.values(stats).reduce(
        (sum, stat) => sum + stat.approximateMessageCount, 0
      );
      const totalProcessing = Object.values(stats).reduce(
        (sum, stat) => sum + stat.approximateMessageNotVisible, 0
      );

      return {
        queueStats: stats,
        summary: {
          totalQueued,
          totalProcessing,
          healthy: Object.values(stats).every(stat => stat.healthy)
        },
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get queue stats: ${error.message}`
      );
    }
  }
);

// Helper function for user-friendly status messages
function getStatusMessage(status: string, progress?: number): string {
  switch (status) {
    case 'queued':
      return 'Job is waiting to be processed';
    case 'processing':
      return progress
        ? `Job is being processed (${progress}% complete)`
        : 'Job is being processed';
    case 'completed':
      return 'Job completed successfully';
    case 'failed':
      return 'Job failed to complete';
    default:
      return 'Unknown status';
  }
}

// Example API routes using these handlers:
/*
// app/api/jobs/ai-response/route.ts
import { queueAIResponseHandler } from '@/lib/api/examples/job-api-handler';

export async function POST(request: NextRequest) {
  return queueAIResponseHandler.handle(request);
}

// app/api/jobs/[jobId]/route.ts
import { getJobStatusHandler, cancelJobHandler } from '@/lib/api/examples/job-api-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  return getJobStatusHandler.handle(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  return cancelJobHandler.handle(request, params);
}
*/