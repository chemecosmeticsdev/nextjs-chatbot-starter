import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, CommonSchemas, ErrorCodes, ApiError, type ApiContext } from '../handler';
import { db } from '@/lib/db';
import { chatbots } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/chatbots/[chatbotId]
export const getChatbotHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 300, // 5 minutes
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 60, // 60 requests per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;

    // Check if user has access to this chatbot
    const chatbot = await db
      .select()
      .from(chatbots)
      .where(eq(chatbots.id, chatbotId))
      .limit(1);

    if (chatbot.length === 0) {
      throw new ApiError(
        ErrorCodes.CHATBOT_NOT_FOUND,
        `Chatbot with ID ${chatbotId} not found`
      );
    }

    // TODO: Add authorization check
    // if (chatbot[0].userId !== context.userId) {
    //   throw new ApiError(ErrorCodes.FORBIDDEN, 'Access denied');
    // }

    return {
      chatbot: chatbot[0],
      stats: {
        totalConversations: 0, // Would be calculated from analytics service
        totalMessages: 0,
        avgResponseTime: 0,
      },
    };
  }
);

// POST /api/chatbots
export const createChatbotHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      body: z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        model: z.string().default('nova-micro'),
        settings: z.object({
          temperature: z.number().min(0).max(2).default(0.7),
          maxTokens: z.number().min(1).max(4000).default(1000),
          systemPrompt: z.string().max(2000).optional(),
        }).optional(),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 300000, // 5 minutes
      max: 10, // 10 chatbot creations per 5 minutes
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { name, description, model, settings } = context.validatedBody;

    // Create new chatbot
    const newChatbot = await db
      .insert(chatbots)
      .values({
        id: crypto.randomUUID(),
        name,
        description,
        model,
        settings: settings ? JSON.stringify(settings) : null,
        userId: context.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      chatbot: newChatbot[0],
      message: 'Chatbot created successfully',
    };
  }
);

// PUT /api/chatbots/[chatbotId]
export const updateChatbotHandler = createApiHandler(
  {
    method: 'PUT',
    validation: {
      params: CommonSchemas.chatbotId,
      body: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        model: z.string().optional(),
        settings: z.object({
          temperature: z.number().min(0).max(2).optional(),
          maxTokens: z.number().min(1).max(4000).optional(),
          systemPrompt: z.string().max(2000).optional(),
        }).optional(),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 30, // 30 updates per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const updateData = context.validatedBody;

    // Check if chatbot exists and user has access
    const existingChatbot = await db
      .select()
      .from(chatbots)
      .where(eq(chatbots.id, chatbotId))
      .limit(1);

    if (existingChatbot.length === 0) {
      throw new ApiError(
        ErrorCodes.CHATBOT_NOT_FOUND,
        `Chatbot with ID ${chatbotId} not found`
      );
    }

    // TODO: Add authorization check
    // if (existingChatbot[0].userId !== context.userId) {
    //   throw new ApiError(ErrorCodes.FORBIDDEN, 'Access denied');
    // }

    // Update chatbot
    const updatedChatbot = await db
      .update(chatbots)
      .set({
        ...updateData,
        settings: updateData.settings
          ? JSON.stringify(updateData.settings)
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(chatbots.id, chatbotId))
      .returning();

    // Invalidate cache
    await context.cache?.invalidate(`chatbot:${chatbotId}*`);

    return {
      chatbot: updatedChatbot[0],
      message: 'Chatbot updated successfully',
    };
  }
);

// Example of how to use these handlers in Next.js API routes:
/*
// app/api/chatbots/[chatbotId]/route.ts
import { getChatbotHandler, updateChatbotHandler } from '@/lib/api/examples/chatbot-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  return getChatbotHandler.handle(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  return updateChatbotHandler.handle(request, params);
}
*/