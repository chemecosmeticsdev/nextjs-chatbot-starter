import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { ChatbotService } from '@/lib/db/chatbot-service';
import {
  validateUpdateChatbot,
  validateChatbotId,
  formatValidationError,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/validation/chatbot';
import { z } from 'zod';

/**
 * GET /api/v1/chatbots/[id]
 * Get chatbot details by ID
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
        createErrorResponse(
          'Access denied to this chatbot',
          'FORBIDDEN'
        ),
        { status: 403 }
      );
    }

    // Get chatbot from database
    const chatbot = await ChatbotService.getChatbotById(validatedParams.id);

    // Debug logging
    console.log('DEBUG - Chatbot retrieved:', {
      id: chatbot?.id,
      hasConfiguration: !!chatbot?.configuration,
      configType: typeof chatbot?.configuration,
      configValue: chatbot?.configuration
    });

    if (!chatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Transform response to match API schema
    const response = createSuccessResponse({
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
      conversationCount: chatbot.conversationCount,
      userCount: chatbot.userCount,
      lastActivity: chatbot.lastActivity
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Get chatbot API error:', error);
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
 * PUT /api/v1/chatbots/[id]
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
        createErrorResponse(
          'Access denied to this chatbot',
          'FORBIDDEN'
        ),
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();

    let updateData;
    try {
      updateData = validateUpdateChatbot(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          formatValidationError(error),
          { status: 400 }
        );
      }
      throw error;
    }

    // Update chatbot
    const updatedChatbot = await ChatbotService.updateChatbot(
      validatedParams.id,
      updateData
    );

    if (!updatedChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Get updated chatbot with stats
    const chatbotWithStats = await ChatbotService.getChatbotById(validatedParams.id);

    // Transform response to match API schema
    const response = createSuccessResponse({
      id: chatbotWithStats!.id,
      name: chatbotWithStats!.name,
      description: chatbotWithStats!.description,
      status: chatbotWithStats!.status,
      apiKeyHint: chatbotWithStats!.apiKeyHint,
      configuration: chatbotWithStats!.configuration,
      knowledgeSourceFilters: chatbotWithStats!.knowledgeSourceFilters,
      currentSystemPrompt: chatbotWithStats!.currentSystemPrompt,
      welcomeMessage: chatbotWithStats!.welcomeMessage,
      createdAt: chatbotWithStats!.createdAt,
      updatedAt: chatbotWithStats!.updatedAt,
      conversationCount: chatbotWithStats!.conversationCount,
      userCount: chatbotWithStats!.userCount,
      lastActivity: chatbotWithStats!.lastActivity
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Update chatbot API error:', error);

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
 * DELETE /api/v1/chatbots/[id]
 * Soft delete chatbot
 */
export async function DELETE(
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
        createErrorResponse(
          'Access denied to this chatbot',
          'FORBIDDEN'
        ),
        { status: 403 }
      );
    }

    // Check if chatbot exists before deletion
    const existingChatbot = await ChatbotService.getChatbotById(validatedParams.id);
    if (!existingChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Soft delete chatbot
    const deleted = await ChatbotService.deleteChatbot(validatedParams.id);

    if (!deleted) {
      return NextResponse.json(
        createErrorResponse('Failed to delete chatbot', 'DELETE_FAILED'),
        { status: 500 }
      );
    }

    // Return success response
    const response = createSuccessResponse({
      message: 'Chatbot deleted successfully',
      deletedAt: new Date().toISOString()
    });

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Delete chatbot API error:', error);
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
export async function POST() {
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