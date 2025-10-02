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

export interface CreateChatbotRequest {
  name: string;
  description?: string;
  createdBy: string;
  configuration?: any;
  systemPrompt?: string;
}

export interface UpdateChatbotRequest {
  name?: string;
  description?: string;
  configuration?: any;
  systemPrompt?: string;
}

export interface ChatbotListResponse {
  chatbots: ChatbotInstance[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export class SimpleChatbotService {
  /**
   * Create a new chatbot instance
   */
  static async createChatbot(request: CreateChatbotRequest): Promise<{ chatbot: ChatbotInstance; apiKey: string }> {
    // Generate API key
    const apiKey = 'cb_' + nanoid(32);
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    const apiKeyHint = apiKey.substring(0, 5) + '...';

    const newChatbot = {
      name: request.name,
      description: request.description,
      createdBy: request.createdBy,
      status: 'testing' as const,
      apiKeyHash,
      apiKeyHint,
      configuration: request.configuration || {
        model: 'claude-3-sonnet',
        temperature: 0.7,
        maxTokens: 1000
      },
      knowledgeSourceFilters: {},
      currentSystemPrompt: request.systemPrompt,
      welcomeMessage: 'Hello! How can I help you today?',
    };

    const [chatbot] = await db
      .insert(chatbotInstances)
      .values(newChatbot)
      .returning();

    return { chatbot, apiKey };
  }

  /**
   * Get all chatbots with pagination
   */
  static async getAllChatbots(
    page = 1,
    limit = 20,
    includeDeleted = false
  ): Promise<ChatbotListResponse> {
    const offset = (page - 1) * limit;

    // Build where conditions - only include non-deleted chatbots unless specified
    const whereConditions = includeDeleted ? undefined : isNull(chatbotInstances.deletedAt);

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatbotInstances)
      .where(whereConditions);

    const total = Number(totalResult[0]?.count || 0);

    // Get paginated results
    const chatbots = await db
      .select()
      .from(chatbotInstances)
      .where(whereConditions)
      .orderBy(desc(chatbotInstances.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      chatbots,
      total,
      page,
      limit,
      hasNext: offset + limit < total,
      hasPrevious: page > 1,
    };
  }

  /**
   * Get a specific chatbot by ID
   */
  static async getChatbotById(id: string): Promise<ChatbotInstance | null> {
    const [chatbot] = await db
      .select()
      .from(chatbotInstances)
      .where(eq(chatbotInstances.id, id))
      .limit(1);

    return chatbot || null;
  }

  /**
   * Update a chatbot
   */
  static async updateChatbot(
    id: string,
    updates: UpdateChatbotRequest
  ): Promise<ChatbotInstance | null> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };

    // Handle configuration updates
    if (updates.configuration) {
      if (updates.configuration.model) {
        updateData.model = updates.configuration.model;
      }
      if (updates.configuration.temperature !== undefined) {
        updateData.temperature = updates.configuration.temperature;
      }
      if (updates.configuration.maxTokens !== undefined) {
        updateData.maxTokens = updates.configuration.maxTokens;
      }
    }

    const [updatedChatbot] = await db
      .update(chatbotInstances)
      .set(updateData)
      .where(eq(chatbotInstances.id, id))
      .returning();

    return updatedChatbot || null;
  }

  /**
   * Delete a chatbot (soft delete by setting deletedAt timestamp)
   */
  static async deleteChatbot(id: string): Promise<boolean> {
    const result = await db
      .update(chatbotInstances)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(chatbotInstances.id, id));

    return result.rowCount > 0;
  }

  /**
   * Hard delete a chatbot (permanent deletion)
   */
  static async permanentlyDeleteChatbot(id: string): Promise<boolean> {
    const result = await db
      .delete(chatbotInstances)
      .where(eq(chatbotInstances.id, id));

    return result.rowCount > 0;
  }

  /**
   * Get chatbot statistics
   */
  static async getChatbotStats(): Promise<{
    total: number;
    active: number;
    deleted: number;
  }> {
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatbotInstances);

    const activeResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatbotInstances)
      .where(isNull(chatbotInstances.deletedAt));

    const total = Number(totalResult[0]?.count || 0);
    const active = Number(activeResult[0]?.count || 0);
    const deleted = total - active;

    return {
      total,
      active,
      deleted,
    };
  }
}