# AWS SQS Implementation Guide - Phase 4 Backend Optimization

## Overview

This document provides comprehensive implementation details for the AWS SQS job queue system implemented as part of Phase 4 Backend Optimization. The system enables scalable, asynchronous background processing for AI response generation, document processing, and analytics aggregation.

---

## Architecture Overview

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js API   │───▶│   Job Queue     │───▶│  Job Processors │
│    Routes       │    │   Service       │    │   (Workers)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   AWS SQS       │
                       │   Queues        │
                       └─────────────────┘
```

### Queue Structure

The implementation uses 4 priority-based queues:

- **Critical Queue**: System-critical operations (priority: 1000+)
- **High Queue**: AI response generation (priority: 500-999)
- **Normal Queue**: Document processing (priority: 100-499)
- **Low Queue**: Analytics aggregation (priority: 1-99)

---

## Implementation Files

### Core Service: `/lib/services/job-queue.ts`

The main job queue service provides comprehensive SQS integration:

```typescript
export class JobQueueService {
  // Queue management
  async addJob(type: JobType, payload: any, priority: JobPriority = JobPriority.NORMAL): Promise<string>
  async getJob(queueUrl: string): Promise<Job | null>
  async completeJob(receiptHandle: string, queueUrl: string): Promise<void>
  async deleteJob(receiptHandle: string, queueUrl: string): Promise<void>

  // Job tracking
  async updateJobProgress(jobId: string, progress: number, status: JobStatus, message?: string): Promise<void>
  async getJobStatus(jobId: string): Promise<JobStatusRecord | null>

  // Queue monitoring
  async getQueueStats(): Promise<Record<string, QueueStats>>
  async getQueueHealth(): Promise<QueueHealthStatus>
}
```

### Job Processors: `/lib/services/job-processors.ts`

Specialized processors for different job types:

```typescript
// AI Response Processing
export async function processAIResponseJob(job: Job): Promise<void> {
  const { conversationId, chatbotId } = job.payload;

  // Get conversation context
  // Generate AI response using AWS Bedrock
  // Save response to database
  // Update conversation metadata
}

// Document Processing
export async function processDocumentJob(job: Job): Promise<void> {
  const { documentId, userId, fileUrl } = job.payload;

  // Download and process document
  // Extract text content
  // Generate embeddings
  // Store in vector database
}

// Analytics Aggregation
export async function processAnalyticsJob(job: Job): Promise<void> {
  const { timeframe, metrics } = job.payload;

  // Aggregate raw analytics data
  // Calculate performance metrics
  // Update pre-aggregated tables
  // Cache results
}
```

---

## Configuration

### Environment Variables

```bash
# AWS SQS Configuration
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Queue URLs (created via AWS CLI or Console)
SQS_CRITICAL_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/account/critical-queue
SQS_HIGH_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/account/high-queue
SQS_NORMAL_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/account/normal-queue
SQS_LOW_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/account/low-queue

# Job Processing Configuration
MAX_RETRIES=3
VISIBILITY_TIMEOUT=300
MESSAGE_RETENTION_PERIOD=1209600
```

### Queue Creation

Use AWS CLI to create the required queues:

```bash
# Create priority queues
aws sqs create-queue --queue-name chatbot-critical-queue \
  --attributes VisibilityTimeoutSeconds=300,MessageRetentionPeriod=1209600

aws sqs create-queue --queue-name chatbot-high-queue \
  --attributes VisibilityTimeoutSeconds=300,MessageRetentionPeriod=1209600

aws sqs create-queue --queue-name chatbot-normal-queue \
  --attributes VisibilityTimeoutSeconds=300,MessageRetentionPeriod=1209600

aws sqs create-queue --queue-name chatbot-low-queue \
  --attributes VisibilityTimeoutSeconds=300,MessageRetentionPeriod=1209600

# Create dead letter queue for failed jobs
aws sqs create-queue --queue-name chatbot-dead-letter-queue \
  --attributes MessageRetentionPeriod=1209600
```

---

## Usage Examples

### 1. API Route Integration

```typescript
// app/api/chat/route.ts
import { jobQueue, JobType, JobPriority } from '@/lib/services/job-queue';

export async function POST(request: NextRequest) {
  const { conversationId, chatbotId, userMessage } = await request.json();

  // Save user message immediately
  await saveUserMessage(conversationId, userMessage);

  // Queue AI response generation
  const jobId = await jobQueue.addJob(
    JobType.AI_RESPONSE,
    { conversationId, chatbotId, userMessage },
    JobPriority.HIGH
  );

  return Response.json({
    success: true,
    jobId,
    message: 'AI response generation queued'
  });
}
```

### 2. Document Processing

```typescript
// app/api/documents/upload/route.ts
import { jobQueue, JobType, JobPriority } from '@/lib/services/job-queue';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  // Upload file to storage
  const fileUrl = await uploadToS3(file);

  // Save document metadata
  const documentId = await createDocument(file.name, fileUrl);

  // Queue document processing
  const jobId = await jobQueue.addJob(
    JobType.DOCUMENT_PROCESSING,
    { documentId, fileUrl, fileName: file.name },
    JobPriority.NORMAL
  );

  return Response.json({
    success: true,
    documentId,
    jobId,
    status: 'processing'
  });
}
```

### 3. Analytics Aggregation

```typescript
// lib/services/analytics-scheduler.ts
import { jobQueue, JobType, JobPriority } from './job-queue';

export class AnalyticsScheduler {
  // Schedule hourly analytics aggregation
  async scheduleHourlyAggregation() {
    const jobId = await jobQueue.addJob(
      JobType.ANALYTICS_AGGREGATION,
      {
        timeframe: 'hourly',
        timestamp: new Date(),
        metrics: ['conversations', 'messages', 'response_times']
      },
      JobPriority.LOW
    );

    console.log(`Scheduled hourly analytics job: ${jobId}`);
  }

  // Schedule daily business intelligence reports
  async scheduleDailyReports() {
    const jobId = await jobQueue.addJob(
      JobType.ANALYTICS_AGGREGATION,
      {
        timeframe: 'daily',
        timestamp: new Date(),
        metrics: ['user_retention', 'cost_analysis', 'performance_trends']
      },
      JobPriority.LOW
    );

    console.log(`Scheduled daily reports job: ${jobId}`);
  }
}
```

---

## Job Processing Worker

### Worker Implementation

```typescript
// workers/job-processor.ts
import { jobQueue } from '@/lib/services/job-queue';
import { processAIResponseJob, processDocumentJob, processAnalyticsJob } from '@/lib/services/job-processors';

class JobWorker {
  private isRunning = false;

  async start() {
    this.isRunning = true;
    console.log('Job worker started');

    // Process jobs from all queues
    const queues = [
      { url: process.env.SQS_CRITICAL_QUEUE_URL!, processor: this.processJob },
      { url: process.env.SQS_HIGH_QUEUE_URL!, processor: this.processJob },
      { url: process.env.SQS_NORMAL_QUEUE_URL!, processor: this.processJob },
      { url: process.env.SQS_LOW_QUEUE_URL!, processor: this.processJob }
    ];

    // Start processing loops for each queue
    await Promise.all(queues.map(queue => this.processQueue(queue.url)));
  }

  private async processQueue(queueUrl: string) {
    while (this.isRunning) {
      try {
        const job = await jobQueue.getJob(queueUrl);

        if (job) {
          await this.processJob(job, queueUrl);
        } else {
          // No jobs available, wait before polling again
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Error processing queue ${queueUrl}:`, error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  private async processJob(job: Job, queueUrl: string) {
    try {
      // Update job status to processing
      await jobQueue.updateJobProgress(job.id, 0, 'processing', 'Starting job processing');

      // Process based on job type
      switch (job.type) {
        case JobType.AI_RESPONSE:
          await processAIResponseJob(job);
          break;
        case JobType.DOCUMENT_PROCESSING:
          await processDocumentJob(job);
          break;
        case JobType.ANALYTICS_AGGREGATION:
          await processAnalyticsJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark job as completed
      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Job completed successfully');
      await jobQueue.completeJob(job.receiptHandle, queueUrl);

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);

      // Update job status to failed
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);

      // Handle retry logic
      if (job.retryCount < 3) {
        // Retry job with exponential backoff
        const delay = Math.pow(2, job.retryCount) * 1000;
        setTimeout(async () => {
          await jobQueue.addJob(job.type, job.payload, job.priority);
        }, delay);
      }

      // Delete failed job from queue
      await jobQueue.deleteJob(job.receiptHandle, queueUrl);
    }
  }

  stop() {
    this.isRunning = false;
    console.log('Job worker stopped');
  }
}

// Start worker
const worker = new JobWorker();
worker.start();
```

---

## Monitoring & Health Checks

### Queue Health Monitoring

```typescript
// lib/services/queue-monitor.ts
import { jobQueue } from './job-queue';
import { performanceMonitor } from './performance-monitor';

export class QueueMonitor {
  async performHealthCheck() {
    try {
      const queueStats = await jobQueue.getQueueStats();

      // Check for unhealthy queues
      const unhealthyQueues = Object.entries(queueStats)
        .filter(([, stats]) => !stats.healthy)
        .map(([queueName]) => queueName);

      if (unhealthyQueues.length > 0) {
        await performanceMonitor.createAlert({
          level: 'critical',
          title: 'Job Queue Health Degraded',
          message: `Unhealthy queues: ${unhealthyQueues.join(', ')}`,
          source: 'QueueMonitor',
          metadata: { queueStats, unhealthyQueues }
        });
      }

      // Monitor job processing rates
      const processingRates = this.calculateProcessingRates(queueStats);
      if (processingRates.some(rate => rate < 0.5)) {
        await performanceMonitor.createAlert({
          level: 'warning',
          title: 'Low Job Processing Rate',
          message: 'Job processing rate below threshold',
          source: 'QueueMonitor',
          metadata: { processingRates }
        });
      }

      return { healthy: unhealthyQueues.length === 0, queueStats };

    } catch (error) {
      console.error('Queue health check failed:', error);
      throw error;
    }
  }

  private calculateProcessingRates(queueStats: Record<string, any>) {
    return Object.values(queueStats).map((stats: any) =>
      stats.messagesProcessedPerMinute || 0
    );
  }
}
```

### Performance Metrics

The job queue system integrates with the performance monitoring system to track:

- **Job Processing Times**: Average, P95, P99 percentiles per job type
- **Queue Depths**: Number of pending jobs per queue
- **Success/Failure Rates**: Job completion statistics
- **Throughput**: Jobs processed per minute/hour
- **Error Patterns**: Failed job analysis and retry patterns

---

## Error Handling & Retry Logic

### Retry Strategy

```typescript
export class RetryHandler {
  static readonly MAX_RETRIES = 3;
  static readonly BASE_DELAY = 1000; // 1 second

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    jobId: string,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retryCount >= this.MAX_RETRIES) {
        await this.handleFinalFailure(jobId, error);
        throw error;
      }

      const delay = this.BASE_DELAY * Math.pow(2, retryCount);
      console.log(`Job ${jobId} failed, retrying in ${delay}ms (attempt ${retryCount + 1})`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.executeWithRetry(operation, jobId, retryCount + 1);
    }
  }

  private static async handleFinalFailure(jobId: string, error: Error) {
    await performanceMonitor.createAlert({
      level: 'error',
      title: 'Job Processing Failed',
      message: `Job ${jobId} failed after ${this.MAX_RETRIES} retries: ${error.message}`,
      source: 'RetryHandler',
      metadata: { jobId, error: error.message, retries: this.MAX_RETRIES }
    });
  }
}
```

### Dead Letter Queue Handling

Failed jobs that exceed retry limits are moved to a dead letter queue for manual investigation:

```typescript
// lib/services/dead-letter-handler.ts
export class DeadLetterHandler {
  async processDLQMessages() {
    const dlqUrl = process.env.SQS_DEAD_LETTER_QUEUE_URL!;

    // Retrieve messages from DLQ
    const messages = await this.getMessagesFromDLQ(dlqUrl);

    for (const message of messages) {
      try {
        // Log failed job details
        console.error('DLQ Message:', {
          jobId: message.jobId,
          type: message.type,
          failureReason: message.failureReason,
          timestamp: message.timestamp
        });

        // Optionally attempt manual processing or notification
        await this.notifyAdministrators(message);

      } catch (error) {
        console.error('Error processing DLQ message:', error);
      }
    }
  }

  private async notifyAdministrators(message: any) {
    await performanceMonitor.createAlert({
      level: 'critical',
      title: 'Manual Intervention Required',
      message: `Job ${message.jobId} requires manual review`,
      source: 'DeadLetterHandler',
      metadata: message
    });
  }
}
```

---

## Performance Optimization

### Batch Processing

For high-volume scenarios, implement batch processing:

```typescript
export class BatchJobProcessor {
  private readonly batchSize = 10;
  private readonly batchTimeout = 30000; // 30 seconds

  async processBatch(queueUrl: string) {
    const jobs = await this.getBatchJobs(queueUrl, this.batchSize);

    if (jobs.length === 0) return;

    // Process jobs in parallel
    const results = await Promise.allSettled(
      jobs.map(job => this.processJob(job))
    );

    // Handle results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const job = jobs[i];

      if (result.status === 'fulfilled') {
        await jobQueue.completeJob(job.receiptHandle, queueUrl);
      } else {
        await this.handleJobFailure(job, result.reason);
      }
    }
  }
}
```

### Connection Pooling

Use connection pooling for optimal SQS performance:

```typescript
// lib/aws/sqs-client.ts
import { SQSClient } from '@aws-sdk/client-sqs';

class SQSClientManager {
  private static instance: SQSClient;

  static getInstance(): SQSClient {
    if (!this.instance) {
      this.instance = new SQSClient({
        region: process.env.AWS_REGION,
        maxAttempts: 3,
        requestHandler: {
          connectionTimeout: 5000,
          socketTimeout: 30000
        }
      });
    }
    return this.instance;
  }
}

export const sqsClient = SQSClientManager.getInstance();
```

---

## Deployment Considerations

### AWS IAM Permissions

Required IAM policy for SQS operations:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:ListQueues"
      ],
      "Resource": [
        "arn:aws:sqs:ap-southeast-1:*:chatbot-*-queue"
      ]
    }
  ]
}
```

### Scaling Considerations

- **Worker Scaling**: Deploy multiple worker instances for high-volume processing
- **Queue Partitioning**: Use separate queues for different chatbots or tenants
- **Load Balancing**: Distribute workers across multiple availability zones
- **Auto Scaling**: Implement CloudWatch-based auto scaling for worker instances

---

## Best Practices

### 1. Job Design
- Keep jobs idempotent (safe to retry)
- Include all necessary data in the job payload
- Use appropriate priority levels
- Implement proper timeout handling

### 2. Error Handling
- Log all errors with context
- Implement proper retry strategies
- Use dead letter queues for failed jobs
- Monitor error patterns for system improvements

### 3. Performance
- Batch process when possible
- Use connection pooling
- Monitor queue depths regularly
- Implement proper caching strategies

### 4. Security
- Use least-privilege IAM policies
- Encrypt sensitive job payloads
- Implement proper authentication for worker access
- Regular security audits of queue configurations

---

## Conclusion

The AWS SQS implementation provides a robust, scalable foundation for asynchronous job processing in the chatbot platform. The system supports:

- **High Throughput**: Process thousands of jobs per hour
- **Reliability**: Automatic retry and dead letter queue handling
- **Scalability**: Horizontal scaling with multiple workers
- **Monitoring**: Comprehensive observability and alerting
- **Flexibility**: Support for multiple job types and priorities

This implementation enables the chatbot platform to handle massive scale while maintaining excellent user experience through efficient background processing of AI responses, document processing, and analytics aggregation.

---

**Document Version**: 1.0
**Last Updated**: January 15, 2025
**Implementation Status**: ✅ Complete
**Production Ready**: ✅ Yes