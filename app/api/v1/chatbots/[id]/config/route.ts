import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { ChatbotService } from '@/lib/db/chatbot-service';
import {
  validateChatbotId,
  formatValidationError,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/validation/chatbot';
import { z } from 'zod';

// Validation schema for chatbot configuration updates
const updateConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive', 'training']).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(100).max(8192).optional(),
  systemPrompt: z.string().optional(),
  responseStyle: z.enum(['professional', 'casual', 'friendly', 'technical']).optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  enableLogging: z.boolean().optional(),
  enableAnalytics: z.boolean().optional(),
  rateLimitPerMinute: z.number().min(1).max(1000).optional(),
  sessionTimeout: z.number().min(5).max(180).optional(),
  autoSave: z.boolean().optional(),
  enableFallback: z.boolean().optional(),
  fallbackMessage: z.string().optional(),
  enableWelcomeMessage: z.boolean().optional(),
  welcomeMessage: z.string().optional(),
  enableTypingIndicator: z.boolean().optional(),
  maxConversationLength: z.number().min(1).max(100).optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  enableEmoticons: z.boolean().optional(),
  enableFileUploads: z.boolean().optional(),
  maxFileSize: z.number().min(1).max(100).optional(),
  allowedFileTypes: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/chatbots/[id]/config
 * Get chatbot configuration details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Validate chatbot ID
    let validatedParams;
    try {
      validatedParams = validateChatbotId(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      validatedParams.id,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Get chatbot configuration
    const chatbot = await ChatbotService.getChatbotById(validatedParams.id);
    if (!chatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Extract configuration from chatbot data
    const configuration = {
      id: chatbot.id,
      name: chatbot.name,
      description: chatbot.description,
      status: chatbot.status,
      model: chatbot.configuration?.model || 'anthropic.claude-3-haiku-20240307-v1:0',
      temperature: chatbot.configuration?.temperature || 0.7,
      maxTokens: chatbot.configuration?.maxTokens || 2048,
      systemPrompt: chatbot.systemPrompt || '',
      responseStyle: chatbot.configuration?.responseStyle || 'professional',
      language: chatbot.configuration?.language || 'en',
      timezone: chatbot.configuration?.timezone || 'UTC',
      enableLogging: chatbot.configuration?.enableLogging ?? true,
      enableAnalytics: chatbot.configuration?.enableAnalytics ?? true,
      rateLimitPerMinute: chatbot.configuration?.rateLimitPerMinute || 60,
      sessionTimeout: chatbot.configuration?.sessionTimeout || 30,
      autoSave: chatbot.configuration?.autoSave ?? true,
      enableFallback: chatbot.configuration?.enableFallback ?? true,
      fallbackMessage: chatbot.configuration?.fallbackMessage || "I'm sorry, I didn't understand that. Could you please rephrase your question?",
      enableWelcomeMessage: chatbot.configuration?.enableWelcomeMessage ?? true,
      welcomeMessage: chatbot.configuration?.welcomeMessage || "Hello! How can I help you today?",
      enableTypingIndicator: chatbot.configuration?.enableTypingIndicator ?? true,
      maxConversationLength: chatbot.configuration?.maxConversationLength || 50,
      retentionDays: chatbot.configuration?.retentionDays || 30,
      enableEmoticons: chatbot.configuration?.enableEmoticons ?? false,
      enableFileUploads: chatbot.configuration?.enableFileUploads ?? false,
      maxFileSize: chatbot.configuration?.maxFileSize || 10,
      allowedFileTypes: chatbot.configuration?.allowedFileTypes || ['pdf', 'txt', 'docx'],
      createdAt: chatbot.createdAt,
      updatedAt: chatbot.updatedAt,
    };

    return NextResponse.json(createSuccessResponse(configuration));

  } catch (error: any) {
    console.error('Error fetching chatbot configuration:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/chatbots/[id]/config
 * Update chatbot configuration
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Validate chatbot ID
    let validatedParams;
    try {
      validatedParams = validateChatbotId(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      validatedParams.id,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse and validate request body
    let configData;
    try {
      const body = await request.json();
      configData = updateConfigSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      return NextResponse.json(
        createErrorResponse('Invalid JSON in request body', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Get current chatbot to merge configurations
    const currentChatbot = await ChatbotService.getChatbotById(validatedParams.id);
    if (!currentChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Prepare update data for ChatbotService
    const updateData: any = {};

    // Basic fields that map directly
    if (configData.name !== undefined) updateData.name = configData.name;
    if (configData.description !== undefined) updateData.description = configData.description;
    if (configData.status !== undefined) updateData.status = configData.status;
    if (configData.systemPrompt !== undefined) updateData.systemPrompt = configData.systemPrompt;

    // Configuration object - merge with existing configuration
    const currentConfig = currentChatbot.configuration || {};
    const newConfiguration = { ...currentConfig };

    // Update configuration fields
    if (configData.model !== undefined) newConfiguration.model = configData.model;
    if (configData.temperature !== undefined) newConfiguration.temperature = configData.temperature;
    if (configData.maxTokens !== undefined) newConfiguration.maxTokens = configData.maxTokens;
    if (configData.responseStyle !== undefined) newConfiguration.responseStyle = configData.responseStyle;
    if (configData.language !== undefined) newConfiguration.language = configData.language;
    if (configData.timezone !== undefined) newConfiguration.timezone = configData.timezone;
    if (configData.enableLogging !== undefined) newConfiguration.enableLogging = configData.enableLogging;
    if (configData.enableAnalytics !== undefined) newConfiguration.enableAnalytics = configData.enableAnalytics;
    if (configData.rateLimitPerMinute !== undefined) newConfiguration.rateLimitPerMinute = configData.rateLimitPerMinute;
    if (configData.sessionTimeout !== undefined) newConfiguration.sessionTimeout = configData.sessionTimeout;
    if (configData.autoSave !== undefined) newConfiguration.autoSave = configData.autoSave;
    if (configData.enableFallback !== undefined) newConfiguration.enableFallback = configData.enableFallback;
    if (configData.fallbackMessage !== undefined) newConfiguration.fallbackMessage = configData.fallbackMessage;
    if (configData.enableWelcomeMessage !== undefined) newConfiguration.enableWelcomeMessage = configData.enableWelcomeMessage;
    if (configData.welcomeMessage !== undefined) newConfiguration.welcomeMessage = configData.welcomeMessage;
    if (configData.enableTypingIndicator !== undefined) newConfiguration.enableTypingIndicator = configData.enableTypingIndicator;
    if (configData.maxConversationLength !== undefined) newConfiguration.maxConversationLength = configData.maxConversationLength;
    if (configData.retentionDays !== undefined) newConfiguration.retentionDays = configData.retentionDays;
    if (configData.enableEmoticons !== undefined) newConfiguration.enableEmoticons = configData.enableEmoticons;
    if (configData.enableFileUploads !== undefined) newConfiguration.enableFileUploads = configData.enableFileUploads;
    if (configData.maxFileSize !== undefined) newConfiguration.maxFileSize = configData.maxFileSize;
    if (configData.allowedFileTypes !== undefined) newConfiguration.allowedFileTypes = configData.allowedFileTypes;

    updateData.configuration = newConfiguration;

    // Update chatbot
    const updatedChatbot = await ChatbotService.updateChatbot(
      validatedParams.id,
      updateData,
      user.id
    );

    if (!updatedChatbot) {
      return NextResponse.json(
        createErrorResponse('Failed to update chatbot configuration', 'UPDATE_FAILED'),
        { status: 500 }
      );
    }

    // Return updated configuration in same format as GET
    const updatedConfiguration = {
      id: updatedChatbot.id,
      name: updatedChatbot.name,
      description: updatedChatbot.description,
      status: updatedChatbot.status,
      model: updatedChatbot.configuration?.model || 'anthropic.claude-3-haiku-20240307-v1:0',
      temperature: updatedChatbot.configuration?.temperature || 0.7,
      maxTokens: updatedChatbot.configuration?.maxTokens || 2048,
      systemPrompt: updatedChatbot.systemPrompt || '',
      responseStyle: updatedChatbot.configuration?.responseStyle || 'professional',
      language: updatedChatbot.configuration?.language || 'en',
      timezone: updatedChatbot.configuration?.timezone || 'UTC',
      enableLogging: updatedChatbot.configuration?.enableLogging ?? true,
      enableAnalytics: updatedChatbot.configuration?.enableAnalytics ?? true,
      rateLimitPerMinute: updatedChatbot.configuration?.rateLimitPerMinute || 60,
      sessionTimeout: updatedChatbot.configuration?.sessionTimeout || 30,
      autoSave: updatedChatbot.configuration?.autoSave ?? true,
      enableFallback: updatedChatbot.configuration?.enableFallback ?? true,
      fallbackMessage: updatedChatbot.configuration?.fallbackMessage || "I'm sorry, I didn't understand that. Could you please rephrase your question?",
      enableWelcomeMessage: updatedChatbot.configuration?.enableWelcomeMessage ?? true,
      welcomeMessage: updatedChatbot.configuration?.welcomeMessage || "Hello! How can I help you today?",
      enableTypingIndicator: updatedChatbot.configuration?.enableTypingIndicator ?? true,
      maxConversationLength: updatedChatbot.configuration?.maxConversationLength || 50,
      retentionDays: updatedChatbot.configuration?.retentionDays || 30,
      enableEmoticons: updatedChatbot.configuration?.enableEmoticons ?? false,
      enableFileUploads: updatedChatbot.configuration?.enableFileUploads ?? false,
      maxFileSize: updatedChatbot.configuration?.maxFileSize || 10,
      allowedFileTypes: updatedChatbot.configuration?.allowedFileTypes || ['pdf', 'txt', 'docx'],
      createdAt: updatedChatbot.createdAt,
      updatedAt: updatedChatbot.updatedAt,
    };

    return NextResponse.json(createSuccessResponse(updatedConfiguration));

  } catch (error: any) {
    console.error('Error updating chatbot configuration:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}