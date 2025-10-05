import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, CommonSchemas, ErrorCodes, ApiError, type ApiContext } from '../handler';
import { db } from '@/lib/db';
import { chatbotConversations, chatbotMessages, chatbots } from '@/lib/db/schema';
import { eq, desc, and, sql, count } from 'drizzle-orm';

// GET /api/chatbots/[chatbotId]/conversations
export const getConversationsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        ...CommonSchemas.pagination.shape,
        status: z.enum(['active', 'completed', 'archived']).optional(),
        search: z.string().min(1).max(100).optional(),
        sortBy: z.enum(['createdAt', 'updatedAt', 'messageCount']).default('updatedAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 60, // 1 minute for frequently changing data
      keyGenerator: (request, context) => {
        const query = context.validatedQuery;
        return `conversations:${context.validatedParams.chatbotId}:${JSON.stringify(query)}`;
      },
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 100, // 100 requests per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { page, limit, status, search, sortBy, sortOrder } = context.validatedQuery;

    // Verify chatbot exists and user has access
    const chatbot = await db
      .select({ id: chatbots.id })
      .from(chatbots)
      .where(eq(chatbots.id, chatbotId))
      .limit(1);

    if (chatbot.length === 0) {
      throw new ApiError(
        ErrorCodes.CHATBOT_NOT_FOUND,
        `Chatbot with ID ${chatbotId} not found`
      );
    }

    // Build query conditions
    const conditions = [eq(chatbotConversations.chatbotId, chatbotId)];

    if (status) {
      conditions.push(eq(chatbotConversations.status, status));
    }

    if (search) {
      conditions.push(
        sql`${chatbotConversations.title} ILIKE ${`%${search}%`}`
      );
    }

    // Get total count for pagination
    const [totalResult] = await db
      .select({ total: count() })
      .from(chatbotConversations)
      .where(and(...conditions));

    const total = totalResult.total;

    // Calculate pagination
    const offset = (page - 1) * limit;
    const hasMore = offset + limit < total;

    // Get conversations with message count
    const conversations = await db
      .select({
        id: chatbotConversations.id,
        title: chatbotConversations.title,
        status: chatbotConversations.status,
        createdAt: chatbotConversations.createdAt,
        updatedAt: chatbotConversations.updatedAt,
        messageCount: sql<number>`COUNT(${chatbotMessages.id})`,
        lastMessageAt: sql<Date>`MAX(${chatbotMessages.createdAt})`,
      })
      .from(chatbotConversations)
      .leftJoin(
        chatbotMessages,
        eq(chatbotMessages.conversationId, chatbotConversations.id)
      )
      .where(and(...conditions))
      .groupBy(chatbotConversations.id)
      .orderBy(
        sortOrder === 'desc'
          ? desc(chatbotConversations[sortBy])
          : chatbotConversations[sortBy]
      )
      .limit(limit)
      .offset(offset);

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        hasMore,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
);

// POST /api/chatbots/[chatbotId]/conversations
export const createConversationHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      params: CommonSchemas.chatbotId,
      body: z.object({
        title: z.string().min(1).max(200).optional(),
        initialMessage: z.string().min(1).max(4000),
        metadata: z.record(z.any()).optional(),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 20, // 20 conversation creations per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { title, initialMessage, metadata } = context.validatedBody;

    // Verify chatbot exists and user has access
    const chatbot = await db
      .select({ id: chatbots.id, model: chatbots.model })
      .from(chatbots)
      .where(eq(chatbots.id, chatbotId))
      .limit(1);

    if (chatbot.length === 0) {
      throw new ApiError(
        ErrorCodes.CHATBOT_NOT_FOUND,
        `Chatbot with ID ${chatbotId} not found`
      );
    }

    // Create conversation in transaction
    const result = await db.transaction(async (tx) => {
      // Create conversation
      const [conversation] = await tx
        .insert(chatbotConversations)
        .values({
          id: crypto.randomUUID(),
          chatbotId,
          title: title || `Conversation ${new Date().toISOString()}`,
          status: 'active',
          metadata: metadata ? JSON.stringify(metadata) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create initial user message
      const [userMessage] = await tx
        .insert(chatbotMessages)
        .values({
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          role: 'user',
          content: initialMessage,
          createdAt: new Date(),
        })
        .returning();

      return { conversation, userMessage };
    });

    // TODO: Queue AI response generation
    // await queueAIResponse(result.conversation.id, chatbot[0].model);

    return {
      conversation: result.conversation,
      message: 'Conversation created successfully',
    };
  }
);

// GET /api/conversations/[conversationId]/messages
export const getMessagesHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.conversationId,
      query: z.object({
        ...CommonSchemas.pagination.shape,
        role: z.enum(['user', 'assistant', 'system']).optional(),
        since: z.string().datetime().optional(),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 30, // 30 seconds for frequently changing data
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 200, // 200 requests per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { conversationId } = context.validatedParams;
    const { page, limit, role, since } = context.validatedQuery;

    // Verify conversation exists and user has access
    const conversation = await db
      .select({
        id: chatbotConversations.id,
        chatbotId: chatbotConversations.chatbotId,
      })
      .from(chatbotConversations)
      .where(eq(chatbotConversations.id, conversationId))
      .limit(1);

    if (conversation.length === 0) {
      throw new ApiError(
        ErrorCodes.CONVERSATION_NOT_FOUND,
        `Conversation with ID ${conversationId} not found`
      );
    }

    // Build query conditions
    const conditions = [eq(chatbotMessages.conversationId, conversationId)];

    if (role) {
      conditions.push(eq(chatbotMessages.role, role));
    }

    if (since) {
      conditions.push(sql`${chatbotMessages.createdAt} > ${new Date(since)}`);
    }

    // Get total count
    const [totalResult] = await db
      .select({ total: count() })
      .from(chatbotMessages)
      .where(and(...conditions));

    const total = totalResult.total;

    // Calculate pagination
    const offset = (page - 1) * limit;
    const hasMore = offset + limit < total;

    // Get messages
    const messages = await db
      .select({
        id: chatbotMessages.id,
        role: chatbotMessages.role,
        content: chatbotMessages.content,
        metadata: chatbotMessages.metadata,
        createdAt: chatbotMessages.createdAt,
      })
      .from(chatbotMessages)
      .where(and(...conditions))
      .orderBy(desc(chatbotMessages.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      messages: messages.reverse(), // Reverse to show chronological order
      pagination: {
        page,
        limit,
        total,
        hasMore,
        totalPages: Math.ceil(total / limit),
      },
      conversation: {
        id: conversation[0].id,
        chatbotId: conversation[0].chatbotId,
      },
    };
  }
);

// POST /api/conversations/[conversationId]/messages
export const sendMessageHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      params: CommonSchemas.conversationId,
      body: z.object({
        content: z.string().min(1).max(4000),
        role: z.enum(['user', 'system']).default('user'),
        metadata: z.record(z.any()).optional(),
      }),
    },
    auth: {
      required: true,
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 60, // 60 messages per minute
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { conversationId } = context.validatedParams;
    const { content, role, metadata } = context.validatedBody;

    // Verify conversation exists and is active
    const conversation = await db
      .select({
        id: chatbotConversations.id,
        chatbotId: chatbotConversations.chatbotId,
        status: chatbotConversations.status,
      })
      .from(chatbotConversations)
      .where(eq(chatbotConversations.id, conversationId))
      .limit(1);

    if (conversation.length === 0) {
      throw new ApiError(
        ErrorCodes.CONVERSATION_NOT_FOUND,
        `Conversation with ID ${conversationId} not found`
      );
    }

    if (conversation[0].status !== 'active') {
      throw new ApiError(
        ErrorCodes.INVALID_REQUEST,
        'Cannot send messages to inactive conversation'
      );
    }

    // Create message
    const [message] = await db
      .insert(chatbotMessages)
      .values({
        id: crypto.randomUUID(),
        conversationId,
        role,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: new Date(),
      })
      .returning();

    // Update conversation timestamp
    await db
      .update(chatbotConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatbotConversations.id, conversationId));

    // TODO: Queue AI response if this was a user message
    // if (role === 'user') {
    //   await queueAIResponse(conversationId, conversation[0].chatbotId);
    // }

    return {
      message,
      conversation: conversation[0],
    };
  }
);

// Example of how to use these handlers in Next.js API routes:
/*
// app/api/chatbots/[chatbotId]/conversations/route.ts
import { getConversationsHandler, createConversationHandler } from '@/lib/api/examples/conversation-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  return getConversationsHandler.handle(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  return createConversationHandler.handle(request, params);
}
*/