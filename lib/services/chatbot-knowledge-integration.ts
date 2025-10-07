import { KnowledgeBaseService } from './knowledge-base';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { VectorSearchResult } from '@/lib/validation/knowledge-base';

interface ChatbotKnowledgeConfig {
  searchThreshold: number;
  maxSearchResults: number;
  enableKnowledgeBase: boolean;
  knowledgeSourceFilters?: {
    documentTypes?: string[];
    categories?: string[];
    supplierIds?: string[];
  };
}

export interface EnhancedChatResponse {
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
}

export interface ChatContext {
  userId?: string;
  sessionId: string;
  chatbotId: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}

export class ChatbotKnowledgeIntegration {
  private static bedrockClient: BedrockRuntimeClient;

  static {
    // Initialize Bedrock client
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  /**
   * Generate an enhanced chatbot response using knowledge base integration
   */
  static async generateEnhancedResponse(
    userMessage: string,
    chatbotConfig: ChatbotKnowledgeConfig,
    context: ChatContext,
    systemPrompt?: string
  ): Promise<EnhancedChatResponse> {
    const startTime = Date.now();

    try {
      let knowledgeContext = '';
      let sourceDocuments: EnhancedChatResponse['sourceDocuments'] = [];
      let searchQuery = '';
      let knowledgeUsed = false;

      // Perform knowledge base search if enabled
      if (chatbotConfig.enableKnowledgeBase) {
        const searchResult = await this.searchKnowledgeBase(
          userMessage,
          chatbotConfig,
          context
        );

        if (searchResult.results.length > 0) {
          knowledgeUsed = true;
          searchQuery = searchResult.query;
          knowledgeContext = this.formatKnowledgeContext(searchResult.results);
          sourceDocuments = searchResult.results.map(result => ({
            documentId: result.documentId,
            documentName: result.metadata.documentName || 'Unknown Document',
            similarity: result.similarity,
            category: result.metadata.category,
            supplier: result.metadata.supplier
          }));
        }
      }

      // Generate response using LLM with knowledge context
      const response = await this.generateLLMResponse(
        userMessage,
        knowledgeContext,
        context,
        systemPrompt
      );

      const responseTime = Date.now() - startTime;

      // Log the enhanced response for analytics
      console.log(
        `Enhanced chatbot response - Chatbot: ${context.chatbotId}, ` +
        `Session: ${context.sessionId}, Knowledge Used: ${knowledgeUsed}, ` +
        `Sources: ${sourceDocuments.length}, Response Time: ${responseTime}ms`
      );

      return {
        response,
        knowledgeUsed,
        sourceDocuments: sourceDocuments.length > 0 ? sourceDocuments : undefined,
        searchQuery: knowledgeUsed ? searchQuery : undefined,
        responseTime
      };

    } catch (error) {
      console.error('Error generating enhanced response:', error);

      // Fallback to basic response without knowledge base
      const fallbackResponse = await this.generateLLMResponse(
        userMessage,
        '',
        context,
        systemPrompt
      );

      return {
        response: fallbackResponse,
        knowledgeUsed: false,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Search the knowledge base for relevant context
   */
  private static async searchKnowledgeBase(
    userMessage: string,
    config: ChatbotKnowledgeConfig,
    context: ChatContext
  ): Promise<{ results: VectorSearchResult[]; query: string }> {
    // Extract search query from user message
    const searchQuery = this.extractSearchQuery(userMessage, context.conversationHistory);

    try {
      const searchResult = await KnowledgeBaseService.vectorSearch({
        query: searchQuery,
        limit: config.maxSearchResults,
        threshold: config.searchThreshold,
        filters: config.knowledgeSourceFilters || {},
        includeContent: true,
        cacheResults: true
      });

      // Log the search for analytics
      await KnowledgeBaseService.logSearchQuery(
        context.userId || null,
        searchQuery,
        config.knowledgeSourceFilters || {},
        searchResult.results.length,
        searchResult.searchTime,
        context.sessionId,
        'chatbot-integration'
      );

      return {
        results: searchResult.results,
        query: searchQuery
      };

    } catch (error) {
      console.error('Knowledge base search failed:', error);
      return { results: [], query: searchQuery };
    }
  }

  /**
   * Extract search query from user message and conversation context
   */
  private static extractSearchQuery(
    userMessage: string,
    conversationHistory: ChatContext['conversationHistory']
  ): string {
    // For now, use the user message directly as search query
    // In the future, this could be enhanced with:
    // - Entity extraction
    // - Intent recognition
    // - Context from conversation history
    // - Query reformulation

    let searchQuery = userMessage.trim();

    // Remove common conversational patterns that don't help with search
    searchQuery = searchQuery
      .replace(/^(can you|could you|please|help me|i want to|i need to|how do i|what is|tell me about)\s+/i, '')
      .replace(/\?$/, '')
      .trim();

    // If the query is very short or generic, try to get context from conversation
    if (searchQuery.length < 10 && conversationHistory.length > 0) {
      const recentUserMessages = conversationHistory
        .filter(msg => msg.role === 'user')
        .slice(-2)
        .map(msg => msg.content)
        .join(' ');

      if (recentUserMessages.length > searchQuery.length) {
        searchQuery = recentUserMessages;
      }
    }

    return searchQuery.substring(0, 500); // Limit query length
  }

  /**
   * Format knowledge base results into context for LLM
   */
  private static formatKnowledgeContext(results: VectorSearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    let context = 'Here is relevant information from the knowledge base:\n\n';

    results.forEach((result, index) => {
      context += `[${index + 1}] From "${result.metadata.documentName || 'Document'}":\n`;
      context += `${result.content}\n\n`;
    });

    context += 'Please use this information to provide accurate and helpful responses. ';
    context += 'If the information doesn\'t directly answer the user\'s question, ';
    context += 'acknowledge that and provide the best guidance you can.';

    return context;
  }

  /**
   * Generate LLM response with optional knowledge context
   */
  private static async generateLLMResponse(
    userMessage: string,
    knowledgeContext: string,
    context: ChatContext,
    systemPrompt?: string
  ): Promise<string> {
    try {
      // Build conversation history
      const messages = [];

      // Add system prompt
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add knowledge context if available
      if (knowledgeContext) {
        messages.push({
          role: 'system',
          content: knowledgeContext
        });
      }

      // Add recent conversation history
      const recentHistory = context.conversationHistory.slice(-6); // Last 6 messages
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });

      // Add current user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-micro-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          messages,
          max_tokens: 1000,
          temperature: 0.7,
          top_p: 0.9
        })
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return responseBody.output?.message?.content?.[0]?.text ||
             'I apologize, but I was unable to generate a response at this time.';

    } catch (error) {
      console.error('Error generating LLM response:', error);
      return 'I apologize, but I\'m experiencing technical difficulties. Please try again later.';
    }
  }

  /**
   * Determine if a message should trigger knowledge base search
   */
  static shouldUseKnowledgeBase(
    userMessage: string,
    chatbotConfig: ChatbotKnowledgeConfig
  ): boolean {
    if (!chatbotConfig.enableKnowledgeBase) {
      return false;
    }

    // Skip very short messages
    if (userMessage.trim().length < 10) {
      return false;
    }

    // Skip common conversational greetings
    const greetingPatterns = [
      /^(hi|hello|hey|good morning|good afternoon|good evening)$/i,
      /^(thank you|thanks|bye|goodbye)$/i,
      /^(ok|okay|yes|no)$/i
    ];

    if (greetingPatterns.some(pattern => pattern.test(userMessage.trim()))) {
      return false;
    }

    return true;
  }

  /**
   * Get default knowledge base configuration for a chatbot
   */
  static getDefaultKnowledgeConfig(): ChatbotKnowledgeConfig {
    return {
      searchThreshold: 0.7,
      maxSearchResults: 5,
      enableKnowledgeBase: true,
      knowledgeSourceFilters: {}
    };
  }

  /**
   * Validate knowledge base configuration
   */
  static validateKnowledgeConfig(config: any): ChatbotKnowledgeConfig {
    return {
      searchThreshold: Math.max(0.5, Math.min(1.0, config.searchThreshold || 0.7)),
      maxSearchResults: Math.max(1, Math.min(10, config.maxSearchResults || 5)),
      enableKnowledgeBase: Boolean(config.enableKnowledgeBase !== false),
      knowledgeSourceFilters: {
        documentTypes: Array.isArray(config.knowledgeSourceFilters?.documentTypes)
          ? config.knowledgeSourceFilters.documentTypes
          : undefined,
        categories: Array.isArray(config.knowledgeSourceFilters?.categories)
          ? config.knowledgeSourceFilters.categories
          : undefined,
        supplierIds: Array.isArray(config.knowledgeSourceFilters?.supplierIds)
          ? config.knowledgeSourceFilters.supplierIds
          : undefined
      }
    };
  }

  /**
   * Update chatbot configuration with knowledge base settings
   */
  static mergeKnowledgeConfig(
    existingConfig: any,
    knowledgeConfig: Partial<ChatbotKnowledgeConfig>
  ): any {
    return {
      ...existingConfig,
      knowledgeBase: {
        ...this.getDefaultKnowledgeConfig(),
        ...existingConfig.knowledgeBase,
        ...knowledgeConfig
      }
    };
  }
}