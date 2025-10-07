/**
 * Claude Agent Service
 * Main service for integrating Claude Agent SDK with our chatbot system
 * Supports Thai/English cosmetic ingredients B2B operations
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Configuration interface for Claude Agent
export interface ClaudeAgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enableVectorSearch?: boolean;
  similarityThreshold?: number;
  language?: 'th' | 'en' | 'auto';
}

// Agent response interface
export interface AgentResponse {
  content: string;
  metadata: {
    responseTime: number;
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    vectorSearchResults?: VectorSearchResult[];
    model: string;
    temperature: number;
    language: string;
  };
}

// Vector search result interface
export interface VectorSearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: {
    documentName?: string;
    category?: string;
    supplier?: string;
    ingredientName?: string;
    [key: string]: any;
  };
}

// Conversation context interface
export interface ConversationContext {
  chatbotId: string;
  sessionId: string;
  userId?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  metadata: {
    language: string;
    businessContext: 'cosmetic_ingredients' | 'formulation' | 'purchase_order' | 'general';
    [key: string]: any;
  };
}

export class ClaudeAgentService {
  private bedrockClient: BedrockRuntimeClient;
  private defaultConfig: ClaudeAgentConfig;

  constructor() {
    // Initialize AWS Bedrock client
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
      },
    });

    // Default configuration
    this.defaultConfig = {
      model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      temperature: 0.7,
      maxTokens: 4000,
      enableVectorSearch: true,
      similarityThreshold: 0.7,
      language: 'auto',
      systemPrompt: this.getDefaultSystemPrompt(),
    };
  }

  private getDefaultSystemPrompt(): string {
    return `You are a specialized AI assistant for a Thai cosmetic ingredients B2B business.

Key responsibilities:
1. Answer questions about INCI ingredients information in Thai (with English technical terms)
2. Provide formulation recommendations for cosmetic products
3. Assist with purchase order generation
4. Maintain professional tone suitable for B2B communication

Language Guidelines:
- Primary language: Thai
- Use English for technical terms (INCI names, chemical names, regulatory terms)
- Example: "ส่วนผสม SODIUM HYALURONATE นี้มีคุณสมบัติในการ moisturizing ที่ดีเยี่ยม"
- Always respond in Thai unless specifically asked to respond in English

Context: You have access to a comprehensive database of cosmetic ingredients, formulations, suppliers, and regulatory information through vector search capabilities.`;
  }

  /**
   * Process a chat message using Claude Agent SDK
   */
  async processMessage(
    message: string,
    context: ConversationContext,
    config?: Partial<ClaudeAgentConfig>
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      console.log('Processing message with Claude Agent SDK:', {
        message: message.substring(0, 100),
        chatbotId: context.chatbotId,
        sessionId: context.sessionId,
        model: finalConfig.model
      });

      // Detect language
      const detectedLanguage = this.detectLanguage(message);

      // Generate real response using Claude 3.5 Sonnet via Bedrock
      const response = await this.generateRealResponse(message, context, finalConfig, detectedLanguage);

      const responseTime = Date.now() - startTime;

      console.log('Claude Agent SDK response generated:', {
        responseTime,
        language: detectedLanguage,
        contentLength: response.content.length,
        model: finalConfig.model
      });

      return {
        content: response.content,
        metadata: {
          responseTime,
          tokenUsage: response.tokenUsage,
          vectorSearchResults: response.vectorSearchResults,
          model: finalConfig.model || 'claude-3-5-sonnet',
          temperature: finalConfig.temperature || 0.7,
          language: detectedLanguage,
        },
      };
    } catch (error) {
      console.error('Error processing message with Claude Agent:', error);
      throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect language of input message
   */
  private detectLanguage(message: string): string {
    // Simple language detection logic
    // This will be enhanced with the franc library
    const thaiPattern = /[\u0E00-\u0E7F]/;
    const hasThaiChars = thaiPattern.test(message);

    if (hasThaiChars) {
      return 'th';
    }

    return 'en';
  }

  /**
   * Generate real response using Claude 3.5 Sonnet via AWS Bedrock
   */
  private async generateRealResponse(
    message: string,
    context: ConversationContext,
    config: ClaudeAgentConfig,
    language: string
  ) {
    try {
      // Build conversation history
      const messages = [];

      // Add system prompt
      if (config.systemPrompt) {
        messages.push({
          role: 'user',
          content: `<system>${config.systemPrompt}</system>`
        });
        messages.push({
          role: 'assistant',
          content: 'I understand. I\'m a specialized AI assistant for Thai cosmetic ingredients B2B business. I\'ll respond in Thai with English technical terms when appropriate.'
        });
      }

      // Add recent conversation history (last 6 messages)
      const recentHistory = context.conversationHistory.slice(-6);
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'system' ? 'user' : msg.role,
          content: msg.content
        });
      });

      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });

      const command = new InvokeModelCommand({
        modelId: config.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: config.maxTokens || 4000,
          temperature: config.temperature || 0.7,
          messages
        })
      });

      console.log('Calling Claude 3.5 Sonnet via Bedrock with:', {
        model: config.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        messageCount: messages.length,
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 4000
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      console.log('Claude 3.5 Sonnet response received:', {
        usage: responseBody.usage,
        outputLength: responseBody.content?.[0]?.text?.length || 0
      });

      const content = responseBody.content?.[0]?.text || 'ขออพใจครับ เกิดข้อผิดพลาดในการสร้างคำตอบ กรุณาลองใหม่อีกครั้ง';

      return {
        content,
        tokenUsage: {
          prompt: responseBody.usage?.input_tokens || 0,
          completion: responseBody.usage?.output_tokens || 0,
          total: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
        },
        vectorSearchResults: [], // TODO: Add vector search integration
      };

    } catch (error) {
      console.error('Error calling Claude 3.5 Sonnet:', error);

      // Fallback response
      const isThaiMessage = language === 'th';
      const fallbackContent = isThaiMessage
        ? 'ขออพใจครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ AI กรุณาลองใหม่อีกครั้ง'
        : 'I apologize, there was an error connecting to the AI system. Please try again.';

      return {
        content: fallbackContent,
        tokenUsage: {
          prompt: Math.floor(message.length / 4),
          completion: Math.floor(fallbackContent.length / 4),
          total: Math.floor((message.length + fallbackContent.length) / 4),
        },
        vectorSearchResults: [],
      };
    }
  }

  /**
   * Update system prompt for the agent
   */
  async updateSystemPrompt(newPrompt: string): Promise<void> {
    this.defaultConfig.systemPrompt = newPrompt;
    // TODO: Persist to database
  }

  /**
   * Get current configuration
   */
  getConfig(): ClaudeAgentConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ClaudeAgentConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...updates };
  }
}

// Export singleton instance
export const claudeAgentService = new ClaudeAgentService();