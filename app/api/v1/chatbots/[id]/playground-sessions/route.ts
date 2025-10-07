import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';
import { chatbotPlaygroundSessions, chatbotMessages, chatbotConversations } from '@/lib/db/schema';
import { and, eq, desc, count, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * GET /api/v1/chatbots/[id]/playground-sessions
 *
 * List playground sessions for a chatbot
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

    const chatbotId = params.id;

    // Get playground sessions for this chatbot
    const sessions = await db
      .select({
        id: chatbotPlaygroundSessions.id,
        chatbot_id: chatbotPlaygroundSessions.chatbotId,
        session_config: chatbotPlaygroundSessions.sessionConfig,
        is_active: chatbotPlaygroundSessions.isActive,
        created_at: chatbotPlaygroundSessions.createdAt,
        ended_at: chatbotPlaygroundSessions.endedAt,
      })
      .from(chatbotPlaygroundSessions)
      .where(
        and(
          eq(chatbotPlaygroundSessions.chatbotId, chatbotId),
          eq(chatbotPlaygroundSessions.userId, user.userId)
        )
      )
      .orderBy(desc(chatbotPlaygroundSessions.createdAt))
      .limit(50);

    // Get message counts for each session by finding conversations linked to sessions
    const sessionIds = sessions.map(s => s.id);
    let messageCountMap: { [key: string]: number } = {};

    if (sessionIds.length > 0) {
      try {
        // First get conversations for these sessions
        const conversations = await db
          .select({
            id: chatbotConversations.id,
            sessionId: chatbotConversations.sessionId
          })
          .from(chatbotConversations)
          .where(inArray(chatbotConversations.sessionId, sessionIds));

        if (conversations.length > 0) {
          const conversationIds = conversations.map(c => c.id);

          // Only query if we have conversation IDs to avoid parameter binding errors
          if (conversationIds.length > 0) {
            // Get message counts for these conversations
            const messageCounts = await db
              .select({
                conversationId: chatbotMessages.conversationId,
                messageCount: count(chatbotMessages.id).as('message_count')
              })
              .from(chatbotMessages)
              .where(inArray(chatbotMessages.conversationId, conversationIds))
              .groupBy(chatbotMessages.conversationId);

            // Map conversation counts back to session IDs
            const conversationToSessionMap = Object.fromEntries(
              conversations.map(c => [c.id, c.sessionId])
            );

            messageCounts.forEach(({ conversationId, messageCount }) => {
              const sessionId = conversationToSessionMap[conversationId];
              if (sessionId) {
                messageCountMap[sessionId] = (messageCountMap[sessionId] || 0) + Number(messageCount);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error fetching message counts:', error);
        messageCountMap = {};
      }
    }

    // Format sessions with additional data
    const formattedSessions = sessions.map(session => {
      const messageCount = messageCountMap[session.id] || 0;
      const lastMessage = messageCount > 0 ? 'Conversation started' : 'No messages';

      return {
        id: session.id,
        name: `Session ${new Date(session.created_at || '').toLocaleString()}`,
        created_at: session.created_at,
        message_count: messageCount,
        last_message: lastMessage,
        is_active: session.is_active,
        config: session.session_config
      };
    });

    return NextResponse.json(
      createSuccessResponse({
        sessions: formattedSessions
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error listing playground sessions:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/chatbots/[id]/playground-sessions
 *
 * Create a new playground session
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

    const chatbotId = params.id;

    // Parse request body
    let requestData: any = {};
    try {
      const rawBody = await request.json();
      requestData = rawBody;
    } catch (error) {
      // Default empty config if no body provided
    }

    const sessionId = randomUUID();

    // Create new playground session
    const [newSession] = await db
      .insert(chatbotPlaygroundSessions)
      .values({
        id: sessionId,
        chatbotId: chatbotId,
        userId: user.userId,
        sessionConfig: requestData.config_override || {},
        isActive: true,
        createdAt: new Date(),
      })
      .returning({
        id: chatbotPlaygroundSessions.id,
        chatbot_id: chatbotPlaygroundSessions.chatbotId,
        session_config: chatbotPlaygroundSessions.sessionConfig,
        is_active: chatbotPlaygroundSessions.isActive,
        created_at: chatbotPlaygroundSessions.createdAt,
      });

    // Log session creation
    console.log(
      `Playground session created - ID: ${sessionId}, User: ${user.userId}, ` +
      `Chatbot: ${chatbotId}`
    );

    return NextResponse.json(
      createSuccessResponse({
        id: newSession.id,
        name: requestData.name || `Session ${new Date().toLocaleString()}`,
        created_at: newSession.created_at,
        message_count: 0,
        last_message: '',
        is_active: newSession.is_active,
        config: newSession.session_config
      }),
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating playground session:', error);
    return NextResponse.json(
      createErrorResponse('Failed to create playground session', 'CREATION_FAILED'),
      { status: 500 }
    );
  }
}