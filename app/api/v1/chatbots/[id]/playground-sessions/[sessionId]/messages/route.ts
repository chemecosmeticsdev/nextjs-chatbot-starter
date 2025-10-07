import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';
import { chatbotPlaygroundSessions, chatbotMessages } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';

/**
 * GET /api/v1/chatbots/[id]/playground-sessions/[sessionId]/messages
 *
 * Get messages from a specific playground session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
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
    const sessionId = params.sessionId;

    // Verify session exists and belongs to user
    const session = await db
      .select()
      .from(chatbotPlaygroundSessions)
      .where(
        and(
          eq(chatbotPlaygroundSessions.id, sessionId),
          eq(chatbotPlaygroundSessions.chatbotId, chatbotId),
          eq(chatbotPlaygroundSessions.userId, user.id)
        )
      )
      .limit(1);

    if (!session.length) {
      return NextResponse.json(
        createErrorResponse('Session not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Get messages for this session
    const messages = await db
      .select({
        id: chatbotMessages.id,
        role: chatbotMessages.role,
        content: chatbotMessages.content,
        metadata: chatbotMessages.metadata,
        vector_search_results: chatbotMessages.vectorSearchResults,
        created_at: chatbotMessages.createdAt,
      })
      .from(chatbotMessages)
      .where(eq(chatbotMessages.conversationId, sessionId))
      .orderBy(chatbotMessages.createdAt);

    // Format messages for frontend
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at?.toISOString() || new Date().toISOString(),
      status: 'sent' as const,
      metadata: {
        responseTime: msg.metadata?.responseTime || 0,
        tokenUsage: msg.metadata?.tokenUsage || { prompt: 0, completion: 0, total: 0 },
        vectorSearchResults: msg.vector_search_results || [],
        model: msg.metadata?.model,
        temperature: msg.metadata?.temperature
      }
    }));

    return NextResponse.json(
      createSuccessResponse({
        messages: formattedMessages,
        session_id: sessionId,
        message_count: formattedMessages.length
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting session messages:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}