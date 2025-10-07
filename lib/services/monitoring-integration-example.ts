/**
 * Performance Monitoring Integration Examples
 *
 * This file demonstrates how to integrate performance monitoring
 * throughout the chatbot application for comprehensive observability.
 */

import { performanceMonitor, measurePerformance, MetricType, PerformanceMeasurement } from './performance-monitor';
import { db } from '@/lib/db';
import { chatbotMessages, chatbotConversations } from '@/lib/db/schema';
import { cache } from './cache-service';
import { jobQueue, JobType, JobPriority } from './job-queue';

/**
 * Example 1: Monitoring Database Operations
 */
export class MonitoredDatabaseService {

  @measurePerformance(MetricType.DATABASE_QUERY, 'get_conversation_messages')
  async getConversationMessages(conversationId: string, limit: number = 20) {
    try {
      const messages = await db
        .select()
        .from(chatbotMessages)
        .where(eq(chatbotMessages.conversationId, conversationId))
        .limit(limit);

      return messages;
    } catch (error) {
      // Error will be automatically recorded by the decorator
      throw error;
    }
  }

  // Manual monitoring for more complex operations
  async createConversationWithMetrics(chatbotId: string, sessionId: string, userMessage: string) {
    const measurement = performanceMonitor.startMeasurement(
      MetricType.DATABASE_QUERY,
      'create_conversation_with_first_message',
      { chatbotId, sessionId }
    );

    try {
      // Start transaction
      const result = await db.transaction(async (tx) => {
        // Create conversation
        const [conversation] = await tx
          .insert(chatbotConversations)
          .values({
            id: crypto.randomUUID(),
            chatbotId,
            sessionId,
            integrationType: 'web_embed',
            startedAt: new Date(),
            lastActivityAt: new Date()
          })
          .returning();

        // Create first message
        const [message] = await tx
          .insert(chatbotMessages)
          .values({
            id: crypto.randomUUID(),
            conversationId: conversation.id,
            role: 'user',
            content: userMessage,
            createdAt: new Date()
          })
          .returning();

        return { conversation, message };
      });

      await measurement.complete({
        conversationId: result.conversation.id,
        messageId: result.message.id
      });

      return result;

    } catch (error) {
      await measurement.error(error, { chatbotId, sessionId });
      throw error;
    }
  }
}

/**
 * Example 2: Monitoring AI Generation
 */
export class MonitoredAIService {

  async generateAIResponse(conversationId: string, chatbotId: string, userMessage: string) {
    const measurement = performanceMonitor.startMeasurement(
      MetricType.AI_GENERATION,
      'bedrock_nova_micro_generation',
      { conversationId, chatbotId, userMessage: userMessage.slice(0, 100) }
    );

    try {
      // Simulate AI generation process
      const startTime = Date.now();

      // 1. Get conversation context
      const contextMeasurement = performanceMonitor.startMeasurement(
        MetricType.DATABASE_QUERY,
        'get_conversation_context'
      );

      const context = await this.getConversationContext(conversationId);
      await contextMeasurement.complete({ messageCount: context.length });

      // 2. Perform vector search if needed
      const vectorMeasurement = performanceMonitor.startMeasurement(
        MetricType.VECTOR_SEARCH,
        'knowledge_base_search'
      );

      const relevantDocs = await this.searchKnowledgeBase(userMessage);
      await vectorMeasurement.complete({
        documentsFound: relevantDocs.length,
        searchQuery: userMessage.slice(0, 50)
      });

      // 3. Generate AI response (mock - integrate with AWS Bedrock)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate AI call

      const aiResponse = `AI response to: ${userMessage}`;
      const totalTime = Date.now() - startTime;

      // Track token usage
      const tokenUsage = {
        inputTokens: Math.floor(userMessage.length / 4), // Rough estimate
        outputTokens: Math.floor(aiResponse.length / 4),
        totalTokens: Math.floor((userMessage.length + aiResponse.length) / 4)
      };

      await measurement.complete({
        responseLength: aiResponse.length,
        tokenUsage,
        contextMessages: context.length,
        relevantDocuments: relevantDocs.length,
        totalProcessingTimeMs: totalTime
      });

      return {
        response: aiResponse,
        metadata: {
          tokenUsage,
          processingTime: totalTime,
          relevantDocs: relevantDocs.length
        }
      };

    } catch (error) {
      await measurement.error(error, { conversationId, chatbotId });

      // Record error for alerting
      await performanceMonitor.recordError(error, {
        type: MetricType.AI_GENERATION,
        source: 'MonitoredAIService.generateAIResponse',
        chatbotId,
        metadata: { conversationId, userMessage: userMessage.slice(0, 100) }
      });

      throw error;
    }
  }

  private async getConversationContext(conversationId: string) {
    // Implementation would fetch recent messages
    return [];
  }

  private async searchKnowledgeBase(query: string) {
    // Implementation would perform vector search
    return [];
  }
}

/**
 * Example 3: Monitoring Cache Operations
 */
export class MonitoredCacheService {

  async getCachedData<T>(key: string, fetchFunction: () => Promise<T>, ttl: number = 300): Promise<T> {
    const cacheMeasurement = performanceMonitor.startMeasurement(
      MetricType.CACHE_OPERATION,
      'cache_get_or_set',
      { key: key.slice(0, 50), ttl }
    );

    try {
      // Try to get from cache
      const cached = await cache.get<T>(key);

      if (cached !== null) {
        await cacheMeasurement.complete({
          cacheHit: true,
          dataSize: JSON.stringify(cached).length
        });
        return cached;
      }

      // Cache miss - fetch data
      const fetchMeasurement = performanceMonitor.startMeasurement(
        MetricType.DATABASE_QUERY,
        'cache_miss_fetch',
        { cacheKey: key.slice(0, 50) }
      );

      try {
        const data = await fetchFunction();
        await fetchMeasurement.complete({
          dataSize: JSON.stringify(data).length
        });

        // Store in cache
        await cache.set(key, data, ttl);

        await cacheMeasurement.complete({
          cacheHit: false,
          dataSize: JSON.stringify(data).length,
          fetchRequired: true
        });

        return data;

      } catch (fetchError) {
        await fetchMeasurement.error(fetchError);
        throw fetchError;
      }

    } catch (error) {
      await cacheMeasurement.error(error, { key: key.slice(0, 50) });
      throw error;
    }
  }
}

/**
 * Example 4: Monitoring Job Processing
 */
export class MonitoredJobProcessor {

  async processAIResponseJob(jobId: string, payload: any) {
    const measurement = performanceMonitor.startMeasurement(
      MetricType.JOB_PROCESSING,
      'ai_response_job',
      { jobId, conversationId: payload.conversationId }
    );

    try {
      const { conversationId, chatbotId } = payload;

      // Update job progress
      await jobQueue.updateJobProgress(jobId, 10, 'processing');

      // Get user message
      const userMessage = await this.getLatestUserMessage(conversationId);
      await jobQueue.updateJobProgress(jobId, 30, 'processing');

      // Generate AI response
      const aiService = new MonitoredAIService();
      const aiResult = await aiService.generateAIResponse(conversationId, chatbotId, userMessage);
      await jobQueue.updateJobProgress(jobId, 80, 'processing');

      // Save response
      await this.saveAIResponse(conversationId, aiResult.response, aiResult.metadata);
      await jobQueue.updateJobProgress(jobId, 100, 'completed');

      await measurement.complete({
        conversationId,
        chatbotId,
        responseGenerated: true,
        tokenUsage: aiResult.metadata.tokenUsage
      });

      console.log(`AI response job ${jobId} completed successfully`);

    } catch (error) {
      await measurement.error(error, { jobId, payload });
      await jobQueue.updateJobProgress(jobId, 0, 'failed', error.message);

      // Create alert for failed job
      await performanceMonitor.createAlert({
        level: 'error',
        title: 'AI Response Job Failed',
        message: `Job ${jobId} failed: ${error.message}`,
        source: 'MonitoredJobProcessor',
        metadata: { jobId, payload, error: error.message }
      });

      throw error;
    }
  }

  private async getLatestUserMessage(conversationId: string): Promise<string> {
    // Implementation would fetch the latest user message
    return "Hello, how can you help me?";
  }

  private async saveAIResponse(conversationId: string, response: string, metadata: any): Promise<void> {
    // Implementation would save the AI response to database
    const measurement = performanceMonitor.startMeasurement(
      MetricType.DATABASE_QUERY,
      'save_ai_response'
    );

    try {
      // Save to database
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate DB operation

      await measurement.complete({
        conversationId,
        responseLength: response.length,
        metadata
      });
    } catch (error) {
      await measurement.error(error);
      throw error;
    }
  }
}

/**
 * Example 5: HTTP Request Monitoring (Next.js API Route)
 */
export async function monitoredApiHandler(request: Request, context: any) {
  const measurement = performanceMonitor.startMeasurement(
    MetricType.HTTP_REQUEST,
    `${request.method} /api/example`,
    {
      method: request.method,
      userAgent: request.headers.get('User-Agent'),
      contentType: request.headers.get('Content-Type')
    }
  );

  try {
    // Your API logic here
    const body = await request.json();

    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 500));

    const response = { success: true, data: body };

    await measurement.complete({
      statusCode: 200,
      requestSize: JSON.stringify(body).length,
      responseSize: JSON.stringify(response).length,
      userId: context.userId
    });

    return Response.json(response);

  } catch (error) {
    await measurement.error(error, {
      statusCode: 500,
      userId: context.userId
    });

    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Example 6: User Action Monitoring
 */
export class MonitoredUserService {

  async trackUserAction(
    action: string,
    userId: string,
    chatbotId?: string,
    metadata?: Record<string, any>
  ) {
    const measurement = performanceMonitor.startMeasurement(
      MetricType.USER_ACTION,
      action,
      { userId, chatbotId, ...metadata }
    );

    try {
      // Log user action
      console.log(`User ${userId} performed action: ${action}`);

      // Track in analytics
      await this.recordUserActionAnalytics(action, userId, chatbotId, metadata);

      await measurement.complete({
        success: true,
        userId,
        chatbotId,
        action
      });

    } catch (error) {
      await measurement.error(error, { userId, chatbotId, action });
      throw error;
    }
  }

  private async recordUserActionAnalytics(
    action: string,
    userId: string,
    chatbotId?: string,
    metadata?: Record<string, any>
  ) {
    // Implementation would record to analytics tables
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Example 7: Health Check Integration
 */
export class ApplicationHealthChecker {

  async performComprehensiveHealthCheck() {
    console.log('Starting comprehensive health check...');

    // Check database connectivity
    const dbService = new MonitoredDatabaseService();
    try {
      await dbService.getConversationMessages('test', 1);
      console.log('✅ Database health check passed');
    } catch (error) {
      console.error('❌ Database health check failed:', error.message);
      await performanceMonitor.createAlert({
        level: 'critical',
        title: 'Database Health Check Failed',
        message: `Database connectivity issue: ${error.message}`,
        source: 'ApplicationHealthChecker'
      });
    }

    // Check cache connectivity
    const cacheService = new MonitoredCacheService();
    try {
      await cacheService.getCachedData('health-check', async () => ({ status: 'ok' }), 60);
      console.log('✅ Cache health check passed');
    } catch (error) {
      console.error('❌ Cache health check failed:', error.message);
      await performanceMonitor.createAlert({
        level: 'critical',
        title: 'Cache Health Check Failed',
        message: `Cache connectivity issue: ${error.message}`,
        source: 'ApplicationHealthChecker'
      });
    }

    // Check job queue health
    try {
      const queueStats = await jobQueue.getQueueStats();
      const unhealthyQueues = Object.values(queueStats).filter(stat => !stat.healthy);

      if (unhealthyQueues.length > 0) {
        await performanceMonitor.createAlert({
          level: 'warning',
          title: 'Job Queue Health Degraded',
          message: `${unhealthyQueues.length} job queues are unhealthy`,
          source: 'ApplicationHealthChecker',
          metadata: { queueStats }
        });
      } else {
        console.log('✅ Job queue health check passed');
      }
    } catch (error) {
      console.error('❌ Job queue health check failed:', error.message);
    }

    console.log('Health check completed');
  }
}

/**
 * Example 8: Application Startup Monitoring
 */
export async function initializeMonitoredApplication() {
  const startupMeasurement = performanceMonitor.startMeasurement(
    MetricType.USER_ACTION,
    'application_startup'
  );

  try {
    console.log('Starting monitored application...');

    // Initialize database connections
    const dbMeasurement = performanceMonitor.startMeasurement(
      MetricType.DATABASE_QUERY,
      'database_initialization'
    );

    // Database initialization would go here
    await new Promise(resolve => setTimeout(resolve, 500));
    await dbMeasurement.complete();

    // Initialize cache
    const cacheMeasurement = performanceMonitor.startMeasurement(
      MetricType.CACHE_OPERATION,
      'cache_initialization'
    );

    // Cache initialization would go here
    await new Promise(resolve => setTimeout(resolve, 200));
    await cacheMeasurement.complete();

    // Start job queue processing
    const jobMeasurement = performanceMonitor.startMeasurement(
      MetricType.JOB_PROCESSING,
      'job_queue_initialization'
    );

    // Job queue initialization would go here
    await new Promise(resolve => setTimeout(resolve, 100));
    await jobMeasurement.complete();

    // Run initial health check
    const healthChecker = new ApplicationHealthChecker();
    await healthChecker.performComprehensiveHealthCheck();

    await startupMeasurement.complete({
      success: true,
      componentsInitialized: ['database', 'cache', 'job_queue', 'health_checker']
    });

    console.log('✅ Application started successfully with monitoring enabled');

  } catch (error) {
    await startupMeasurement.error(error);

    await performanceMonitor.createAlert({
      level: 'critical',
      title: 'Application Startup Failed',
      message: `Application failed to start: ${error.message}`,
      source: 'ApplicationStartup',
      metadata: { error: error.message, stack: error.stack }
    });

    throw error;
  }
}

// Export monitoring instances for use throughout the application
export const monitoredServices = {
  database: new MonitoredDatabaseService(),
  ai: new MonitoredAIService(),
  cache: new MonitoredCacheService(),
  jobProcessor: new MonitoredJobProcessor(),
  userService: new MonitoredUserService(),
  healthChecker: new ApplicationHealthChecker()
};

/**
 * Usage Examples:
 *
 * // In an API route:
 * export async function POST(request: NextRequest) {
 *   return monitoredApiHandler(request, { userId: 'user-123' });
 * }
 *
 * // In a service:
 * const messages = await monitoredServices.database.getConversationMessages('conv-123');
 *
 * // Track user actions:
 * await monitoredServices.userService.trackUserAction('start_conversation', 'user-123', 'bot-456');
 *
 * // In job processors:
 * await monitoredServices.jobProcessor.processAIResponseJob('job-123', payload);
 *
 * // Application startup:
 * await initializeMonitoredApplication();
 */