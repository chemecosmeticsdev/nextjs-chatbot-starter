import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './';
import {
  chatbotInstances,
  chatbotPromptHistory,
  type ChatbotInstance,
  type ChatbotPromptHistory
} from './simple-schema';
import { createHash, randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
// Temporarily disabled for Phase 2 testing
// import { ChatbotKnowledgeIntegration, type ChatbotKnowledgeConfig } from '@/lib/services/chatbot-knowledge-integration';

export interface CreateChatbotRequest {
  name: string;
  description?: string;
  createdBy: string;
  configuration?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    language?: string;
    responseTimeout?: number;
  };
  knowledgeSourceFilters?: Record<string, any>;
  currentSystemPrompt?: string;
  welcomeMessage?: string;
}

export interface UpdateChatbotRequest {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'testing';
  configuration?: Record<string, any>;
  knowledgeSourceFilters?: Record<string, any>;
  currentSystemPrompt?: string;
  welcomeMessage?: string;
}

export interface ListChatbotsOptions {
  page?: number;
  limit?: number;
  status?: 'active' | 'inactive' | 'testing';
  createdBy?: string;
  searchTerm?: string;
}

export interface ChatbotWithStats extends ChatbotInstance {
  conversationCount: number;
  userCount: number;
  lastActivity: Date | null;
}

export class ChatbotService {
  /**
   * Generate a secure API key and its hash
   */
  private static generateApiKey(): { apiKey: string; hash: string; hint: string } {
    const apiKey = `cb_${nanoid(32)}`;
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const hint = apiKey.slice(-8);
    return { apiKey, hash, hint };
  }

  /**
   * Create a new chatbot instance
   */
  static async createChatbot(data: CreateChatbotRequest): Promise<{ chatbot: ChatbotInstance; apiKey: string }> {
    const { apiKey, hash, hint } = this.generateApiKey();

    const defaultConfig = {
      model: 'anthropic.claude-3-sonnet-20240229-v1:0',
      temperature: 0.7,
      maxTokens: 1000,
      language: 'en',
      responseTimeout: 30,
      ...data.configuration
    };

    const [chatbot] = await db.insert(chatbotInstances).values({
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      apiKeyHash: hash,
      apiKeyHint: hint,
      configuration: defaultConfig,
      knowledgeSourceFilters: data.knowledgeSourceFilters || {},
      currentSystemPrompt: data.currentSystemPrompt,
      welcomeMessage: data.welcomeMessage,
      status: 'testing' // Always start in testing mode
    }).returning();

    // Create initial prompt history entry if system prompt provided
    if (data.currentSystemPrompt) {
      await db.insert(chatbotPromptHistory).values({
        chatbotId: chatbot.id,
        promptText: data.currentSystemPrompt,
        version: 1,
        createdBy: data.createdBy,
        generationMethod: 'manual'
      });
    }

    return { chatbot, apiKey };
  }

  /**
   * List chatbots with pagination and filtering
   */
  static async listChatbots(options: ListChatbotsOptions = {}): Promise<{
    chatbots: ChatbotWithStats[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [isNull(chatbotInstances.deletedAt)];

    if (options.status) {
      conditions.push(eq(chatbotInstances.status, options.status));
    }

    if (options.createdBy) {
      conditions.push(eq(chatbotInstances.createdBy, options.createdBy));
    }

    if (options.searchTerm) {
      conditions.push(
        sql`(${chatbotInstances.name} ILIKE ${`%${options.searchTerm}%`} OR ${chatbotInstances.description} ILIKE ${`%${options.searchTerm}%`})`
      );
    }

    // Get chatbots with stats using a complex query
    const chatbotsWithStats = await db
      .select({
        // Chatbot fields
        id: chatbotInstances.id,
        name: chatbotInstances.name,
        description: chatbotInstances.description,
        createdBy: chatbotInstances.createdBy,
        status: chatbotInstances.status,
        apiKeyHash: chatbotInstances.apiKeyHash,
        apiKeyHint: chatbotInstances.apiKeyHint,
        configuration: chatbotInstances.configuration,
        knowledgeSourceFilters: chatbotInstances.knowledgeSourceFilters,
        currentSystemPrompt: chatbotInstances.currentSystemPrompt,
        welcomeMessage: chatbotInstances.welcomeMessage,
        createdAt: chatbotInstances.createdAt,
        updatedAt: chatbotInstances.updatedAt,
        deletedAt: chatbotInstances.deletedAt,
        // Stats (placeholder for now - will be implemented with conversation tables)
        conversationCount: sql<number>`0`.as('conversation_count'),
        userCount: sql<number>`0`.as('user_count'),
        lastActivity: sql<Date | null>`NULL`.as('last_activity')
      })
      .from(chatbotInstances)
      .where(and(...conditions))
      .orderBy(desc(chatbotInstances.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatbotInstances)
      .where(and(...conditions));

    const totalPages = Math.ceil(count / limit);

    return {
      chatbots: chatbotsWithStats,
      pagination: {
        page,
        limit,
        total: count,
        totalPages
      }
    };
  }

  /**
   * Get a chatbot by ID
   */
  static async getChatbotById(id: string): Promise<ChatbotWithStats | null> {
    const [chatbot] = await db
      .select({
        // Chatbot fields
        id: chatbotInstances.id,
        name: chatbotInstances.name,
        description: chatbotInstances.description,
        createdBy: chatbotInstances.createdBy,
        status: chatbotInstances.status,
        apiKeyHash: chatbotInstances.apiKeyHash,
        apiKeyHint: chatbotInstances.apiKeyHint,
        configuration: chatbotInstances.configuration,
        knowledgeSourceFilters: chatbotInstances.knowledgeSourceFilters,
        currentSystemPrompt: chatbotInstances.currentSystemPrompt,
        welcomeMessage: chatbotInstances.welcomeMessage,
        createdAt: chatbotInstances.createdAt,
        updatedAt: chatbotInstances.updatedAt,
        deletedAt: chatbotInstances.deletedAt,
        // Stats (placeholder for now)
        conversationCount: sql<number>`0`.as('conversation_count'),
        userCount: sql<number>`0`.as('user_count'),
        lastActivity: sql<Date | null>`NULL`.as('last_activity')
      })
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, id),
        isNull(chatbotInstances.deletedAt)
      ));

    return chatbot || null;
  }

  /**
   * Update a chatbot
   */
  static async updateChatbot(id: string, data: UpdateChatbotRequest): Promise<ChatbotInstance | null> {
    const updateData: Partial<ChatbotInstance> = {
      ...data,
      updatedAt: new Date()
    };

    const [updatedChatbot] = await db
      .update(chatbotInstances)
      .set(updateData)
      .where(and(
        eq(chatbotInstances.id, id),
        isNull(chatbotInstances.deletedAt)
      ))
      .returning();

    return updatedChatbot || null;
  }

  /**
   * Soft delete a chatbot
   */
  static async deleteChatbot(id: string): Promise<boolean> {
    const [deletedChatbot] = await db
      .update(chatbotInstances)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(chatbotInstances.id, id),
        isNull(chatbotInstances.deletedAt)
      ))
      .returning();

    return !!deletedChatbot;
  }

  /**
   * Regenerate API key for a chatbot
   */
  static async regenerateApiKey(id: string): Promise<{ apiKey: string; hint: string } | null> {
    const { apiKey, hash, hint } = this.generateApiKey();

    const [updatedChatbot] = await db
      .update(chatbotInstances)
      .set({
        apiKeyHash: hash,
        apiKeyHint: hint,
        updatedAt: new Date()
      })
      .where(and(
        eq(chatbotInstances.id, id),
        isNull(chatbotInstances.deletedAt)
      ))
      .returning();

    if (!updatedChatbot) {
      return null;
    }

    return { apiKey, hint };
  }

  /**
   * Verify API key and get chatbot
   */
  static async verifyApiKey(apiKey: string): Promise<ChatbotInstance | null> {
    const hash = createHash('sha256').update(apiKey).digest('hex');

    const [chatbot] = await db
      .select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.apiKeyHash, hash),
        isNull(chatbotInstances.deletedAt)
      ));

    return chatbot || null;
  }

  /**
   * Get chatbot health metrics
   */
  static async getChatbotHealth(id: string): Promise<{
    status: 'healthy' | 'warning' | 'error';
    metrics: {
      uptime: number;
      responseTime: number;
      errorRate: number;
      totalRequests: number;
      lastRequest: Date | null;
    };
  } | null> {
    const chatbot = await this.getChatbotById(id);
    if (!chatbot) {
      return null;
    }

    // TODO: Implement real metrics when conversation tables are integrated
    // For now, return mock healthy status
    return {
      status: chatbot.status === 'active' ? 'healthy' : 'warning',
      metrics: {
        uptime: chatbot.status === 'active' ? 99.9 : 0,
        responseTime: 150, // ms
        errorRate: 0.1, // percentage
        totalRequests: chatbot.conversationCount,
        lastRequest: chatbot.lastActivity
      }
    };
  }

  /**
   * Check if user can access chatbot (for authorization)
   */
  static async canUserAccessChatbot(chatbotId: string, userId: string, userRole: string): Promise<boolean> {
    // Super admins can access all chatbots
    if (userRole === 'super_admin') {
      return true;
    }

    // Regular users can only access chatbots they created
    const chatbot = await this.getChatbotById(chatbotId);
    return chatbot?.createdBy === userId;
  }

  /**
   * Check if user can create chatbots
   */
  static canUserCreateChatbot(userRole: string): boolean {
    return userRole === 'super_admin';
  }

  /**
   * Update system prompt for a chatbot
   */
  static async updateSystemPrompt(
    chatbotId: string,
    prompt: string,
    updatedBy: string,
    description?: string
  ): Promise<{
    version: number;
    prompt: string;
    updatedAt: Date;
  } | null> {
    try {
      return await db.transaction(async (tx) => {
        // Get current chatbot
        const chatbot = await tx.select()
          .from(chatbotInstances)
          .where(eq(chatbotInstances.id, chatbotId))
          .limit(1);

        if (chatbot.length === 0) {
          return null;
        }

        // Get the next version number
        const latestPrompt = await tx.select()
          .from(chatbotPromptHistory)
          .where(eq(chatbotPromptHistory.chatbotId, chatbotId))
          .orderBy(desc(chatbotPromptHistory.version))
          .limit(1);

        const nextVersion = latestPrompt.length > 0 ? latestPrompt[0].version + 1 : 1;

        // Insert new prompt version
        await tx.insert(chatbotPromptHistory).values({
          id: nanoid(),
          chatbotId,
          version: nextVersion,
          prompt,
          description,
          createdBy: updatedBy,
          createdAt: new Date(),
          source: 'manual'
        });

        // Update current system prompt in chatbot
        const updatedAt = new Date();
        await tx.update(chatbotInstances)
          .set({
            currentSystemPrompt: prompt,
            updatedAt
          })
          .where(eq(chatbotInstances.id, chatbotId));

        return {
          version: nextVersion,
          prompt,
          updatedAt
        };
      });
    } catch (error) {
      console.error('Error updating system prompt:', error);
      return null;
    }
  }

  /**
   * Get prompt history for a chatbot
   */
  static async getPromptHistory(
    chatbotId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{
    prompts: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    try {
      // Get prompt history
      const prompts = await db.select()
        .from(chatbotPromptHistory)
        .where(eq(chatbotPromptHistory.chatbotId, chatbotId))
        .orderBy(desc(chatbotPromptHistory.version))
        .limit(limit)
        .offset(offset);

      // Get total count
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(chatbotPromptHistory)
        .where(eq(chatbotPromptHistory.chatbotId, chatbotId));

      const total = countResult[0]?.count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        prompts,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error getting prompt history:', error);
      return {
        prompts: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      };
    }
  }

  /**
   * Get specific prompt version
   */
  static async getPromptVersion(chatbotId: string, version: number): Promise<any | null> {
    try {
      const result = await db.select()
        .from(chatbotPromptHistory)
        .where(
          and(
            eq(chatbotPromptHistory.chatbotId, chatbotId),
            eq(chatbotPromptHistory.version, version)
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error getting prompt version:', error);
      return null;
    }
  }

  /**
   * Rollback prompt to a previous version
   */
  static async rollbackPrompt(
    chatbotId: string,
    targetVersion: number,
    rolledBackBy: string,
    reason?: string
  ): Promise<{
    newVersion: number;
    previousVersion: number;
    prompt: string;
    rolledBackAt: Date;
  } | null> {
    try {
      return await db.transaction(async (tx) => {
        // Get the target prompt version
        const targetPrompt = await tx.select()
          .from(chatbotPromptHistory)
          .where(
            and(
              eq(chatbotPromptHistory.chatbotId, chatbotId),
              eq(chatbotPromptHistory.version, targetVersion)
            )
          )
          .limit(1);

        if (targetPrompt.length === 0) {
          return null;
        }

        // Get current version number
        const latestPrompt = await tx.select()
          .from(chatbotPromptHistory)
          .where(eq(chatbotPromptHistory.chatbotId, chatbotId))
          .orderBy(desc(chatbotPromptHistory.version))
          .limit(1);

        const previousVersion = latestPrompt[0]?.version || 0;
        const nextVersion = previousVersion + 1;

        // Create new prompt entry as rollback
        await tx.insert(chatbotPromptHistory).values({
          id: nanoid(),
          chatbotId,
          version: nextVersion,
          prompt: targetPrompt[0].prompt,
          description: `Rolled back to version ${targetVersion}${reason ? `: ${reason}` : ''}`,
          createdBy: rolledBackBy,
          createdAt: new Date(),
          source: 'rollback'
        });

        // Update current system prompt
        const rolledBackAt = new Date();
        await tx.update(chatbotInstances)
          .set({
            currentSystemPrompt: targetPrompt[0].prompt,
            updatedAt: rolledBackAt
          })
          .where(eq(chatbotInstances.id, chatbotId));

        return {
          newVersion: nextVersion,
          previousVersion,
          prompt: targetPrompt[0].prompt,
          rolledBackAt
        };
      });
    } catch (error) {
      console.error('Error rolling back prompt:', error);
      return null;
    }
  }

  /**
   * Create prompt generation job
   */
  static async createPromptGenerationJob(
    chatbotId: string,
    requestedBy: string,
    parameters: any
  ): Promise<{ id: string } | null> {
    try {
      // For now, return a mock job ID since we don't have the full jobs table
      // In a real implementation, this would insert into prompt_generation_jobs table
      const jobId = nanoid();

      // TODO: When the full schema is implemented, insert into prompt_generation_jobs table
      console.log(`Created prompt generation job ${jobId} for chatbot ${chatbotId}`);

      return { id: jobId };
    } catch (error) {
      console.error('Error creating prompt generation job:', error);
      return null;
    }
  }

  /**
   * Update prompt generation job
   */
  static async updatePromptGenerationJob(
    jobId: string,
    updates: {
      status?: string;
      generatedPrompt?: string;
      error?: string;
      completedAt?: Date;
    }
  ): Promise<boolean> {
    try {
      // TODO: When the full schema is implemented, update prompt_generation_jobs table
      console.log(`Updated prompt generation job ${jobId}:`, updates);
      return true;
    } catch (error) {
      console.error('Error updating prompt generation job:', error);
      return false;
    }
  }

  /**
   * Get prompt generation jobs
   */
  static async getPromptGenerationJobs(
    chatbotId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{
    jobs: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));

    // TODO: When the full schema is implemented, query from prompt_generation_jobs table
    // For now, return empty results
    return {
      jobs: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      }
    };
  }

  /**
   * Generate enhanced chatbot response with knowledge base integration
   */
  static async generateEnhancedResponse(
    chatbotId: string,
    userMessage: string,
    context: {
      userId?: string;
      sessionId: string;
      conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
      }>;
    }
  ): Promise<{
    response: string;
    knowledgeUsed: boolean;
    sourceDocuments?: Array<{
      documentId: string;
      documentName: string;
      similarity: number;
      category?: string;
      supplier?: string;
    }>;
    searchQuery?: string;
    responseTime: number;
  }> {
    try {
      // Get chatbot configuration
      const chatbot = await this.getChatbotById(chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      // Extract knowledge base configuration from chatbot config
      const knowledgeConfig = ChatbotKnowledgeIntegration.validateKnowledgeConfig(
        chatbot.configuration?.knowledgeBase || {}
      );

      // Apply chatbot-specific knowledge source filters
      if (chatbot.knowledgeSourceFilters) {
        knowledgeConfig.knowledgeSourceFilters = {
          ...knowledgeConfig.knowledgeSourceFilters,
          ...chatbot.knowledgeSourceFilters
        };
      }

      // Check if knowledge base should be used for this message
      if (!ChatbotKnowledgeIntegration.shouldUseKnowledgeBase(userMessage, knowledgeConfig)) {
        knowledgeConfig.enableKnowledgeBase = false;
      }

      // Generate enhanced response
      const enhancedContext = {
        ...context,
        chatbotId
      };

      return await ChatbotKnowledgeIntegration.generateEnhancedResponse(
        userMessage,
        knowledgeConfig,
        enhancedContext,
        chatbot.currentSystemPrompt || undefined
      );

    } catch (error) {
      console.error('Error generating enhanced chatbot response:', error);
      throw error;
    }
  }

  /**
   * Update chatbot knowledge base configuration
   */
  static async updateKnowledgeBaseConfig(
    chatbotId: string,
    knowledgeConfig: Partial<ChatbotKnowledgeConfig>,
    updatedBy: string
  ): Promise<boolean> {
    try {
      // Get current chatbot
      const chatbot = await this.getChatbotById(chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      // Merge with existing configuration
      const updatedConfiguration = ChatbotKnowledgeIntegration.mergeKnowledgeConfig(
        chatbot.configuration || {},
        knowledgeConfig
      );

      // Update the chatbot
      await db
        .update(chatbotInstances)
        .set({
          configuration: updatedConfiguration,
          updatedAt: new Date()
        })
        .where(eq(chatbotInstances.id, chatbotId));

      // Log the configuration update
      console.log(
        `Knowledge base configuration updated - Chatbot: ${chatbotId}, ` +
        `User: ${updatedBy}, Config: ${JSON.stringify(knowledgeConfig)}`
      );

      return true;
    } catch (error) {
      console.error('Error updating knowledge base configuration:', error);
      return false;
    }
  }

  /**
   * Get chatbot knowledge base configuration
   */
  static async getKnowledgeBaseConfig(chatbotId: string): Promise<ChatbotKnowledgeConfig> {
    try {
      const chatbot = await this.getChatbotById(chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      return ChatbotKnowledgeIntegration.validateKnowledgeConfig(
        chatbot.configuration?.knowledgeBase || {}
      );
    } catch (error) {
      console.error('Error getting knowledge base configuration:', error);
      return ChatbotKnowledgeIntegration.getDefaultKnowledgeConfig();
    }
  }

  /**
   * Test knowledge base integration for a chatbot
   */
  static async testKnowledgeBaseIntegration(
    chatbotId: string,
    testQuery: string
  ): Promise<{
    success: boolean;
    results?: Array<{
      documentId: string;
      documentName: string;
      similarity: number;
      content: string;
    }>;
    error?: string;
    searchTime?: number;
  }> {
    try {
      const chatbot = await this.getChatbotById(chatbotId);
      if (!chatbot) {
        return { success: false, error: 'Chatbot not found' };
      }

      const knowledgeConfig = ChatbotKnowledgeIntegration.validateKnowledgeConfig(
        chatbot.configuration?.knowledgeBase || {}
      );

      // Override to ensure search is performed
      knowledgeConfig.enableKnowledgeBase = true;

      const context = {
        userId: 'test-user',
        sessionId: 'test-session',
        chatbotId,
        conversationHistory: []
      };

      const result = await ChatbotKnowledgeIntegration.generateEnhancedResponse(
        testQuery,
        knowledgeConfig,
        context
      );

      return {
        success: true,
        results: result.sourceDocuments?.map(doc => ({
          documentId: doc.documentId,
          documentName: doc.documentName,
          similarity: doc.similarity,
          content: `Document: ${doc.documentName} (${doc.similarity.toFixed(2)} similarity)`
        })),
        searchTime: result.responseTime
      };

    } catch (error) {
      console.error('Error testing knowledge base integration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}