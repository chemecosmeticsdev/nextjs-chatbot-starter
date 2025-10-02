import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import {
  generatePromptSchema,
  type GeneratePromptRequest
} from '@/lib/validation/prompt';
import { formatValidationErrors } from '@/lib/validation/common';
import { PromptGenerationService } from '@/lib/services/prompt-generation';

/**
 * POST /api/v1/chatbots/[id]/prompt/generate
 *
 * Generate system prompt using AI based on context and requirements
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Validate chatbot ID
    const chatbotId = params.id;
    if (!chatbotId || typeof chatbotId !== 'string') {
      return NextResponse.json(
        createErrorResponse('Invalid chatbot ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      chatbotId,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied to this chatbot', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body: GeneratePromptRequest;
    try {
      const rawBody = await request.json();
      body = generatePromptSchema.parse(rawBody);
    } catch (error) {
      return NextResponse.json(
        createErrorResponse(
          'Validation failed',
          'VALIDATION_ERROR',
          formatValidationErrors(error)
        ),
        { status: 400 }
      );
    }

    // Check if chatbot exists
    const existingChatbot = await ChatbotService.getChatbotById(chatbotId);
    if (!existingChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Create generation job
    const generationJob = await ChatbotService.createPromptGenerationJob(
      chatbotId,
      user.id,
      body
    );

    if (!generationJob) {
      return NextResponse.json(
        createErrorResponse('Failed to create generation job', 'GENERATION_FAILED'),
        { status: 500 }
      );
    }

    // Start asynchronous prompt generation
    try {
      const generatedPrompt = await PromptGenerationService.generatePrompt({
        chatbotId,
        businessContext: body.businessContext,
        targetAudience: body.targetAudience,
        communicationStyle: body.communicationStyle,
        keyTopics: body.keyTopics,
        constraints: body.constraints,
        existingPrompt: existingChatbot.currentSystemPrompt,
        documentContext: body.documentContext
      });

      // Update the generation job with results
      await ChatbotService.updatePromptGenerationJob(generationJob.id, {
        status: 'completed',
        generatedPrompt,
        completedAt: new Date()
      });

      // Log successful generation
      console.log(
        `AI prompt generated for chatbot ${chatbotId} by user ${user.id} - ` +
        `Job ID: ${generationJob.id}, Length: ${generatedPrompt.length} chars`
      );

      return NextResponse.json(
        createSuccessResponse({
          jobId: generationJob.id,
          generatedPrompt,
          status: 'completed',
          message: 'Prompt generated successfully',
          metadata: {
            generatedAt: new Date(),
            promptLength: generatedPrompt.length,
            contextUsed: {
              businessContext: !!body.businessContext,
              targetAudience: !!body.targetAudience,
              documentContext: body.documentContext?.length || 0
            }
          }
        }),
        { status: 200 }
      );

    } catch (generationError) {
      console.error('Prompt generation failed:', generationError);

      // Update job with error status
      await ChatbotService.updatePromptGenerationJob(generationJob.id, {
        status: 'failed',
        error: generationError instanceof Error ? generationError.message : 'Unknown error',
        completedAt: new Date()
      });

      return NextResponse.json(
        createErrorResponse(
          'Failed to generate prompt using AI',
          'GENERATION_FAILED',
          {
            jobId: generationJob.id,
            error: generationError instanceof Error ? generationError.message : 'Unknown error'
          }
        ),
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in prompt generation endpoint:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/chatbots/[id]/prompt/generate
 *
 * Get status of prompt generation jobs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Validate chatbot ID
    const chatbotId = params.id;
    if (!chatbotId || typeof chatbotId !== 'string') {
      return NextResponse.json(
        createErrorResponse('Invalid chatbot ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      chatbotId,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied to this chatbot', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Get generation jobs history
    const generationJobs = await ChatbotService.getPromptGenerationJobs(chatbotId, {
      page,
      limit
    });

    return NextResponse.json(
      createSuccessResponse({
        jobs: generationJobs.jobs,
        pagination: generationJobs.pagination
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting generation jobs:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
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