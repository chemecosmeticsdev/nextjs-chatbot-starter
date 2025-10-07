import { SQSClient, SendMessageCommand, DeleteMessageCommand, ReceiveMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { cache, CacheKeys } from './cache-service';

// Job types supported by the queue system
export enum JobType {
  // AI Processing Jobs
  AI_RESPONSE_GENERATION = 'ai_response_generation',
  DOCUMENT_PROCESSING = 'document_processing',
  VECTOR_INDEXING = 'vector_indexing',

  // Enhanced Document Processing Pipeline
  DOCUMENT_DOWNLOAD = 'document_download',
  TEXT_EXTRACTION = 'text_extraction',
  METADATA_ENHANCEMENT = 'metadata_enhancement',
  DOCUMENT_CHUNKING = 'document_chunking',
  EMBEDDING_GENERATION = 'embedding_generation',
  VECTOR_STORAGE = 'vector_storage',
  COMPLETE_DOCUMENT_PIPELINE = 'complete_document_pipeline',

  // Google Drive Integration
  GDRIVE_FOLDER_PROCESSING = 'gdrive_folder_processing',
  GDRIVE_FILE_PROCESSING = 'gdrive_file_processing',

  // Analytics Jobs
  CONVERSATION_ANALYTICS = 'conversation_analytics',
  DASHBOARD_METRICS_UPDATE = 'dashboard_metrics_update',
  USAGE_STATS_CALCULATION = 'usage_stats_calculation',

  // Background Tasks
  EMAIL_NOTIFICATION = 'email_notification',
  CLEANUP_OLD_DATA = 'cleanup_old_data',
  CACHE_WARM_UP = 'cache_warm_up',

  // Document Management
  KNOWLEDGE_BASE_UPDATE = 'knowledge_base_update',
  SEARCH_INDEX_UPDATE = 'search_index_update',

  // Maintenance & Health
  DOCUMENT_REPROCESSING = 'document_reprocessing',
  VECTOR_REINDEXING = 'vector_reindexing',
  QUALITY_ASSURANCE = 'quality_assurance'
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
    error?: string,
    stage?: string,
    stageDetails?: Record<string, any>
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.apiResponse('job_status', jobId);
      const currentStatus = await cache.get(cacheKey) || {};

      const updatedStatus = {
        ...currentStatus,
        status,
        progress,
        ...(error && { error }),
        ...(stage && { currentStage: stage }),
        ...(stageDetails && { stageDetails }),
        updatedAt: new Date().toISOString(),
        lastProgressUpdate: new Date().toISOString()
      };

      // Cache for 24 hours for completed/failed jobs, 1 hour for processing
      const ttl = status === 'processing' ? 3600 : 86400;
      await cache.set(cacheKey, updatedStatus, ttl);

      console.log(`[JobQueue] Updated progress for ${jobId}: ${progress}% (${status}) ${stage ? `- ${stage}` : ''}`);

    } catch (error) {
      console.error(`Failed to update job progress for ${jobId}:`, error);
    }
  }

  /**
   * Update document processing stage progress
   */
  async updateDocumentStage(
    documentId: string,
    stage: 'text_extraction' | 'metadata_enhancement' | 'document_chunking' | 'embedding_generation' | 'vector_storage',
    progress: number,
    status: 'starting' | 'processing' | 'completed' | 'failed',
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.apiResponse('document_stage', documentId);
      const currentStages = await cache.get(cacheKey) || {};

      const updatedStages = {
        ...currentStages,
        [stage]: {
          status,
          progress,
          details: details || {},
          updatedAt: new Date().toISOString()
        },
        lastUpdate: new Date().toISOString()
      };

      // Cache for 6 hours
      await cache.set(cacheKey, updatedStages, 21600);

      console.log(`[DocumentStages] ${documentId} - ${stage}: ${progress}% (${status})`);

    } catch (error) {
      console.error(`Failed to update document stage for ${documentId}:`, error);
    }
  }

  /**
   * Get document processing stages
   */
  async getDocumentStages(documentId: string): Promise<Record<string, any> | null> {
    try {
      const cacheKey = CacheKeys.apiResponse('document_stage', documentId);
      return await cache.get(cacheKey);
    } catch (error) {
      console.error(`Failed to get document stages for ${documentId}:`, error);
      return null;
    }
  }

  /**
   * Update batch job progress with individual document status
   */
  async updateBatchJobProgress(
    batchJobId: string,
    documentResults: Array<{
      documentId: string;
      status: 'completed' | 'failed' | 'processing';
      progress?: number;
      error?: string;
    }>
  ): Promise<void> {
    try {
      const cacheKey = CacheKeys.apiResponse('batch_job', batchJobId);

      const totalDocuments = documentResults.length;
      const completedCount = documentResults.filter(d => d.status === 'completed').length;
      const failedCount = documentResults.filter(d => d.status === 'failed').length;
      const processingCount = documentResults.filter(d => d.status === 'processing').length;

      // Calculate overall progress
      const overallProgress = Math.round((completedCount / totalDocuments) * 100);

      // Determine batch status
      let batchStatus: 'processing' | 'completed' | 'failed';
      if (completedCount === totalDocuments) {
        batchStatus = 'completed';
      } else if (failedCount === totalDocuments) {
        batchStatus = 'failed';
      } else {
        batchStatus = 'processing';
      }

      const batchUpdate = {
        jobId: batchJobId,
        status: batchStatus,
        progress: overallProgress,
        summary: {
          total: totalDocuments,
          completed: completedCount,
          failed: failedCount,
          processing: processingCount
        },
        documents: documentResults,
        updatedAt: new Date().toISOString()
      };

      // Cache for 24 hours if completed, 1 hour if processing
      const ttl = batchStatus === 'completed' ? 86400 : 3600;
      await cache.set(cacheKey, batchUpdate, ttl);

      console.log(`[BatchJob] ${batchJobId}: ${completedCount}/${totalDocuments} completed (${overallProgress}%)`);

    } catch (error) {
      console.error(`Failed to update batch job progress for ${batchJobId}:`, error);
    }
  }

  /**
   * Get batch job status
   */
  async getBatchJobStatus(batchJobId: string): Promise<any> {
    try {
      const cacheKey = CacheKeys.apiResponse('batch_job', batchJobId);
      return await cache.get(cacheKey);
    } catch (error) {
      console.error(`Failed to get batch job status for ${batchJobId}:`, error);
      return null;
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
        const client = this.sqsClients.get(priority as JobPriority)!;

        const command = new GetQueueAttributesCommand({
          QueueUrl: config.queueUrl,
          AttributeNames: [
            'ApproximateNumberOfMessages',
            'ApproximateNumberOfMessagesNotVisible',
            'ApproximateNumberOfMessagesDelayed'
          ]
        });

        const response = await client.send(command);
        const attributes = response.Attributes || {};

        stats[priority] = {
          approximateMessageCount: parseInt(attributes.ApproximateNumberOfMessages || '0', 10),
          approximateMessageNotVisible: parseInt(attributes.ApproximateNumberOfMessagesNotVisible || '0', 10),
          healthy: this.isHealthy
        };

        console.log(`Queue stats for ${priority}: visible=${stats[priority].approximateMessageCount}, processing=${stats[priority].approximateMessageNotVisible}`);

      } catch (error) {
        console.error(`Failed to get queue stats for ${priority}:`, error);
        stats[priority] = {
          approximateMessageCount: -1,
          approximateMessageNotVisible: -1,
          healthy: false
        };

        // Mark service as unhealthy if we can't get stats
        this.markUnhealthy();
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

      // Enhanced Document Processing Pipeline
      [JobType.DOCUMENT_DOWNLOAD]: 180,
      [JobType.TEXT_EXTRACTION]: 600,
      [JobType.METADATA_ENHANCEMENT]: 300,
      [JobType.DOCUMENT_CHUNKING]: 180,
      [JobType.EMBEDDING_GENERATION]: 900,
      [JobType.VECTOR_STORAGE]: 300,
      [JobType.COMPLETE_DOCUMENT_PIPELINE]: 1800,

      // Google Drive Integration
      [JobType.GDRIVE_FOLDER_PROCESSING]: 3600,
      [JobType.GDRIVE_FILE_PROCESSING]: 600,

      // Analytics Jobs
      [JobType.CONVERSATION_ANALYTICS]: 120,
      [JobType.DASHBOARD_METRICS_UPDATE]: 180,
      [JobType.USAGE_STATS_CALCULATION]: 300,

      // Background Tasks
      [JobType.EMAIL_NOTIFICATION]: 30,
      [JobType.CLEANUP_OLD_DATA]: 1800,
      [JobType.CACHE_WARM_UP]: 60,

      // Document Management
      [JobType.KNOWLEDGE_BASE_UPDATE]: 600,
      [JobType.SEARCH_INDEX_UPDATE]: 300,

      // Maintenance & Health
      [JobType.DOCUMENT_REPROCESSING]: 1800,
      [JobType.VECTOR_REINDEXING]: 3600,
      [JobType.QUALITY_ASSURANCE]: 900
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

  // Enhanced Document Processing Pipeline
  completeDocumentPipeline: (
    documentId: string,
    userId: string,
    options: {
      googleDriveFileId?: string;
      fileUrl?: string;
      skipSteps?: string[];
      forceReprocess?: boolean;
      priority?: JobPriority;
    } = {}
  ): Omit<Job, 'id'> => ({
    type: JobType.COMPLETE_DOCUMENT_PIPELINE,
    priority: options.priority || JobPriority.NORMAL,
    payload: {
      documentId,
      userId,
      googleDriveFileId: options.googleDriveFileId,
      fileUrl: options.fileUrl,
      skipSteps: options.skipSteps || [],
      forceReprocess: options.forceReprocess || false,
    },
    metadata: { documentId, userId }
  }),

  textExtraction: (documentId: string, filePath: string, mimeType: string, originalFilename: string): Omit<Job, 'id'> => ({
    type: JobType.TEXT_EXTRACTION,
    priority: JobPriority.NORMAL,
    payload: { documentId, filePath, mimeType, originalFilename },
    metadata: { documentId }
  }),

  metadataEnhancement: (documentId: string, extractedText: string, folderPath?: string, filename?: string): Omit<Job, 'id'> => ({
    type: JobType.METADATA_ENHANCEMENT,
    priority: JobPriority.NORMAL,
    payload: { documentId, extractedText, folderPath, filename },
    metadata: { documentId }
  }),

  documentChunking: (documentId: string, extractedText: string, documentType: string, tokenCount: number): Omit<Job, 'id'> => ({
    type: JobType.DOCUMENT_CHUNKING,
    priority: JobPriority.NORMAL,
    payload: { documentId, extractedText, documentType, tokenCount },
    metadata: { documentId }
  }),

  embeddingGeneration: (documentId: string, chunks: any[]): Omit<Job, 'id'> => ({
    type: JobType.EMBEDDING_GENERATION,
    priority: JobPriority.NORMAL,
    payload: { documentId, chunks },
    metadata: { documentId }
  }),

  vectorStorage: (documentId: string, chunksWithEmbeddings: any[]): Omit<Job, 'id'> => ({
    type: JobType.VECTOR_STORAGE,
    priority: JobPriority.NORMAL,
    payload: { documentId, chunksWithEmbeddings },
    metadata: { documentId }
  }),

  // Google Drive Integration
  googleDriveFolderProcessing: (folderId: string, userId: string, options: { recursive?: boolean; priority?: JobPriority } = {}): Omit<Job, 'id'> => ({
    type: JobType.GDRIVE_FOLDER_PROCESSING,
    priority: options.priority || JobPriority.LOW,
    payload: { folderId, userId, recursive: options.recursive || false },
    metadata: { userId, folderId }
  }),

  googleDriveFileProcessing: (fileId: string, documentId: string, userId: string): Omit<Job, 'id'> => ({
    type: JobType.GDRIVE_FILE_PROCESSING,
    priority: JobPriority.NORMAL,
    payload: { fileId, documentId, userId },
    metadata: { documentId, userId }
  }),

  // Analytics and Maintenance
  analyticsUpdate: (chatbotId: string, priority: JobPriority = JobPriority.LOW): Omit<Job, 'id'> => ({
    type: JobType.CONVERSATION_ANALYTICS,
    priority,
    payload: { chatbotId },
    metadata: { chatbotId }
  }),

  vectorReindexing: (documentIds: string[], priority: JobPriority = JobPriority.LOW): Omit<Job, 'id'> => ({
    type: JobType.VECTOR_REINDEXING,
    priority,
    payload: { documentIds },
    metadata: { batchSize: documentIds.length }
  }),

  qualityAssurance: (scope: string, targetIds: string[], priority: JobPriority = JobPriority.LOW): Omit<Job, 'id'> => ({
    type: JobType.QUALITY_ASSURANCE,
    priority,
    payload: { scope, targetIds },
    metadata: { scope, batchSize: targetIds.length }
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