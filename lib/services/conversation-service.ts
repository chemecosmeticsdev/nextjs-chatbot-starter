import { db } from '@/lib/db';
import {
  chatbotConversations,
  chatbotMessages,
  conversationContext,
  chatbotInstances
} from '@/lib/db/schema';
import {
  ConversationCreateRequest,
  MessageSendRequest,
  ConversationUpdateRequest,
  ConversationQueryRequest,
  ContextUpdateRequest,
  ConversationResponse,
  MessageResponse
} from '@/lib/validation/conversation';
import { ChatbotKnowledgeIntegration } from './chatbot-knowledge-integration';
import { ActivityTracker } from './activity-tracker';
import { eq, and, desc, gte, lte, count, sql } from 'drizzle-orm';
import type { ChatContext, EnhancedChatResponse } from './chatbot-knowledge-integration';

export class ConversationService {
  /**
   * Create a new conversation session
   */
  static async createConversation(
    request: ConversationCreateRequest,
    userId?: string
  ): Promise<ConversationResponse> {
    try {
      // Verify chatbot exists and user has access
      const chatbot = await db
        .select()
        .from(chatbotInstances)
        .where(eq(chatbotInstances.id, request.chatbotId))
        .limit(1);

      if (chatbot.length === 0) {
        throw new Error('Chatbot not found');
      }

      // Check for existing active conversation with same session ID
      const existingConversation = await db
        .select()
        .from(chatbotConversations)
        .where(
          and(
            eq(chatbotConversations.chatbotId, request.chatbotId),
            eq(chatbotConversations.sessionId, request.sessionId)
          )
        )
        .limit(1);

      if (existingConversation.length > 0) {
        // Return existing conversation if found
        return this.formatConversationResponse(existingConversation[0]);
      }

      // Create new conversation
      const [newConversation] = await db
        .insert(chatbotConversations)
        .values({
          chatbotId: request.chatbotId,
          sessionId: request.sessionId,
          integrationType: request.integrationType,
          userIdentifier: request.userIdentifier || null,
          metadata: request.metadata
        })
        .returning();

      // Start activity tracking session
      if (request.integrationType !== 'playground') {
        await ActivityTracker.startSession(
          request.sessionId,
          request.chatbotId,
          userId
        );
      }

      console.log(`Created conversation: ${newConversation.id} for chatbot: ${request.chatbotId}`);

      return this.formatConversationResponse(newConversation);

    } catch (error) {
      console.error('Error creating conversation:', error);
      throw new Error('Failed to create conversation');
    }
  }

  /**
   * Send a message and get AI response
   */
  static async sendMessage(
    conversationId: string,
    request: MessageSendRequest,
    userId?: string
  ): Promise<{ userMessage: MessageResponse; assistantMessage: MessageResponse }> {
    try {
      // Get conversation details
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Get chatbot configuration
      const chatbot = await db
        .select()
        .from(chatbotInstances)
        .where(eq(chatbotInstances.id, conversation.chatbotId))
        .limit(1);

      if (chatbot.length === 0) {
        throw new Error('Chatbot not found');
      }

      const chatbotConfig = chatbot[0];

      // Get recent conversation history
      const recentMessages = await db
        .select()
        .from(chatbotMessages)
        .where(eq(chatbotMessages.conversationId, conversationId))
        .orderBy(desc(chatbotMessages.createdAt))
        .limit(10);

      // Format conversation history for context
      const conversationHistory = recentMessages.reverse().map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.createdAt
      }));

      // Build chat context
      const chatContext: ChatContext = {
        userId,
        sessionId: conversation.sessionId,
        chatbotId: conversation.chatbotId,
        conversationHistory
      };

      // Save user message
      const [userMessage] = await db
        .insert(chatbotMessages)
        .values({
          conversationId,
          role: 'user',
          content: request.content,
          metadata: request.metadata
        })
        .returning();

      // Track message sent
      if (conversation.integrationType !== 'playground') {
        await ActivityTracker.trackMessageSent(
          conversation.sessionId,
          request.content
        );
      }

      // Prepare knowledge base configuration
      const knowledgeConfig = {
        searchThreshold: chatbotConfig.configuration?.knowledgeBase?.searchThreshold || 0.7,
        maxSearchResults: chatbotConfig.configuration?.knowledgeBase?.maxSearchResults || 5,
        enableKnowledgeBase: request.useKnowledgeBase &&
          (chatbotConfig.configuration?.knowledgeBase?.enableKnowledgeBase !== false),
        knowledgeSourceFilters: {
          ...chatbotConfig.configuration?.knowledgeBase?.knowledgeSourceFilters,
          ...request.knowledgeFilters
        }
      };

      // Generate enhanced response using knowledge base integration
      const enhancedResponse: EnhancedChatResponse = await ChatbotKnowledgeIntegration.generateEnhancedResponse(
        request.content,
        knowledgeConfig,
        chatContext,
        chatbotConfig.systemPrompt || undefined
      );

      // Save assistant message
      const [assistantMessage] = await db
        .insert(chatbotMessages)
        .values({
          conversationId,
          role: 'assistant',
          content: enhancedResponse.response,
          metadata: {
            responseTime: enhancedResponse.responseTime,
            knowledgeUsed: enhancedResponse.knowledgeUsed,
            searchQuery: enhancedResponse.searchQuery
          },
          vectorSearchResults: enhancedResponse.sourceDocuments || []
        })
        .returning();

      // Track message received
      if (conversation.integrationType !== 'playground') {
        await ActivityTracker.trackMessageReceived(
          conversation.sessionId,
          enhancedResponse.response,
          enhancedResponse.responseTime,
          enhancedResponse.knowledgeUsed,
          enhancedResponse.sourceDocuments
        );

        // Track knowledge search if used
        if (enhancedResponse.knowledgeUsed && enhancedResponse.searchQuery) {
          await ActivityTracker.trackKnowledgeSearch(
            conversation.sessionId,
            enhancedResponse.searchQuery,
            enhancedResponse.sourceDocuments?.length || 0,
            enhancedResponse.responseTime
          );
        }
      }

      // Update conversation last activity
      await db
        .update(chatbotConversations)
        .set({ lastActivityAt: new Date() })
        .where(eq(chatbotConversations.id, conversationId));

      return {
        userMessage: this.formatMessageResponse(userMessage),
        assistantMessage: this.formatMessageResponse(assistantMessage, enhancedResponse)
      };

    } catch (error) {
      console.error('Error sending message:', error);

      // Track error if in active session
      const conversation = await this.getConversationById(conversationId);
      if (conversation && conversation.integrationType !== 'playground') {
        await ActivityTracker.trackError(
          conversation.sessionId,
          'message_processing_error',
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error.stack : undefined
        );
      }

      throw new Error('Failed to process message');
    }
  }

  /**
   * Get conversation by ID with optional message history
   */
  static async getConversation(
    conversationId: string,
    includeMessages: boolean = false
  ): Promise<ConversationResponse | null> {
    try {
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        return null;
      }

      const response = this.formatConversationResponse(conversation);

      if (includeMessages) {
        const messages = await db
          .select()
          .from(chatbotMessages)
          .where(eq(chatbotMessages.conversationId, conversationId))
          .orderBy(chatbotMessages.createdAt);

        response.messages = messages.map(msg => this.formatMessageResponse(msg));
        response.messageCount = messages.length;
      } else {
        // Get message count
        const [messageCount] = await db
          .select({ count: count() })
          .from(chatbotMessages)
          .where(eq(chatbotMessages.conversationId, conversationId));

        response.messageCount = messageCount.count;
      }

      return response;

    } catch (error) {
      console.error('Error getting conversation:', error);
      throw new Error('Failed to get conversation');
    }
  }

  /**
   * Get conversations for a user (for dashboard display)
   */
  static async getConversations(options: {
    userId?: string;
    limit?: number;
    status?: string;
  }): Promise<ConversationResponse[]> {
    try {
      const { userId, limit = 20, status } = options;

      let whereConditions = [];

      // Filter by active/ended status if specified
      if (status === 'active') {
        whereConditions.push(eq(chatbotConversations.endedAt, null));
      } else if (status === 'ended') {
        whereConditions.push(sql`${chatbotConversations.endedAt} IS NOT NULL`);
      }

      // Get conversations
      const conversations = await db
        .select()
        .from(chatbotConversations)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(chatbotConversations.lastActivityAt))
        .limit(Math.min(limit, 100));

      const formattedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const response = this.formatConversationResponse(conv);

          // Get message count
          const [messageCount] = await db
            .select({ count: count() })
            .from(chatbotMessages)
            .where(eq(chatbotMessages.conversationId, conv.id));

          response.messageCount = messageCount.count;
          return response;
        })
      );

      return formattedConversations;

    } catch (error) {
      console.error('Error getting conversations:', error);
      throw new Error('Failed to get conversations');
    }
  }

  /**
   * List conversations for a chatbot
   */
  static async listConversations(
    chatbotId: string,
    query: ConversationQueryRequest
  ): Promise<{ conversations: ConversationResponse[]; total: number }> {
    try {
      let whereConditions = [eq(chatbotConversations.chatbotId, chatbotId)];

      // Add filters
      if (query.integrationType) {
        whereConditions.push(eq(chatbotConversations.integrationType, query.integrationType));
      }

      if (query.isActive !== undefined) {
        if (query.isActive) {
          whereConditions.push(eq(chatbotConversations.endedAt, null));
        } else {
          whereConditions.push(sql`${chatbotConversations.endedAt} IS NOT NULL`);
        }
      }

      if (query.dateRange?.from) {
        whereConditions.push(gte(chatbotConversations.startedAt, new Date(query.dateRange.from)));
      }

      if (query.dateRange?.to) {
        whereConditions.push(lte(chatbotConversations.startedAt, new Date(query.dateRange.to)));
      }

      // Get total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(chatbotConversations)
        .where(and(...whereConditions));

      // Get conversations
      const conversations = await db
        .select()
        .from(chatbotConversations)
        .where(and(...whereConditions))
        .orderBy(desc(chatbotConversations.lastActivityAt))
        .limit(query.limit)
        .offset(query.offset);

      const formattedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const response = this.formatConversationResponse(conv);

          if (query.includeMessages) {
            const messages = await db
              .select()
              .from(chatbotMessages)
              .where(eq(chatbotMessages.conversationId, conv.id))
              .orderBy(chatbotMessages.createdAt);

            response.messages = messages.map(msg => this.formatMessageResponse(msg));
            response.messageCount = messages.length;
          } else {
            // Get message count
            const [messageCount] = await db
              .select({ count: count() })
              .from(chatbotMessages)
              .where(eq(chatbotMessages.conversationId, conv.id));

            response.messageCount = messageCount.count;
          }

          return response;
        })
      );

      return {
        conversations: formattedConversations,
        total: totalResult.count
      };

    } catch (error) {
      console.error('Error listing conversations:', error);
      throw new Error('Failed to list conversations');
    }
  }

  /**
   * Update conversation metadata or end conversation
   */
  static async updateConversation(
    conversationId: string,
    request: ConversationUpdateRequest
  ): Promise<ConversationResponse> {
    try {
      const updateData: any = {};

      if (request.metadata) {
        updateData.metadata = request.metadata;
      }

      if (request.endedAt) {
        updateData.endedAt = new Date(request.endedAt);
      }

      const [updatedConversation] = await db
        .update(chatbotConversations)
        .set(updateData)
        .where(eq(chatbotConversations.id, conversationId))
        .returning();

      if (!updatedConversation) {
        throw new Error('Conversation not found');
      }

      // End activity tracking session if conversation is ended
      if (request.endedAt) {
        await ActivityTracker.endSession(updatedConversation.sessionId);
      }

      return this.formatConversationResponse(updatedConversation);

    } catch (error) {
      console.error('Error updating conversation:', error);
      throw new Error('Failed to update conversation');
    }
  }

  /**
   * Delete conversation (soft delete by ending it)
   */
  static async deleteConversation(conversationId: string): Promise<void> {
    try {
      const [conversation] = await db
        .update(chatbotConversations)
        .set({ endedAt: new Date() })
        .where(eq(chatbotConversations.id, conversationId))
        .returning();

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // End activity tracking session
      await ActivityTracker.endSession(conversation.sessionId);

      console.log(`Deleted conversation: ${conversationId}`);

    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw new Error('Failed to delete conversation');
    }
  }

  /**
   * Update conversation context
   */
  static async updateContext(
    conversationId: string,
    request: ContextUpdateRequest
  ): Promise<void> {
    try {
      const updateData: any = {
        conversationId,
        contextKey: request.contextKey,
        contextValue: request.contextValue,
        updatedAt: new Date()
      };

      if (request.expiresAt) {
        updateData.expiresAt = new Date(request.expiresAt);
      }

      await db
        .insert(conversationContext)
        .values(updateData)
        .onConflictDoUpdate({
          target: [conversationContext.conversationId, conversationContext.contextKey],
          set: {
            contextValue: updateData.contextValue,
            expiresAt: updateData.expiresAt,
            updatedAt: updateData.updatedAt
          }
        });

    } catch (error) {
      console.error('Error updating context:', error);
      throw new Error('Failed to update context');
    }
  }

  /**
   * Get conversation context
   */
  static async getContext(conversationId: string): Promise<Record<string, any>> {
    try {
      const contexts = await db
        .select()
        .from(conversationContext)
        .where(
          and(
            eq(conversationContext.conversationId, conversationId),
            sql`(${conversationContext.expiresAt} IS NULL OR ${conversationContext.expiresAt} > NOW())`
          )
        );

      const contextMap: Record<string, any> = {};
      contexts.forEach(ctx => {
        contextMap[ctx.contextKey] = ctx.contextValue;
      });

      return contextMap;

    } catch (error) {
      console.error('Error getting context:', error);
      throw new Error('Failed to get context');
    }
  }

  // Private helper methods

  private static async getConversationById(conversationId: string) {
    const [conversation] = await db
      .select()
      .from(chatbotConversations)
      .where(eq(chatbotConversations.id, conversationId))
      .limit(1);

    return conversation || null;
  }

  private static formatConversationResponse(conversation: any): ConversationResponse {
    return {
      id: conversation.id,
      chatbotId: conversation.chatbotId,
      sessionId: conversation.sessionId,
      integrationType: conversation.integrationType,
      userIdentifier: conversation.userIdentifier,
      metadata: conversation.metadata || {},
      startedAt: conversation.startedAt.toISOString(),
      endedAt: conversation.endedAt?.toISOString() || null,
      lastActivityAt: conversation.lastActivityAt.toISOString()
    };
  }

  private static formatMessageResponse(
    message: any,
    enhancedResponse?: EnhancedChatResponse
  ): MessageResponse {
    const response: MessageResponse = {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      metadata: message.metadata || {},
      vectorSearchResults: message.vectorSearchResults || [],
      createdAt: message.createdAt.toISOString()
    };

    // Add enhanced response data if available
    if (enhancedResponse) {
      response.knowledgeUsed = enhancedResponse.knowledgeUsed;
      response.sourceDocuments = enhancedResponse.sourceDocuments;
      response.responseTime = enhancedResponse.responseTime;
    }

    return response;
  }
}