import { SQSClient, SendMessageCommand, DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { cache, CacheKeys } from './cache-service';

// Job types supported by the queue system
export enum JobType {
  // AI Processing Jobs
  AI_RESPONSE_GENERATION = 'ai_response_generation',
  DOCUMENT_PROCESSING = 'document_processing',
  VECTOR_INDEXING = 'vector_indexing',

  // Analytics Jobs
  CONVERSATION_ANALYTICS = 'conversation_analytics',
  DASHBOARD_METRICS_UPDATE = 'dashboard_metrics_update',
  USAGE_STATS_CALCULATION = 'usage_stats_calculation',

  // Background Tasks
  EMAIL_NOTIFICATION = 'email_notification',
  CLEANUP_OLD_DATA = 'cleanup_old_data',
  CACHE_WARM_UP = 'cache_warm_up',

  // Document Management
  DOCUMENT_CHUNKING = 'document_chunking',
  KNOWLEDGE_BASE_UPDATE = 'knowledge_base_update',
  SEARCH_INDEX_UPDATE = 'search_index_update'
}

// Job priority levels
export enum JobPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Base job interface
export interface Job {
  id: string;
  type: JobType;
  priority: JobPriority;
  payload: Record<string, any>;
  metadata?: {
    createdAt: string;
    scheduledFor?: string;
    retryCount?: number;
    maxRetries?: number;
    timeout?: number;
    userId?: string;
    chatbotId?: string;
    conversationId?: string;
  };
}

// Queue configuration
interface QueueConfig {
  queueUrl: string;
  region: string;
  visibilityTimeout: number;
  messageRetentionPeriod: number;
  maxReceiveCount: number;
  dlqUrl?: string; // Dead letter queue
}

// Default queue configurations
const QueueConfigs: Record<JobPriority, QueueConfig> = {
  [JobPriority.CRITICAL]: {
    queueUrl: process.env.AWS_SQS_CRITICAL_QUEUE_URL!,
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    visibilityTimeout: 30,
    messageRetentionPeriod: 1209600, // 14 days
    maxReceiveCount: 3,
    dlqUrl: process.env.AWS_SQS_CRITICAL_DLQ_URL
  },
  [JobPriority.HIGH]: {
    queueUrl: process.env.AWS_SQS_HIGH_QUEUE_URL!,
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    visibilityTimeout: 60,
    messageRetentionPeriod: 1209600,
    maxReceiveCount: 3,
    dlqUrl: process.env.AWS_SQS_HIGH_DLQ_URL
  },
  [JobPriority.NORMAL]: {
    queueUrl: process.env.AWS_SQS_NORMAL_QUEUE_URL!,
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    visibilityTimeout: 300, // 5 minutes
    messageRetentionPeriod: 1209600,
    maxReceiveCount: 5,
    dlqUrl: process.env.AWS_SQS_NORMAL_DLQ_URL
  },
  [JobPriority.LOW]: {
    queueUrl: process.env.AWS_SQS_LOW_QUEUE_URL!,
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    visibilityTimeout: 900, // 15 minutes
    messageRetentionPeriod: 1209600,
    maxReceiveCount: 10,
    dlqUrl: process.env.AWS_SQS_LOW_DLQ_URL
  }
};

/**
 * Job Queue Service using AWS SQS
 * Provides reliable background job processing with priority queues
 */
export class JobQueueService {
  private sqsClients: Map<JobPriority, SQSClient> = new Map();
  private isHealthy = true;
  private lastHealthCheck = 0;
  private healthCheckInterval = 60000; // 1 minute

  constructor() {
    this.initializeSQSClients();
  }

  private initializeSQSClients(): void {
    for (const [priority, config] of Object.entries(QueueConfigs)) {
      const client = new SQSClient({
        region: config.region,
        credentials: {
          accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
        },
        maxAttempts: 3,
        retryMode: 'adaptive'
      });

      this.sqsClients.set(priority as JobPriority, client);
    }
  }

  /**
   * Add a job to the appropriate priority queue
   */
  async addJob(job: Omit<Job, 'id'>): Promise<string> {
    try {
      await this.checkHealth();

      if (!this.isHealthy) {
        throw new Error('Job queue service is unhealthy');
      }

      const jobId = this.generateJobId();
      const completeJob: Job = {
        ...job,
        id: jobId,
        metadata: {
          ...job.metadata,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          maxRetries: job.metadata?.maxRetries || this.getDefaultMaxRetries(job.priority),
          timeout: job.metadata?.timeout || this.getDefaultTimeout(job.type)
        }
      };

      const config = QueueConfigs[job.priority];
      const client = this.sqsClients.get(job.priority)!;

      const command = new SendMessageCommand({
        QueueUrl: config.queueUrl,
        MessageBody: JSON.stringify(completeJob),
        DelaySeconds: this.calculateDelay(completeJob),
        MessageAttributes: {
          JobType: {
            DataType: 'String',
            StringValue: job.type
          },
          Priority: {
            DataType: 'String',
            StringValue: job.priority
          },
          UserId: {
            DataType: 'String',
            StringValue: job.metadata?.userId || 'system'
          }
        }
      });

      await client.send(command);

      // Cache job status for tracking
      await this.cacheJobStatus(jobId, 'queued', completeJob);

      console.log(`Job ${jobId} queued successfully (type: ${job.type}, priority: ${job.priority})`);
      return jobId;

    } catch (error) {
      console.error('Failed to add job to queue:', error);
      this.markUnhealthy();
      throw new Error(`Failed to queue job: ${error.message}`);
    }
  }

  /**
   * Add multiple jobs as a batch
   */
  async addJobBatch(jobs: Array<Omit<Job, 'id'>>): Promise<string[]> {
    const jobIds: string[] = [];

    // Process jobs in parallel but limit concurrency
    const batchSize = 10;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      const batchPromises = batch.map(job => this.addJob(job));
      const batchResults = await Promise.all(batchPromises);
      jobIds.push(...batchResults);
    }

    return jobIds;
  }

  /**
   * Schedule a job for future execution
   */
  async scheduleJob(
    job: Omit<Job, 'id'>,
    scheduledFor: Date
  ): Promise<string> {
    const scheduledJob = {
      ...job,
      metadata: {
        ...job.metadata,
        scheduledFor: scheduledFor.toISOString()
      }
    };

    return this.addJob(scheduledJob);
  }

  /**
   * Get job status from cache or SQS
   */
  async getJobStatus(jobId: string): Promise<{
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_found';
    job?: Job;
    progress?: number;
    error?: string;
    updatedAt: string;
  }> {
    try {
      const cacheKey = CacheKeys.apiResponse('job_status', jobId);
      const cached = await cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      // If not in cache, job might be completed or failed
      return {
        status: 'not_found',
        updatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Failed to get job status for ${jobId}:`, error);
      return {
        status: 'not_found',
        updatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Update job progress (called by job processors)
   */
  async updateJobProgress(
    jobId: string,
    progress: number,
    status: 'processing' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.apiResponse('job_status', jobId);
      const currentStatus = await cache.get(cacheKey) || {};

      const updatedStatus = {
        ...currentStatus,
        status,
        progress,
        ...(error && { error }),
        updatedAt: new Date().toISOString()
      };

      // Cache for 24 hours for completed/failed jobs, 1 hour for processing
      const ttl = status === 'processing' ? 3600 : 86400;
      await cache.set(cacheKey, updatedStatus, ttl);

    } catch (error) {
      console.error(`Failed to update job progress for ${jobId}:`, error);
    }
  }

  /**
   * Cancel a queued job (if not yet processed)
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      // Update status to cancelled
      await this.updateJobProgress(jobId, 0, 'failed', 'Job cancelled by user');

      // Note: We can't easily remove from SQS without receiving the message
      // The job processor should check the cache status and skip cancelled jobs

      return true;
    } catch (error) {
      console.error(`Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<Record<JobPriority, {
    approximateMessageCount: number;
    approximateMessageNotVisible: number;
    healthy: boolean;
  }>> {
    const stats: any = {};

    for (const [priority, config] of Object.entries(QueueConfigs)) {
      try {
        // Note: In production, you'd use GetQueueAttributes to get real stats
        // For now, we'll provide placeholder values
        stats[priority] = {
          approximateMessageCount: 0,
          approximateMessageNotVisible: 0,
          healthy: this.isHealthy
        };
      } catch (error) {
        stats[priority] = {
          approximateMessageCount: -1,
          approximateMessageNotVisible: -1,
          healthy: false
        };
      }
    }

    return stats;
  }

  /**
   * Utility methods for job processors to receive and process jobs
   */
  async receiveJobs(
    priority: JobPriority,
    maxMessages: number = 1
  ): Promise<Array<{ job: Job; receiptHandle: string }>> {
    try {
      const config = QueueConfigs[priority];
      const client = this.sqsClients.get(priority)!;

      const command = new ReceiveMessageCommand({
        QueueUrl: config.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: 20, // Long polling
        VisibilityTimeout: config.visibilityTimeout,
        MessageAttributeNames: ['All']
      });

      const response = await client.send(command);
      const jobs: Array<{ job: Job; receiptHandle: string }> = [];

      if (response.Messages) {
        for (const message of response.Messages) {
          try {
            const job = JSON.parse(message.Body!) as Job;
            jobs.push({
              job,
              receiptHandle: message.ReceiptHandle!
            });
          } catch (error) {
            console.error('Failed to parse job message:', error);
          }
        }
      }

      return jobs;
    } catch (error) {
      console.error(`Failed to receive jobs from ${priority} queue:`, error);
      return [];
    }
  }

  /**
   * Mark job as completed and remove from queue
   */
  async completeJob(receiptHandle: string, priority: JobPriority): Promise<void> {
    try {
      const config = QueueConfigs[priority];
      const client = this.sqsClients.get(priority)!;

      const command = new DeleteMessageCommand({
        QueueUrl: config.queueUrl,
        ReceiptHandle: receiptHandle
      });

      await client.send(command);
    } catch (error) {
      console.error('Failed to complete job:', error);
      throw error;
    }
  }

  private calculateDelay(job: Job): number {
    if (!job.metadata?.scheduledFor) {
      return 0;
    }

    const scheduledTime = new Date(job.metadata.scheduledFor).getTime();
    const currentTime = Date.now();
    const delayMs = Math.max(0, scheduledTime - currentTime);

    // SQS max delay is 900 seconds (15 minutes)
    return Math.min(Math.floor(delayMs / 1000), 900);
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultMaxRetries(priority: JobPriority): number {
    const retryMap = {
      [JobPriority.CRITICAL]: 3,
      [JobPriority.HIGH]: 3,
      [JobPriority.NORMAL]: 5,
      [JobPriority.LOW]: 10
    };
    return retryMap[priority];
  }

  private getDefaultTimeout(jobType: JobType): number {
    // Timeout in seconds
    const timeoutMap = {
      [JobType.AI_RESPONSE_GENERATION]: 60,
      [JobType.DOCUMENT_PROCESSING]: 300,
      [JobType.VECTOR_INDEXING]: 600,
      [JobType.CONVERSATION_ANALYTICS]: 120,
      [JobType.DASHBOARD_METRICS_UPDATE]: 180,
      [JobType.USAGE_STATS_CALCULATION]: 300,
      [JobType.EMAIL_NOTIFICATION]: 30,
      [JobType.CLEANUP_OLD_DATA]: 1800,
      [JobType.CACHE_WARM_UP]: 60,
      [JobType.DOCUMENT_CHUNKING]: 180,
      [JobType.KNOWLEDGE_BASE_UPDATE]: 600,
      [JobType.SEARCH_INDEX_UPDATE]: 300
    };
    return timeoutMap[jobType] || 300;
  }

  private async cacheJobStatus(jobId: string, status: string, job: Job): Promise<void> {
    const cacheKey = CacheKeys.apiResponse('job_status', jobId);
    const jobStatus = {
      status,
      job,
      progress: 0,
      updatedAt: new Date().toISOString()
    };

    await cache.set(cacheKey, jobStatus, 3600); // 1 hour
  }

  private async checkHealth(): Promise<void> {
    const now = Date.now();

    if (now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    try {
      // Simple health check - verify SQS clients are configured
      for (const [priority, client] of this.sqsClients.entries()) {
        if (!client) {
          throw new Error(`SQS client for ${priority} priority not configured`);
        }
      }

      this.isHealthy = true;
      this.lastHealthCheck = now;
    } catch (error) {
      console.error('Job queue health check failed:', error);
      this.markUnhealthy();
    }
  }

  private markUnhealthy(): void {
    this.isHealthy = false;
    this.lastHealthCheck = 0;
  }
}

// Export singleton instance
export const jobQueue = new JobQueueService();

// Job factory functions for common job types
export const JobFactory = {
  aiResponse: (conversationId: string, chatbotId: string, priority: JobPriority = JobPriority.HIGH): Omit<Job, 'id'> => ({
    type: JobType.AI_RESPONSE_GENERATION,
    priority,
    payload: { conversationId, chatbotId },
    metadata: { conversationId, chatbotId }
  }),

  documentProcessing: (documentId: string, userId: string, priority: JobPriority = JobPriority.NORMAL): Omit<Job, 'id'> => ({
    type: JobType.DOCUMENT_PROCESSING,
    priority,
    payload: { documentId },
    metadata: { userId }
  }),

  analyticsUpdate: (chatbotId: string, priority: JobPriority = JobPriority.LOW): Omit<Job, 'id'> => ({
    type: JobType.CONVERSATION_ANALYTICS,
    priority,
    payload: { chatbotId },
    metadata: { chatbotId }
  }),

  emailNotification: (userId: string, template: string, data: any, priority: JobPriority = JobPriority.NORMAL): Omit<Job, 'id'> => ({
    type: JobType.EMAIL_NOTIFICATION,
    priority,
    payload: { userId, template, data },
    metadata: { userId }
  })
};

// Export types for job processors
export type { Job, QueueConfig };
export { QueueConfigs };