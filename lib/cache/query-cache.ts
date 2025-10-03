import { cacheInstances, cacheKeys, CacheInvalidator } from './redis-cache';
import { db } from '@/lib/db';
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
      // This would use the actual ChatbotService
      // For now, return mock data structure
      return {
        id,
        name: `Chatbot ${id}`,
        description: 'Cached chatbot',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      } as any;
    } catch (error) {
      console.error('Error fetching chatbot from DB:', error);
      return null;
    }
  }

  private static async fetchChatbotListFromDB(filters: any): Promise<{ chatbots: ChatbotInstance[]; total: number }> {
    try {
      // This would implement actual database query with filters
      // For now, return mock data
      return {
        chatbots: [
          { id: '1', name: 'Chatbot 1', status: 'active' },
          { id: '2', name: 'Chatbot 2', status: 'inactive' }
        ] as any,
        total: 2
      };
    } catch (error) {
      console.error('Error fetching chatbot list from DB:', error);
      return { chatbots: [], total: 0 };
    }
  }

  private static async fetchConversationFromDB(id: string): Promise<ChatbotConversation | null> {
    try {
      // This would use the actual ConversationService
      return {
        id,
        chatbot_id: 'chatbot-1',
        user_id: 'user-1',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      } as any;
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
      // This would implement actual message fetching
      return [
        {
          id: '1',
          conversation_id: conversationId,
          role: 'user',
          content: 'Hello',
          created_at: new Date()
        },
        {
          id: '2',
          conversation_id: conversationId,
          role: 'assistant',
          content: 'Hi there!',
          created_at: new Date()
        }
      ] as any;
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
      // This would implement actual vector search
      // For now, return mock results
      return [
        {
          id: '1',
          content: 'Vector search result 1',
          similarity: 0.95,
          metadata: { source: 'document1.pdf' }
        },
        {
          id: '2',
          content: 'Vector search result 2',
          similarity: 0.85,
          metadata: { source: 'document2.pdf' }
        }
      ];
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
      // This would implement actual analytics fetching
      return {
        type,
        timeframe,
        chatbotId,
        metrics: {
          total_conversations: 150,
          total_messages: 450,
          avg_response_time: 1.2,
          user_satisfaction: 4.5
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error fetching analytics from DB:', error);
      return null;
    }
  }

  private static async fetchKnowledgeBaseFromDB(chatbotId: string): Promise<any> {
    try {
      // This would implement actual knowledge base fetching
      return {
        chatbotId,
        documents: [
          { id: '1', title: 'Product Guide', status: 'processed' },
          { id: '2', title: 'FAQ Document', status: 'processed' }
        ],
        stats: {
          total_documents: 2,
          total_chunks: 150,
          last_updated: new Date()
        }
      };
    } catch (error) {
      console.error('Error fetching knowledge base from DB:', error);
      return null;
    }
  }

  private static async fetchSystemConfigFromDB(key: string): Promise<any> {
    try {
      // This would implement actual system config fetching
      return {
        key,
        value: `config_value_for_${key}`,
        updated_at: new Date()
      };
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