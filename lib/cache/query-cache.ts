import { cacheInstances, cacheKeys, CacheInvalidator } from './redis-cache';
import { db } from '@/lib/db';
import {
  chatbotInstances,
  chatbotConversations,
  chatbotMessages,
  documents,
  documentChunks,
  systemSettings,
  systemConfigs
} from '@/lib/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { CachedAnalyticsService } from './cached-analytics';
import type {
  ChatbotInstance,
  ChatbotConversation,
  ChatbotMessage,
  ChatbotAnalytics
} from '@/lib/db/schema';

export interface QueryCacheOptions {
  ttl?: number;
  skipCache?: boolean;
  forceRefresh?: boolean;
  namespace?: string;
}

/**
 * Cached database query wrapper
 */
export class QueryCache {
  /**
   * Cache chatbot queries
   */
  static async getChatbot(id: string, options: QueryCacheOptions = {}): Promise<ChatbotInstance | null> {
    if (options.skipCache) {
      return await this.fetchChatbotFromDB(id);
    }

    const cacheKey = cacheKeys.chatbot(id);

    if (options.forceRefresh) {
      await cacheInstances.chatbots.delete(cacheKey);
    }

    return await cacheInstances.chatbots.wrap(
      cacheKey,
      () => this.fetchChatbotFromDB(id),
      { ttl: options.ttl }
    );
  }

  /**
   * Cache chatbot list queries
   */
  static async getChatbotList(
    filters: { status?: string; userId?: string; limit?: number; offset?: number } = {},
    options: QueryCacheOptions = {}
  ): Promise<{ chatbots: ChatbotInstance[]; total: number }> {
    if (options.skipCache) {
      return await this.fetchChatbotListFromDB(filters);
    }

    const filterKey = JSON.stringify(filters);
    const cacheKey = cacheKeys.chatbotList(filterKey);

    if (options.forceRefresh) {
      await cacheInstances.chatbots.delete(cacheKey);
    }

    return await cacheInstances.chatbots.wrap(
      cacheKey,
      () => this.fetchChatbotListFromDB(filters),
      { ttl: options.ttl || 300 } // 5 minutes for lists
    );
  }

  /**
   * Cache conversation queries
   */
  static async getConversation(id: string, options: QueryCacheOptions = {}): Promise<ChatbotConversation | null> {
    if (options.skipCache) {
      return await this.fetchConversationFromDB(id);
    }

    const cacheKey = cacheKeys.conversation(id);

    if (options.forceRefresh) {
      await cacheInstances.sessions.delete(cacheKey);
    }

    return await cacheInstances.sessions.wrap(
      cacheKey,
      () => this.fetchConversationFromDB(id),
      { ttl: options.ttl || 900 } // 15 minutes for conversations
    );
  }

  /**
   * Cache conversation messages
   */
  static async getConversationMessages(
    conversationId: string,
    options: QueryCacheOptions & { limit?: number; offset?: number } = {}
  ): Promise<ChatbotMessage[]> {
    if (options.skipCache) {
      return await this.fetchConversationMessagesFromDB(conversationId, options);
    }

    const cacheKey = cacheKeys.conversationMessages(
      `${conversationId}:${options.limit || 50}:${options.offset || 0}`
    );

    if (options.forceRefresh) {
      await cacheInstances.sessions.delete(cacheKey);
    }

    return await cacheInstances.sessions.wrap(
      cacheKey,
      () => this.fetchConversationMessagesFromDB(conversationId, options),
      { ttl: options.ttl || 600 } // 10 minutes for messages
    );
  }

  /**
   * Cache vector search results
   */
  static async getVectorSearchResults(
    query: string,
    chatbotId: string,
    options: QueryCacheOptions & { limit?: number; threshold?: number } = {}
  ): Promise<any[]> {
    if (options.skipCache) {
      return await this.performVectorSearch(query, chatbotId, options);
    }

    const cacheKey = cacheKeys.vectorSearch(query, chatbotId);

    if (options.forceRefresh) {
      await cacheInstances.vectorSearch.delete(cacheKey);
    }

    return await cacheInstances.vectorSearch.wrap(
      cacheKey,
      () => this.performVectorSearch(query, chatbotId, options),
      { ttl: options.ttl || 300 } // 5 minutes for vector search
    );
  }

  /**
   * Cache analytics queries
   */
  static async getAnalytics(
    type: string,
    timeframe: string,
    chatbotId?: string,
    options: QueryCacheOptions = {}
  ): Promise<any> {
    if (options.skipCache) {
      return await this.fetchAnalyticsFromDB(type, timeframe, chatbotId);
    }

    const cacheKey = cacheKeys.analytics(type, timeframe, chatbotId);

    if (options.forceRefresh) {
      await cacheInstances.analytics.delete(cacheKey);
    }

    return await cacheInstances.analytics.wrap(
      cacheKey,
      () => this.fetchAnalyticsFromDB(type, timeframe, chatbotId),
      { ttl: options.ttl || 1800 } // 30 minutes for analytics
    );
  }

  /**
   * Cache knowledge base data
   */
  static async getKnowledgeBase(
    chatbotId: string,
    options: QueryCacheOptions = {}
  ): Promise<any> {
    if (options.skipCache) {
      return await this.fetchKnowledgeBaseFromDB(chatbotId);
    }

    const cacheKey = cacheKeys.knowledgeBase(chatbotId);

    if (options.forceRefresh) {
      await cacheInstances.knowledge.delete(cacheKey);
    }

    return await cacheInstances.knowledge.wrap(
      cacheKey,
      () => this.fetchKnowledgeBaseFromDB(chatbotId),
      { ttl: options.ttl || 3600 } // 1 hour for knowledge base
    );
  }

  /**
   * Cache system configuration
   */
  static async getSystemConfig(
    key: string,
    options: QueryCacheOptions = {}
  ): Promise<any> {
    if (options.skipCache) {
      return await this.fetchSystemConfigFromDB(key);
    }

    const cacheKey = cacheKeys.systemConfig(key);

    if (options.forceRefresh) {
      await cacheInstances.config.delete(cacheKey);
    }

    return await cacheInstances.config.wrap(
      cacheKey,
      () => this.fetchSystemConfigFromDB(key),
      { ttl: options.ttl || 7200 } // 2 hours for system config
    );
  }

  // Private database fetch methods
  private static async fetchChatbotFromDB(id: string): Promise<ChatbotInstance | null> {
    try {
      const [chatbot] = await db
        .select()
        .from(chatbotInstances)
        .where(eq(chatbotInstances.id, id))
        .limit(1);

      return chatbot || null;
    } catch (error) {
      console.error('Error fetching chatbot from DB:', error);
      return null;
    }
  }

  private static async fetchChatbotListFromDB(filters: any): Promise<{ chatbots: ChatbotInstance[]; total: number }> {
    try {
      const { status, userId, limit = 50, offset = 0 } = filters;

      // Build where conditions
      const whereConditions = [];
      if (status) {
        whereConditions.push(eq(chatbotInstances.status, status));
      }
      if (userId) {
        whereConditions.push(eq(chatbotInstances.userId, userId));
      }

      // Fetch chatbots with pagination
      const chatbots = await db
        .select()
        .from(chatbotInstances)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(chatbotInstances.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ total }] = await db
        .select({ total: count() })
        .from(chatbotInstances)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      return {
        chatbots,
        total: total || 0
      };
    } catch (error) {
      console.error('Error fetching chatbot list from DB:', error);
      return { chatbots: [], total: 0 };
    }
  }

  private static async fetchConversationFromDB(id: string): Promise<ChatbotConversation | null> {
    try {
      const [conversation] = await db
        .select()
        .from(chatbotConversations)
        .where(eq(chatbotConversations.id, id))
        .limit(1);

      return conversation || null;
    } catch (error) {
      console.error('Error fetching conversation from DB:', error);
      return null;
    }
  }

  private static async fetchConversationMessagesFromDB(
    conversationId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ChatbotMessage[]> {
    try {
      const { limit = 50, offset = 0 } = options;

      const messages = await db
        .select()
        .from(chatbotMessages)
        .where(eq(chatbotMessages.conversationId, conversationId))
        .orderBy(chatbotMessages.createdAt)
        .limit(limit)
        .offset(offset);

      return messages;
    } catch (error) {
      console.error('Error fetching conversation messages from DB:', error);
      return [];
    }
  }

  private static async performVectorSearch(
    query: string,
    chatbotId: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<any[]> {
    try {
      const { limit = 10, threshold = 0.7 } = options;

      // Basic text search on document chunks for the specific chatbot
      // Note: This is a simplified implementation. In production, this would use
      // embedding similarity search with vector operations
      const results = await db
        .select({
          id: documentChunks.id,
          content: documentChunks.content,
          metadata: documentChunks.metadata,
          documentId: documentChunks.documentId,
          title: documents.title,
          filename: documents.filename
        })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(
          and(
            eq(documents.chatbotId, chatbotId),
            sql`${documentChunks.content} ILIKE ${'%' + query + '%'}`
          )
        )
        .orderBy(desc(documentChunks.createdAt))
        .limit(limit);

      // Transform to expected format with mock similarity scores
      return results.map((result, index) => ({
        id: result.id,
        content: result.content,
        similarity: Math.max(0.5, 1.0 - (index * 0.1)), // Mock similarity decreasing by rank
        metadata: {
          ...(result.metadata as object || {}),
          documentId: result.documentId,
          source: result.filename || result.title || 'Unknown',
          title: result.title
        }
      })).filter(result => result.similarity >= threshold);
    } catch (error) {
      console.error('Error performing vector search:', error);
      return [];
    }
  }

  private static async fetchAnalyticsFromDB(
    type: string,
    timeframe: string,
    chatbotId?: string
  ): Promise<any> {
    try {
      if (!chatbotId) {
        // Return empty analytics for global queries without specific chatbot
        return {
          type,
          timeframe,
          chatbotId: null,
          metrics: {
            total_conversations: 0,
            total_messages: 0,
            avg_response_time: 0,
            user_satisfaction: 0
          },
          timestamp: new Date()
        };
      }

      // Use the existing CachedAnalyticsService based on type
      let analyticsData;
      switch (type) {
        case 'dashboard':
        case 'overview':
          analyticsData = await CachedAnalyticsService.getDashboardMetrics(
            chatbotId,
            timeframe as '1h' | '24h' | '7d' | '30d'
          );
          break;
        case 'realtime':
          analyticsData = await CachedAnalyticsService.getRealtimeMetrics(chatbotId);
          break;
        case 'performance':
        case 'stats':
          analyticsData = await CachedAnalyticsService.getChatbotStats(chatbotId);
          break;
        default:
          // Fallback to dashboard metrics
          analyticsData = await CachedAnalyticsService.getDashboardMetrics(
            chatbotId,
            timeframe as '1h' | '24h' | '7d' | '30d'
          );
      }

      return {
        type,
        timeframe,
        chatbotId,
        metrics: analyticsData,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error fetching analytics from DB:', error);
      return {
        type,
        timeframe,
        chatbotId,
        metrics: {},
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  private static async fetchKnowledgeBaseFromDB(chatbotId: string): Promise<any> {
    try {
      // Get documents for the chatbot
      const documentsData = await db
        .select({
          id: documents.id,
          title: documents.title,
          filename: documents.filename,
          status: documents.status,
          uploadedAt: documents.uploadedAt,
          createdAt: documents.createdAt
        })
        .from(documents)
        .where(eq(documents.chatbotId, chatbotId))
        .orderBy(desc(documents.createdAt));

      // Get chunk statistics
      const [chunkStats] = await db
        .select({
          totalChunks: count(documentChunks.id),
          lastUpdated: sql<Date>`MAX(${documentChunks.createdAt})`
        })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(eq(documents.chatbotId, chatbotId));

      return {
        chatbotId,
        documents: documentsData.map(doc => ({
          id: doc.id,
          title: doc.title,
          filename: doc.filename,
          status: doc.status || 'unknown',
          uploadedAt: doc.uploadedAt,
          createdAt: doc.createdAt
        })),
        stats: {
          total_documents: documentsData.length,
          total_chunks: chunkStats?.totalChunks || 0,
          last_updated: chunkStats?.lastUpdated || new Date()
        }
      };
    } catch (error) {
      console.error('Error fetching knowledge base from DB:', error);
      return {
        chatbotId,
        documents: [],
        stats: {
          total_documents: 0,
          total_chunks: 0,
          last_updated: new Date()
        },
        error: error.message
      };
    }
  }

  private static async fetchSystemConfigFromDB(key: string): Promise<any> {
    try {
      // Try system_configs table first (new format)
      const [config] = await db
        .select()
        .from(systemConfigs)
        .where(eq(systemConfigs.key, key))
        .limit(1);

      if (config) {
        return {
          key: config.key,
          value: config.value,
          updated_at: config.updatedAt,
          created_at: config.createdAt
        };
      }

      // Fallback to system_settings table (legacy format)
      const [setting] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      if (setting) {
        return {
          key: setting.key,
          value: setting.value,
          updated_at: setting.updatedAt,
          created_at: setting.createdAt
        };
      }

      // Return null if not found in either table
      return null;
    } catch (error) {
      console.error('Error fetching system config from DB:', error);
      return null;
    }
  }
}

/**
 * Cached query decorators for existing services
 */
export function cached(options: QueryCacheOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;

      if (options.skipCache) {
        return await originalMethod.apply(this, args);
      }

      const cache = cacheInstances.api;

      if (options.forceRefresh) {
        await cache.delete(cacheKey);
      }

      return await cache.wrap(
        cacheKey,
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

/**
 * Cache warming scheduler
 */
export class CacheWarming {
  private static warmingInterval: NodeJS.Timeout | null = null;

  /**
   * Start cache warming scheduler
   */
  static start(intervalMs: number = 300000): void { // 5 minutes default
    if (this.warmingInterval) {
      this.stop();
    }

    this.warmingInterval = setInterval(async () => {
      await this.warmCaches();
    }, intervalMs);

    // Initial warming
    setTimeout(() => this.warmCaches(), 1000);
  }

  /**
   * Stop cache warming scheduler
   */
  static stop(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
    }
  }

  /**
   * Warm critical caches
   */
  private static async warmCaches(): Promise<void> {
    try {
      console.log('Starting cache warming...');

      // Warm frequently accessed data
      await this.warmPopularChatbots();
      await this.warmSystemConfigs();
      await this.warmAnalytics();

      console.log('Cache warming completed');
    } catch (error) {
      console.error('Error during cache warming:', error);
    }
  }

  private static async warmPopularChatbots(): Promise<void> {
    try {
      // This would identify popular chatbots and pre-load them
      const popularChatbotIds = ['1', '2', '3']; // Mock data

      for (const id of popularChatbotIds) {
        await QueryCache.getChatbot(id, { forceRefresh: true });
      }
    } catch (error) {
      console.error('Error warming chatbot cache:', error);
    }
  }

  private static async warmSystemConfigs(): Promise<void> {
    try {
      const commonConfigs = ['app_settings', 'ai_models', 'rate_limits'];

      for (const config of commonConfigs) {
        await QueryCache.getSystemConfig(config, { forceRefresh: true });
      }
    } catch (error) {
      console.error('Error warming system config cache:', error);
    }
  }

  private static async warmAnalytics(): Promise<void> {
    try {
      const timeframes = ['1d', '7d', '30d'];
      const types = ['overview', 'performance', 'usage'];

      for (const timeframe of timeframes) {
        for (const type of types) {
          await QueryCache.getAnalytics(type, timeframe, undefined, { forceRefresh: true });
        }
      }
    } catch (error) {
      console.error('Error warming analytics cache:', error);
    }
  }
}

/**
 * Cache invalidation hooks for data changes
 */
export class CacheHooks {
  /**
   * Hook for chatbot updates
   */
  static async onChatbotUpdated(chatbotId: string): Promise<void> {
    await CacheInvalidator.invalidateChatbot(chatbotId);
    await CacheInvalidator.invalidateVectorSearch(chatbotId);
  }

  /**
   * Hook for conversation updates
   */
  static async onConversationUpdated(conversationId: string): Promise<void> {
    await cacheInstances.sessions.delete(cacheKeys.conversation(conversationId));

    // Invalidate message cache patterns
    const pattern = `conversation_messages:${conversationId}:*`;
    const cache = cacheInstances.sessions;
    const keys = await cache.redis.keys(cache['buildKey'](pattern));

    if (keys.length > 0) {
      await cache.redis.del(...keys);
    }
  }

  /**
   * Hook for analytics updates
   */
  static async onAnalyticsUpdated(chatbotId?: string): Promise<void> {
    await CacheInvalidator.invalidateAnalytics(chatbotId);
  }

  /**
   * Hook for knowledge base updates
   */
  static async onKnowledgeBaseUpdated(chatbotId: string): Promise<void> {
    await cacheInstances.knowledge.delete(cacheKeys.knowledgeBase(chatbotId));
    await CacheInvalidator.invalidateVectorSearch(chatbotId);
  }

  /**
   * Hook for system config updates
   */
  static async onSystemConfigUpdated(configKey: string): Promise<void> {
    await cacheInstances.config.delete(cacheKeys.systemConfig(configKey));
  }
}