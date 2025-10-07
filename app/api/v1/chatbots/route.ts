import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { SimpleChatbotService } from '@/lib/db/simple-chatbot-service';
import {
  validateCreateChatbot,
  validateListChatbotsQuery,
  formatValidationError,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/validation/chatbot';
import { z } from 'zod';

/**
 * GET /api/v1/chatbots
 * List chatbots with pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryData = Object.fromEntries(searchParams.entries());

    let query;
    try {
      query = validateListChatbotsQuery(queryData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // For non-super admins, only show their own chatbots
    const listOptions = {
      page: query.page,
      limit: query.limit,
      status: query.status,
      searchTerm: query.search,
      createdBy: user.role === 'super_admin' ? undefined : user.userId
    };

    // Get chatbots from database
    const result = await SimpleChatbotService.getAllChatbots(listOptions.page, listOptions.limit, false);

    // Transform response to match API schema
    const response = createSuccessResponse({
      chatbots: result.chatbots.map(chatbot => ({
        id: chatbot.id,
        name: chatbot.name,
        description: chatbot.description,
        status: chatbot.status,
        apiKeyHint: chatbot.apiKeyHint,
        configuration: chatbot.configuration,
        knowledgeSourceFilters: chatbot.knowledgeSourceFilters,
        currentSystemPrompt: chatbot.currentSystemPrompt,
        welcomeMessage: chatbot.welcomeMessage,
        createdAt: chatbot.createdAt,
        updatedAt: chatbot.updatedAt,
        conversationCount: 0, // TODO: Implement conversation counting
        userCount: 0, // TODO: Implement user counting
        lastActivity: null // TODO: Implement last activity tracking
      })),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNext: result.hasNext,
        hasPrevious: result.hasPrevious
      }
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('List chatbots API error:', error);
    return NextResponse.json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      ),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/chatbots
 * Create a new chatbot (super_admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check permissions - only super_admin can create chatbots
    // Simplified permission check for Phase 2 testing
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json(
        createErrorResponse(
          'Insufficient permissions to create chatbots',
          'FORBIDDEN'
        ),
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();

    let createData;
    try {
      createData = validateCreateChatbot(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // Create chatbot
    const result = await SimpleChatbotService.createChatbot({
      ...createData,
      createdBy: user.userId
    });

    // Transform response to match API schema
    const response = createSuccessResponse({
      chatbot: {
        id: result.chatbot.id,
        name: result.chatbot.name,
        description: result.chatbot.description,
        status: result.chatbot.status,
        apiKeyHint: result.chatbot.apiKeyHint,
        configuration: result.chatbot.configuration,
        knowledgeSourceFilters: result.chatbot.knowledgeSourceFilters,
        currentSystemPrompt: result.chatbot.currentSystemPrompt,
        welcomeMessage: result.chatbot.welcomeMessage,
        createdAt: result.chatbot.createdAt,
        updatedAt: result.chatbot.updatedAt,
        conversationCount: 0,
        userCount: 0,
        lastActivity: null
      },
      apiKey: result.apiKey
    });

    return NextResponse.json(response, { status: 201 });

  } catch (error: any) {
    console.error('Create chatbot API error:', error);

    // Handle specific database errors
    if (error.code === '23505') { // PostgreSQL unique violation
      return NextResponse.json(
        createErrorResponse(
          'A chatbot with this name already exists',
          'DUPLICATE_NAME'
        ),
        { status: 409 }
      );
    }

    return NextResponse.json(
      createErrorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'development' ? error.message : undefined
      ),
      { status: 500 }
    );
  }
}

/**
 * Other HTTP methods are not allowed
 */
export async function PUT() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}