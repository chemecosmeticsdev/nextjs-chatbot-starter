import { jobQueue, JobType, JobPriority, type Job } from './job-queue';
import { cache, CacheKeys } from './cache-service';
import { CachedAnalyticsService } from './cached-analytics';
// Dynamic import for enhanced-document-processor to prevent build-time initialization

/**
 * Get enhanced document processor with dynamic import to prevent build-time initialization
 */
async function getEnhancedDocumentProcessor() {
  try {
    const { enhancedDocumentProcessor } = await import('./enhanced-document-processor');
    return enhancedDocumentProcessor;
  } catch (error) {
    console.error('[JobProcessors] Failed to load enhanced document processor:', error);
    throw new Error('Enhanced document processor unavailable');
  }
}

import { vectorStorage } from './vector-storage';
import { db, getConnectionHealth, resetConnectionMetrics } from '@/lib/db';
import { chatbotMessages, chatbotConversations, chatbotInstances, documents, activityLogs } from '@/lib/db/schema';
import { eq, and, count, avg, sql, desc, gte } from 'drizzle-orm';

/**
 * Base job processor interface
 */
export interface JobProcessor {
  process(job: Job): Promise<void>;
  canProcess(jobType: JobType): boolean;
}

/**
 * AI Response Generation Processor
 * Generates AI responses for chatbot conversations
 */
export class AIResponseProcessor implements JobProcessor {
  canProcess(jobType: JobType): boolean {
    return jobType === JobType.AI_RESPONSE_GENERATION;
  }

  async process(job: Job): Promise<void> {
    const { conversationId, chatbotId } = job.payload;

    try {
      // Update job status to processing
      await jobQueue.updateJobProgress(job.id, 10, 'processing');

      // Get conversation context
      const conversation = await this.getConversationContext(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      await jobQueue.updateJobProgress(job.id, 30, 'processing');

      // Get chatbot configuration
      const chatbot = await this.getChatbotConfig(chatbotId);
      if (!chatbot) {
        throw new Error(`Chatbot ${chatbotId} not found`);
      }

      await jobQueue.updateJobProgress(job.id, 50, 'processing');

      // Generate AI response (placeholder - integrate with AWS Bedrock)
      const aiResponse = await this.generateAIResponse(conversation, chatbot);

      await jobQueue.updateJobProgress(job.id, 80, 'processing');

      // Save AI response to database
      await this.saveAIResponse(conversationId, aiResponse);

      await jobQueue.updateJobProgress(job.id, 100, 'completed');

      console.log(`AI response generated for conversation ${conversationId}`);

    } catch (error) {
      console.error(`AI response generation failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);
      throw error;
    }
  }

  private async getConversationContext(conversationId: string) {
    // Get recent messages for context
    const messages = await db
      .select({
        role: chatbotMessages.role,
        content: chatbotMessages.content,
        createdAt: chatbotMessages.createdAt
      })
      .from(chatbotMessages)
      .where(eq(chatbotMessages.conversationId, conversationId))
      .orderBy(chatbotMessages.createdAt)
      .limit(20);

    const conversation = await db
      .select()
      .from(chatbotConversations)
      .where(eq(chatbotConversations.id, conversationId))
      .limit(1);

    return {
      conversation: conversation[0],
      messages
    };
  }

  private async getChatbotConfig(chatbotId: string) {
    const result = await db
      .select()
      .from(chatbotInstances)
      .where(eq(chatbotInstances.id, chatbotId))
      .limit(1);

    return result[0];
  }

  private async generateAIResponse(context: any, chatbot: any): Promise<string> {
    // Placeholder for AWS Bedrock integration
    // In real implementation, this would:
    // 1. Format conversation history for the model
    // 2. Include system prompt from chatbot settings
    // 3. Call AWS Bedrock Nova Micro model
    // 4. Handle streaming responses
    // 5. Apply content filtering

    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing time

    return `AI response generated at ${new Date().toISOString()}`;
  }

  private async saveAIResponse(conversationId: string, content: string) {
    // Save AI message to database
    await db.insert(chatbotMessages).values({
      id: crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      content,
      metadata: JSON.stringify({
        jobProcessedAt: new Date().toISOString(),
        llmModel: 'nova-micro'
      }),
      createdAt: new Date()
    });

    // Update conversation timestamp
    await db
      .update(chatbotConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatbotConversations.id, conversationId));

    // Invalidate conversation cache
    await cache.invalidate(`conversation:${conversationId}*`);
  }
}

/**
 * Enhanced Document Processing Processor
 * Handles all document processing pipeline steps using our integrated services
 */
export class EnhancedDocumentProcessingProcessor implements JobProcessor {
  canProcess(jobType: JobType): boolean {
    return [
      JobType.DOCUMENT_DOWNLOAD,
      JobType.COMPLETE_DOCUMENT_PIPELINE,
      JobType.TEXT_EXTRACTION,
      JobType.METADATA_ENHANCEMENT,
      JobType.DOCUMENT_CHUNKING,
      JobType.EMBEDDING_GENERATION,
      JobType.VECTOR_STORAGE,
      JobType.DOCUMENT_REPROCESSING,
      JobType.VECTOR_REINDEXING
    ].includes(jobType);
  }

  async process(job: Job): Promise<void> {
    try {
      const enhancedDocumentProcessor = await getEnhancedDocumentProcessor();

      switch (job.type) {
        case JobType.DOCUMENT_DOWNLOAD:
          await enhancedDocumentProcessor.processDocumentDownload(job);
          break;
        case JobType.COMPLETE_DOCUMENT_PIPELINE:
          await enhancedDocumentProcessor.processCompleteDocumentPipeline(job);
          break;
        case JobType.TEXT_EXTRACTION:
          await enhancedDocumentProcessor.processTextExtraction(job);
          break;
        case JobType.METADATA_ENHANCEMENT:
          await enhancedDocumentProcessor.processMetadataEnhancement(job);
          break;
        case JobType.DOCUMENT_CHUNKING:
          await enhancedDocumentProcessor.processDocumentChunking(job);
          break;
        case JobType.EMBEDDING_GENERATION:
          await enhancedDocumentProcessor.processEmbeddingGeneration(job);
          break;
        case JobType.VECTOR_STORAGE:
          await enhancedDocumentProcessor.processVectorStorage(job);
          break;
        case JobType.DOCUMENT_REPROCESSING:
          await this.processDocumentReprocessing(job);
          break;
        case JobType.VECTOR_REINDEXING:
          await this.processVectorReindexing(job);
          break;
        default:
          throw new Error(`Unsupported job type: ${job.type}`);
      }
    } catch (error) {
      console.error(`Enhanced document processing failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);
      throw error;
    }
  }

  private async processDocumentReprocessing(job: Job): Promise<void> {
    const { documentId, forceReprocess = false } = job.payload;

    try {
      await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Starting document reprocessing');

      // Check if document exists
      const documentResult = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (documentResult.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }

      await jobQueue.updateJobProgress(job.id, 30, 'processing', 'Cleaning existing data');

      // Delete existing vector data if forcing reprocess
      if (forceReprocess) {
        await vectorStorage.deleteDocumentChunks(documentId);
      }

      await jobQueue.updateJobProgress(job.id, 50, 'processing', 'Queueing complete pipeline');

      // Queue complete document pipeline
      await jobQueue.addJob({
        type: JobType.COMPLETE_DOCUMENT_PIPELINE,
        priority: JobPriority.NORMAL,
        payload: {
          documentId,
          userId: job.metadata?.userId || 'system',
          forceReprocess: true,
          skipSteps: forceReprocess ? [] : ['download'] // Skip download if not forcing complete reprocess
        },
        metadata: { documentId }
      });

      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Document reprocessing queued');

    } catch (error) {
      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Reprocessing failed: ${error.message}`);
      throw error;
    }
  }

  private async processVectorReindexing(job: Job): Promise<void> {
    const { documentIds } = job.payload;

    try {
      await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Starting vector reindexing');

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw new Error('No document IDs provided for reindexing');
      }

      await jobQueue.updateJobProgress(job.id, 30, 'processing', 'Reindexing vectors');

      // Use vector storage reindexing
      const reindexResult = await vectorStorage.reindexEmbeddings(documentIds);

      await jobQueue.updateJobProgress(job.id, 80, 'processing', 'Updating job status');

      if (reindexResult.failed > 0) {
        console.warn(`Vector reindexing partially failed: ${reindexResult.failed}/${documentIds.length} documents failed`);
      }

      await jobQueue.updateJobProgress(
        job.id,
        100,
        'completed',
        `Reindexing completed: ${reindexResult.success} success, ${reindexResult.failed} failed`
      );

    } catch (error) {
      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Vector reindexing failed: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Legacy Document Processing Processor (kept for backward compatibility)
 * Processes uploaded documents for knowledge base
 */
export class DocumentProcessor implements JobProcessor {
  canProcess(jobType: JobType): boolean {
    return jobType === JobType.DOCUMENT_PROCESSING;
  }

  async process(job: Job): Promise<void> {
    const { documentId } = job.payload;

    try {
      await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Legacy document processing - migrating to enhanced pipeline');

      // Migrate to enhanced document processing pipeline
      await jobQueue.addJob({
        type: JobType.COMPLETE_DOCUMENT_PIPELINE,
        priority: JobPriority.NORMAL,
        payload: {
          documentId,
          userId: job.metadata?.userId || 'system',
          skipSteps: ['download'] // Assume document is already downloaded
        },
        metadata: { documentId, migratedFrom: 'legacy' }
      });

      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Migrated to enhanced pipeline');

      console.log(`Legacy document processing migrated to enhanced pipeline for ${documentId}`);

    } catch (error) {
      console.error(`Document processing migration failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);
      throw error;
    }
  }
}

/**
 * Analytics Update Processor
 * Updates conversation analytics and metrics
 */
export class AnalyticsProcessor implements JobProcessor {
  canProcess(jobType: JobType): boolean {
    return jobType === JobType.CONVERSATION_ANALYTICS ||
           jobType === JobType.DASHBOARD_METRICS_UPDATE ||
           jobType === JobType.USAGE_STATS_CALCULATION;
  }

  async process(job: Job): Promise<void> {
    const { chatbotId } = job.payload;

    try {
      await jobQueue.updateJobProgress(job.id, 20, 'processing');

      switch (job.type) {
        case JobType.CONVERSATION_ANALYTICS:
          await this.updateConversationAnalytics(chatbotId, job.id);
          break;
        case JobType.DASHBOARD_METRICS_UPDATE:
          await this.updateDashboardMetrics(chatbotId, job.id);
          break;
        case JobType.USAGE_STATS_CALCULATION:
          await this.calculateUsageStats(chatbotId, job.id);
          break;
      }

      await jobQueue.updateJobProgress(job.id, 100, 'completed');

      console.log(`Analytics update completed for chatbot ${chatbotId}`);

    } catch (error) {
      console.error(`Analytics processing failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);
      throw error;
    }
  }

  private async updateConversationAnalytics(chatbotId: string, jobId: string) {
    await jobQueue.updateJobProgress(jobId, 40, 'processing');

    try {
      // Get total conversations count
      const totalConversationsResult = await db
        .select({ count: count() })
        .from(chatbotConversations)
        .where(eq(chatbotConversations.chatbotId, chatbotId));

      // Get active conversations (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeConversationsResult = await db
        .select({ count: count() })
        .from(chatbotConversations)
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            gte(chatbotConversations.updatedAt, oneDayAgo)
          )
        );

      // Get total messages count
      const totalMessagesResult = await db
        .select({ count: count() })
        .from(chatbotMessages)
        .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
        .where(eq(chatbotConversations.chatbotId, chatbotId));

      // Calculate average response time (simplified - based on message intervals)
      const avgResponseTimeResult = await db
        .select({
          avgInterval: avg(sql`EXTRACT(EPOCH FROM (${chatbotMessages.createdAt} - LAG(${chatbotMessages.createdAt}) OVER (PARTITION BY ${chatbotMessages.conversationId} ORDER BY ${chatbotMessages.createdAt})))`)
        })
        .from(chatbotMessages)
        .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            eq(chatbotMessages.role, 'assistant')
          )
        );

      const analytics = {
        totalConversations: totalConversationsResult[0]?.count || 0,
        activeConversations: activeConversationsResult[0]?.count || 0,
        avgResponseTime: Math.round(Number(avgResponseTimeResult[0]?.avgInterval) || 0),
        totalMessages: totalMessagesResult[0]?.count || 0,
        updatedAt: new Date().toISOString()
      };

      // Cache analytics results
      await cache.set(
        CacheKeys.analytics(`conversation:${chatbotId}`),
        analytics,
        3600 // 1 hour
      );

      console.log(`Conversation analytics updated for chatbot ${chatbotId}:`, analytics);
    } catch (error) {
      console.error(`Error updating conversation analytics for chatbot ${chatbotId}:`, error);
      // Fallback to cached analytics service
      try {
        const fallbackAnalytics = await CachedAnalyticsService.getChatbotStats(chatbotId);
        await cache.set(
          CacheKeys.analytics(`conversation:${chatbotId}`),
          fallbackAnalytics,
          3600
        );
      } catch (fallbackError) {
        console.error('Fallback analytics also failed:', fallbackError);
      }
    }
  }

  private async updateDashboardMetrics(chatbotId: string, jobId: string) {
    await jobQueue.updateJobProgress(jobId, 60, 'processing');

    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get conversations created in last 24 hours
      const conversations24hResult = await db
        .select({ count: count() })
        .from(chatbotConversations)
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            gte(chatbotConversations.createdAt, oneDayAgo)
          )
        );

      // Get messages sent in last 24 hours
      const messages24hResult = await db
        .select({ count: count() })
        .from(chatbotMessages)
        .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            gte(chatbotMessages.createdAt, oneDayAgo)
          )
        );

      // Get unique active users in last 24 hours (based on distinct sessionIds from conversation metadata)
      const activeUsers24hResult = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${chatbotConversations.sessionId})`
        })
        .from(chatbotConversations)
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            gte(chatbotConversations.updatedAt, oneDayAgo)
          )
        );

      // Calculate average response time for messages in last 24 hours
      const avgResponseTime24hResult = await db
        .select({
          avgInterval: avg(sql`EXTRACT(EPOCH FROM (${chatbotMessages.createdAt} - LAG(${chatbotMessages.createdAt}) OVER (PARTITION BY ${chatbotMessages.conversationId} ORDER BY ${chatbotMessages.createdAt})))`)
        })
        .from(chatbotMessages)
        .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            eq(chatbotMessages.role, 'assistant'),
            gte(chatbotMessages.createdAt, oneDayAgo)
          )
        );

      const metrics = {
        conversations24h: conversations24hResult[0]?.count || 0,
        messages24h: messages24hResult[0]?.count || 0,
        avgResponseTime24h: Math.round(Number(avgResponseTime24hResult[0]?.avgInterval) || 0),
        activeUsers24h: activeUsers24hResult[0]?.count || 0,
        updatedAt: new Date().toISOString()
      };

      await cache.set(
        CacheKeys.dashboardMetrics(chatbotId, '24h'),
        metrics,
        300 // 5 minutes
      );

      console.log(`Dashboard metrics updated for chatbot ${chatbotId}:`, metrics);
    } catch (error) {
      console.error(`Error updating dashboard metrics for chatbot ${chatbotId}:`, error);
      // Fallback to cached analytics service
      try {
        const fallbackMetrics = await CachedAnalyticsService.getDashboardMetrics(chatbotId);
        await cache.set(
          CacheKeys.dashboardMetrics(chatbotId, '24h'),
          fallbackMetrics,
          300
        );
      } catch (fallbackError) {
        console.error('Fallback dashboard metrics also failed:', fallbackError);
      }
    }
  }

  private async calculateUsageStats(chatbotId: string, jobId: string) {
    await jobQueue.updateJobProgress(jobId, 80, 'processing');

    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get messages count for this month
      const messagesThisMonthResult = await db
        .select({ count: count() })
        .from(chatbotMessages)
        .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            gte(chatbotMessages.createdAt, firstDayOfMonth)
          )
        );

      // Calculate estimated token usage (approximate: 4 chars per token)
      const messageContentResult = await db
        .select({
          totalLength: sql<number>`SUM(LENGTH(${chatbotMessages.content}))`
        })
        .from(chatbotMessages)
        .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
        .where(
          and(
            eq(chatbotConversations.chatbotId, chatbotId),
            gte(chatbotMessages.createdAt, firstDayOfMonth)
          )
        );

      // Get storage usage from documents related to this chatbot
      const storageUsageResult = await db
        .select({
          totalSize: sql<number>`SUM(COALESCE(${documents.fileSize}, 0))`
        })
        .from(documents)
        .where(eq(documents.chatbotId, chatbotId));

      // Count API calls from activity logs this month
      const apiCallsResult = await db
        .select({ count: count() })
        .from(activityLogs)
        .where(
          and(
            eq(activityLogs.resourceType, 'api_call'),
            sql`${activityLogs.metadata}->>'chatbotId' = ${chatbotId}`,
            gte(activityLogs.createdAt, firstDayOfMonth)
          )
        );

      const totalContentLength = Number(messageContentResult[0]?.totalLength) || 0;
      const estimatedTokens = Math.ceil(totalContentLength / 4); // Rough estimate: 4 chars per token

      const stats = {
        messagesThisMonth: messagesThisMonthResult[0]?.count || 0,
        tokensUsed: estimatedTokens,
        storageUsed: Number(storageUsageResult[0]?.totalSize) || 0,
        apiCalls: apiCallsResult[0]?.count || 0,
        updatedAt: new Date().toISOString()
      };

      await cache.set(
        CacheKeys.analytics(`usage:${chatbotId}:${now.getMonth()}`),
        stats,
        86400 // 24 hours
      );

      console.log(`Usage statistics calculated for chatbot ${chatbotId}:`, stats);
    } catch (error) {
      console.error(`Error calculating usage stats for chatbot ${chatbotId}:`, error);
      // Fallback to basic stats
      const fallbackStats = {
        messagesThisMonth: 0,
        tokensUsed: 0,
        storageUsed: 0,
        apiCalls: 0,
        updatedAt: new Date().toISOString()
      };

      await cache.set(
        CacheKeys.analytics(`usage:${chatbotId}:${new Date().getMonth()}`),
        fallbackStats,
        86400
      );
    }
  }
}

/**
 * Google Drive Processing Processor
 * Handles Google Drive folder and file processing jobs
 */
export class GoogleDriveProcessor implements JobProcessor {
  canProcess(jobType: JobType): boolean {
    return [
      JobType.GDRIVE_FOLDER_PROCESSING,
      JobType.GDRIVE_FILE_PROCESSING
    ].includes(jobType);
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.type) {
        case JobType.GDRIVE_FOLDER_PROCESSING:
          await this.processGoogleDriveFolder(job);
          break;
        case JobType.GDRIVE_FILE_PROCESSING:
          await this.processGoogleDriveFile(job);
          break;
        default:
          throw new Error(`Unsupported Google Drive job type: ${job.type}`);
      }
    } catch (error) {
      console.error(`Google Drive processing failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);
      throw error;
    }
  }

  private async processGoogleDriveFolder(job: Job): Promise<void> {
    const { folderId, documentIds, userId, settings, folderStructure, processingMethod } = job.payload;

    await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Starting Google Drive folder processing');
    console.log(`Processing Google Drive folder ${folderId} with ${documentIds.length} documents`);

    try {
      // Process each document using the enhanced document processing pipeline
      const totalDocuments = documentIds.length;
      let processedCount = 0;

      for (const documentId of documentIds) {
        try {
          // Create individual complete document pipeline job
          const completeJob = {
            type: JobType.COMPLETE_DOCUMENT_PIPELINE,
            priority: JobPriority.NORMAL,
            payload: {
              documentId,
              userId,
              googleDriveFileId: 'extracted-from-db', // Will be extracted from document record
              forceReprocess: false,
              settings: {
                extractText: settings.extractText,
                generateSummary: settings.generateSummary,
                enableSearch: settings.enableSearch,
                processImages: settings.processImages,
                autoTag: settings.autoTag,
                useLocalDocling: settings.useLocalDocling
              }
            },
            metadata: { documentId, userId, folderId }
          };

          // Process through enhanced document processor directly
          const enhancedDocumentProcessor = await getEnhancedDocumentProcessor();
          await enhancedDocumentProcessor.processCompleteDocumentPipeline(completeJob);

          processedCount++;
          const progress = Math.round(10 + (processedCount / totalDocuments) * 85);
          await jobQueue.updateJobProgress(
            job.id,
            progress,
            'processing',
            `Processed ${processedCount}/${totalDocuments} documents`
          );

          console.log(`Successfully processed document ${documentId} (${processedCount}/${totalDocuments})`);

        } catch (error) {
          console.error(`Failed to process document ${documentId}:`, error);
          // Continue processing other documents even if one fails
          processedCount++;

          // Update document status to failed
          await db
            .update(documents)
            .set({
              processingStatus: 'failed',
              processingError: error instanceof Error ? error.message : 'Unknown error'
            })
            .where(eq(documents.id, documentId));
        }
      }

      await jobQueue.updateJobProgress(job.id, 100, 'completed', `Google Drive folder processing completed: ${processedCount}/${totalDocuments} documents processed`);
      console.log(`Google Drive folder processing completed for ${folderId}: ${processedCount}/${totalDocuments} documents processed`);

    } catch (error) {
      console.error(`Google Drive folder processing failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);
      throw error;
    }
  }

  private async processGoogleDriveFile(job: Job): Promise<void> {
    const { fileId, documentId, userId } = job.payload;

    await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Starting Google Drive file processing');
    console.log(`Processing Google Drive file ${fileId} for document ${documentId}`);

    try {
      // Create complete document pipeline job for this single file
      const completeJob = {
        type: JobType.COMPLETE_DOCUMENT_PIPELINE,
        priority: JobPriority.NORMAL,
        payload: {
          documentId,
          userId,
          googleDriveFileId: fileId,
          forceReprocess: false
        },
        metadata: { documentId, userId, fileId }
      };

      // Process through enhanced document processor
      const enhancedDocumentProcessor = await getEnhancedDocumentProcessor();
      await enhancedDocumentProcessor.processCompleteDocumentPipeline(completeJob);

      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Google Drive file processing completed');
      console.log(`Google Drive file processing completed for ${fileId}`);

    } catch (error) {
      console.error(`Google Drive file processing failed for job ${job.id}:`, error);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', error.message);

      // Update document status to failed
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: error instanceof Error ? error.message : 'Unknown error'
        })
        .where(eq(documents.id, documentId));

      throw error;
    }
  }
}

/**
 * Job Queue Manager
 * Orchestrates job processing across multiple processors
 */
export class JobQueueManager {
  private processors: JobProcessor[] = [];
  private isRunning = false;
  private processIntervals: Map<JobPriority, NodeJS.Timeout> = new Map();
  private failureTracker: Map<string, number[]> = new Map();

  // Memory management properties
  private memoryUsageInterval?: NodeJS.Timeout;
  private lastMemoryCheck = 0;
  private maxConcurrentJobs = 2; // Reduced from 5 to 2 for better memory management
  private currentlyProcessing = 0;
  private memoryThreshold = process.env.NODE_ENV === 'development' ? 0.70 : 0.70; // 70% in both dev and production for stability
  private memoryWarned = false;

  constructor() {
    this.registerProcessors();
  }

  private registerProcessors() {
    this.processors.push(
      new AIResponseProcessor(),
      new EnhancedDocumentProcessingProcessor(),
      new GoogleDriveProcessor(), // Google Drive folder and file processing
      new DocumentProcessor(), // Legacy processor for backward compatibility
      new AnalyticsProcessor()
    );
  }

  /**
   * Monitor memory usage and adjust processing accordingly
   */
  private checkMemoryUsage(): boolean {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUtilization = usedMemory / totalMemory;

    // Log memory usage periodically
    const now = Date.now();
    if (now - this.lastMemoryCheck > 30000) { // Every 30 seconds
      console.log(`[JobQueue] Memory usage: ${Math.round(memoryUtilization * 100)}% (${Math.round(usedMemory / 1024 / 1024)}MB used / ${Math.round(totalMemory / 1024 / 1024)}MB total)`);
      this.lastMemoryCheck = now;
    }

    // Warn at 80% memory usage
    if (memoryUtilization > 0.8 && !this.memoryWarned) {
      console.warn(`[JobQueue] High memory usage detected: ${Math.round(memoryUtilization * 100)}%`);
      this.memoryWarned = true;
    } else if (memoryUtilization < 0.7) {
      this.memoryWarned = false;
    }

    // Pause processing at threshold
    if (memoryUtilization > this.memoryThreshold) {
      console.warn(`[JobQueue] Memory threshold exceeded (${Math.round(memoryUtilization * 100)}%), pausing job processing`);
      return false;
    }

    return true;
  }

  /**
   * Cleanup memory by forcing garbage collection and clearing caches
   */
  private async performMemoryCleanup(): Promise<void> {
    try {
      // Force garbage collection if available
      if (global.gc) {
        console.log('[JobQueue] Performing garbage collection...');
        global.gc();
      }

      // Clear failure tracker of old entries
      this.cleanupFailureTracker();

      console.log('[JobQueue] Memory cleanup completed');
    } catch (error) {
      console.error('[JobQueue] Error during memory cleanup:', error);
    }
  }

  /**
   * Clean up old failure tracker entries
   */
  private cleanupFailureTracker(): void {
    const now = Date.now();
    const timeWindowMs = 10 * 60 * 1000; // 10 minutes

    let totalEntries = 0;
    let removedEntries = 0;

    for (const [key, failures] of this.failureTracker.entries()) {
      totalEntries++;
      const recentFailures = failures.filter(timestamp => now - timestamp < timeWindowMs);

      if (recentFailures.length === 0) {
        this.failureTracker.delete(key);
        removedEntries++;
      } else if (recentFailures.length < failures.length) {
        this.failureTracker.set(key, recentFailures);
      }
    }

    if (removedEntries > 0) {
      console.log(`[JobQueue] Cleaned ${removedEntries}/${totalEntries} failure tracker entries`);
    }
  }

  /**
   * Start processing jobs from all priority queues
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Job queue manager is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting job queue manager...');

    // Start processors for each priority level with optimized intervals for memory management
    const intervals = {
      [JobPriority.CRITICAL]: 2000,  // 2 seconds (reduced frequency)
      [JobPriority.HIGH]: 5000,     // 5 seconds (reduced frequency)
      [JobPriority.NORMAL]: 10000,  // 10 seconds (reduced frequency)
      [JobPriority.LOW]: 30000      // 30 seconds (reduced frequency)
    };

    for (const [priority, interval] of Object.entries(intervals)) {
      const timer = setInterval(async () => {
        if (!this.isRunning) return;

        // Check memory before processing
        if (!this.checkMemoryUsage()) {
          // Skip processing if memory is too high
          return;
        }

        await this.processQueue(priority as JobPriority);
      }, interval);

      this.processIntervals.set(priority as JobPriority, timer);
    }

    // Start memory monitoring with more aggressive cleanup
    this.memoryUsageInterval = setInterval(() => {
      this.checkMemoryUsage();

      // Perform cleanup every 2 minutes (more frequent)
      const now = Date.now();
      if (now - this.lastMemoryCheck > 120000) { // 2 minutes
        this.performMemoryCleanup();
      }
    }, 30000); // Check every 30 seconds (more frequent monitoring)

    console.log('Job queue manager started');
  }

  /**
   * Stop processing jobs
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping job queue manager...');
    this.isRunning = false;

    // Clear all intervals
    for (const timer of this.processIntervals.values()) {
      clearInterval(timer);
    }
    this.processIntervals.clear();

    // Clear memory monitoring interval
    if (this.memoryUsageInterval) {
      clearInterval(this.memoryUsageInterval);
      this.memoryUsageInterval = undefined;
    }

    console.log('Job queue manager stopped');
  }

  /**
   * Process jobs from a specific priority queue
   */
  private async processQueue(priority: JobPriority): Promise<void> {
    try {
      // Check if we're at max concurrent jobs
      if (this.currentlyProcessing >= this.maxConcurrentJobs) {
        return;
      }

      // Adjust batch size based on current processing load
      const availableSlots = this.maxConcurrentJobs - this.currentlyProcessing;
      const batchSize = Math.min(availableSlots, 3);

      const jobsToProcess = await jobQueue.receiveJobs(priority, batchSize);

      if (jobsToProcess.length === 0) {
        return;
      }

      // Process jobs with concurrency control
      const processingPromises = jobsToProcess.map(async ({ job, receiptHandle }) => {
        this.currentlyProcessing++;
        try {
          await this.processJob(job, receiptHandle, priority);
        } finally {
          this.currentlyProcessing--;
        }
      });

      await Promise.all(processingPromises);
    } catch (error) {
      console.error(`Error processing ${priority} priority queue:`, error);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job, receiptHandle: string, priority: JobPriority): Promise<void> {
    const processor = this.processors.find(p => p.canProcess(job.type));

    if (!processor) {
      console.error(`No processor found for job type: ${job.type}`);
      await jobQueue.completeJob(receiptHandle, priority);
      await jobQueue.updateJobProgress(job.id, 0, 'failed', 'No processor available');
      return;
    }

    try {
      console.log(`Processing job ${job.id} (type: ${job.type}, priority: ${priority})`);

      // Check if job was cancelled
      const status = await jobQueue.getJobStatus(job.id);
      if (status.error === 'Job cancelled by user') {
        console.log(`Job ${job.id} was cancelled, skipping`);
        await jobQueue.completeJob(receiptHandle, priority);
        return;
      }

      // Process the job
      await processor.process(job);

      // Mark job as completed in SQS
      await jobQueue.completeJob(receiptHandle, priority);

      console.log(`Job ${job.id} completed successfully`);

    } catch (error) {
      console.error(`Job ${job.id} processing failed:`, error);

      // CIRCUIT BREAKER: Check for permanent failures that should not be retried
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPermanentFailure = errorMessage.startsWith('PERMANENT_FAILURE:');

      if (isPermanentFailure) {
        console.warn(`[CircuitBreaker] Job ${job.id} marked as permanent failure - will not retry`);
        await jobQueue.updateJobProgress(job.id, 0, 'failed', errorMessage.replace('PERMANENT_FAILURE: ', ''));

        // Remove from queue immediately - no retry
        await jobQueue.completeJob(receiptHandle, priority);
        return;
      }

      // Handle normal retry logic for transient failures
      const retryCount = (job.metadata?.retryCount || 0) + 1;
      const maxRetries = job.metadata?.maxRetries || 3;

      // Circuit breaker for repeated similar failures
      const failurePattern = this.categorizeFailure(errorMessage);
      const recentFailures = await this.getRecentFailureCount(job.type, failurePattern);

      // If we've seen too many similar failures recently, treat as permanent
      if (recentFailures >= 10) {
        console.warn(`[CircuitBreaker] Too many similar failures for job type ${job.type} (pattern: ${failurePattern}). Marking as permanent failure.`);
        await jobQueue.updateJobProgress(job.id, 0, 'failed', `Circuit breaker activated: ${errorMessage}`);
        await jobQueue.completeJob(receiptHandle, priority);
        return;
      }

      if (retryCount < maxRetries) {
        console.log(`Retrying job ${job.id} (attempt ${retryCount}/${maxRetries})`);

        // Re-queue the job with incremented retry count
        await jobQueue.addJob({
          ...job,
          metadata: {
            ...job.metadata,
            retryCount
          }
        });
      } else {
        console.error(`Job ${job.id} failed after ${maxRetries} attempts`);
        await jobQueue.updateJobProgress(job.id, 0, 'failed', errorMessage);
      }

      // Remove from queue
      await jobQueue.completeJob(receiptHandle, priority);
    }
  }

  /**
   * Categorize failure for circuit breaker pattern detection
   */
  private categorizeFailure(errorMessage: string): string {
    if (errorMessage.includes('File not found')) return 'file_not_found';
    if (errorMessage.includes('Google Drive authentication failed')) return 'auth_failed';
    if (errorMessage.includes('No chunks provided')) return 'no_chunks';
    if (errorMessage.includes('No valid chunks found')) return 'invalid_chunks';
    if (errorMessage.includes('missing userId')) return 'missing_user_id';
    if (errorMessage.includes('chunks with embeddings array is required')) return 'no_embeddings';
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) return 'timeout';
    if (errorMessage.includes('network') || errorMessage.includes('fetch failed')) return 'network_error';

    // Generic categorization
    return 'unknown_error';
  }

  /**
   * Get recent failure count for circuit breaker (simplified in-memory implementation)
   */
  private async getRecentFailureCount(jobType: JobType, failurePattern: string): Promise<number> {
    // Simple in-memory tracking - in production this could use Redis or database
    const key = `${jobType}:${failurePattern}`;
    const now = Date.now();
    const timeWindowMs = 10 * 60 * 1000; // 10 minutes

    // Initialize failure tracking if not exists
    if (!this.failureTracker) {
      this.failureTracker = new Map();
    }

    const failures = this.failureTracker.get(key) || [];

    // Remove old failures outside time window
    const recentFailures = failures.filter(timestamp => now - timestamp < timeWindowMs);

    // Add current failure
    recentFailures.push(now);

    // Store updated list
    this.failureTracker.set(key, recentFailures);

    return recentFailures.length;
  }

  /**
   * Get processing status
   */
  getStatus(): {
    running: boolean;
    queueCount: number;
    currentlyProcessing: number;
    maxConcurrentJobs: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      utilization: number;
    };
    databaseHealth: {
      totalQueries: number;
      failedQueries: number;
      successRate: number;
      lastActivity: string;
      timeSinceLastActivity: number;
    };
  } {
    const memUsage = process.memoryUsage();
    const dbHealth = getConnectionHealth();

    return {
      running: this.isRunning,
      queueCount: this.processIntervals.size,
      currentlyProcessing: this.currentlyProcessing,
      maxConcurrentJobs: this.maxConcurrentJobs,
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        utilization: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) / 100
      },
      databaseHealth: dbHealth
    };
  }
}

// Export singleton manager
export const jobQueueManager = new JobQueueManager();

// Example usage:
/*
// Start the job queue manager (typically in a server startup script)
await jobQueueManager.start();

// Add jobs to the queue
await jobQueue.addJob(JobFactory.aiResponse('conv-123', 'bot-456'));
await jobQueue.addJob(JobFactory.documentProcessing('doc-789', 'user-123'));

// Schedule a future job
await jobQueue.scheduleJob(
  JobFactory.analyticsUpdate('bot-456', JobPriority.LOW),
  new Date(Date.now() + 3600000) // 1 hour from now
);

// Check job status
const status = await jobQueue.getJobStatus('job-123');
console.log(status);

// Stop processing (typically in a graceful shutdown)
await jobQueueManager.stop();
*/