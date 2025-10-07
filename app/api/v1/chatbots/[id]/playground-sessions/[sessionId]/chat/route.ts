import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';
import { chatbotPlaygroundSessions, chatbotMessages, chatbotInstances, chatbotConversations } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { claudeAgentService } from '@/lib/agents/claude-agent-service';
import { thaiLanguageProcessor } from '@/lib/services/thai-language-processor';
// Force recompilation after model ID fix

/**
 * POST /api/v1/chatbots/[id]/playground-sessions/[sessionId]/chat
 *
 * Send a chat message in a playground session
 */
export async function POST(
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

    // Parse request body
    let requestData: any;
    try {
      requestData = await request.json();
    } catch (error) {
      return NextResponse.json(
        createErrorResponse('Invalid request body', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const { message, config_override = {}, include_vector_results = false } = requestData;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        createErrorResponse('Message is required', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Verify session exists and belongs to user
    const session = await db
      .select()
      .from(chatbotPlaygroundSessions)
      .where(
        and(
          eq(chatbotPlaygroundSessions.id, sessionId),
          eq(chatbotPlaygroundSessions.chatbotId, chatbotId),
          eq(chatbotPlaygroundSessions.userId, user.userId)
        )
      )
      .limit(1);

    if (!session.length) {
      return NextResponse.json(
        createErrorResponse('Session not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Get chatbot details
    const chatbot = await db
      .select()
      .from(chatbotInstances)
      .where(eq(chatbotInstances.id, chatbotId))
      .limit(1);

    if (!chatbot.length) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    const startTime = Date.now();

    // Ensure conversation record exists for the playground session
    let conversation = await db
      .select()
      .from(chatbotConversations)
      .where(
        and(
          eq(chatbotConversations.chatbotId, chatbotId),
          eq(chatbotConversations.sessionId, sessionId)
        )
      )
      .limit(1);

    let conversationId: string;
    if (!conversation.length) {
      // Create conversation record for playground session
      const [newConversation] = await db
        .insert(chatbotConversations)
        .values({
          chatbotId: chatbotId,
          sessionId: sessionId,
          integrationType: 'api',
          userIdentifier: user.userId,
          metadata: {
            type: 'playground',
            userId: user.userId
          },
          startedAt: new Date(),
          lastActivityAt: new Date(),
        })
        .returning({ id: chatbotConversations.id });
      conversationId = newConversation.id;
    } else {
      conversationId = conversation[0].id;
      // Update last activity
      await db
        .update(chatbotConversations)
        .set({ lastActivityAt: new Date() })
        .where(eq(chatbotConversations.id, conversation[0].id));
    }

    // Save user message
    const userMessageId = randomUUID();
    await db.insert(chatbotMessages).values({
      id: userMessageId,
      conversationId: conversationId,
      role: 'user',
      content: message.trim(),
      metadata: {
        timestamp: new Date().toISOString(),
        user_id: user.userId
      },
      createdAt: new Date(),
    });

    // Process message with Thai language processor
    const processedMessage = thaiLanguageProcessor.processMessage(message.trim());

    // Get conversation history for context
    const conversationHistory = await db
      .select()
      .from(chatbotMessages)
      .where(eq(chatbotMessages.conversationId, conversationId))
      .orderBy(chatbotMessages.createdAt)
      .limit(10); // Get last 10 messages for context

    // Build conversation context
    const conversationContext = {
      chatbotId,
      sessionId,
      userId: user.userId as string,
      conversationHistory: conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: msg.createdAt?.toISOString() || new Date().toISOString(),
      })),
      metadata: {
        language: processedMessage.detectedLanguage.suggestedResponseLanguage,
        businessContext: (processedMessage.context === 'ingredient_inquiry' ? 'cosmetic_ingredients' :
                          processedMessage.context === 'formulation_request' ? 'formulation' :
                          processedMessage.context === 'purchase_order' ? 'purchase_order' : 'general') as 'purchase_order' | 'cosmetic_ingredients' | 'formulation' | 'general',
        extractedTerms: processedMessage.extractedTerms,
      },
    };

    try {
      // Generate AI response using Claude Agent Service
      const agentResponse = await claudeAgentService.processMessage(
        message.trim(),
        conversationContext,
        {
          ...config_override,
          language: processedMessage.detectedLanguage.suggestedResponseLanguage,
          systemPrompt: thaiLanguageProcessor.generateContextualPrompt(
            processedMessage,
            chatbot[0].currentSystemPrompt || claudeAgentService.getConfig().systemPrompt || ''
          ),
        }
      );

      const responseTime = Date.now() - startTime;

      // Save assistant message
      const assistantMessageId = randomUUID();
      await db.insert(chatbotMessages).values({
        id: assistantMessageId,
        conversationId: conversationId,
        role: 'assistant',
        content: agentResponse.content,
        metadata: {
          responseTime: agentResponse.metadata.responseTime,
          tokenUsage: agentResponse.metadata.tokenUsage,
          model: agentResponse.metadata.model,
          temperature: agentResponse.metadata.temperature,
          language: agentResponse.metadata.language,
          businessContext: processedMessage.context,
          extractedTerms: processedMessage.extractedTerms,
          config_override,
          user_id: user.userId
        },
        vectorSearchResults: include_vector_results ? agentResponse.metadata.vectorSearchResults || [] : null,
        createdAt: new Date(),
      });

      // Log interaction
      console.log(
        `Playground chat - Session: ${sessionId}, User: ${user.id}, ` +
        `Response time: ${responseTime}ms, Tokens: ${agentResponse.metadata.tokenUsage.total}, ` +
        `Language: ${agentResponse.metadata.language}, Context: ${processedMessage.context}`
      );

      return NextResponse.json(
        createSuccessResponse({
          response: agentResponse.content,
          response_time: responseTime,
          token_usage: agentResponse.metadata.tokenUsage,
          vector_search_results: include_vector_results ? agentResponse.metadata.vectorSearchResults : undefined,
          model: agentResponse.metadata.model,
          temperature: agentResponse.metadata.temperature,
          language: agentResponse.metadata.language,
          business_context: processedMessage.context,
          extracted_terms: processedMessage.extractedTerms,
          session_id: sessionId,
          message_id: assistantMessageId
        }),
        { status: 200 }
      );

    } catch (agentError) {
      console.error('Error with Claude Agent Service:', agentError);

      // Fallback to a basic response if agent fails
      const fallbackResponse = processedMessage.detectedLanguage.suggestedResponseLanguage === 'th'
        ? 'ขออภัยครับ เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        : 'Sorry, there was an error processing your request. Please try again.';

      const assistantMessageId = randomUUID();
      await db.insert(chatbotMessages).values({
        id: assistantMessageId,
        conversationId: conversationId,
        role: 'assistant',
        content: fallbackResponse,
        metadata: {
          responseTime: Date.now() - startTime,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          model: 'fallback',
          temperature: 0.7,
          language: processedMessage.detectedLanguage.suggestedResponseLanguage,
          error: 'agent_service_failed',
          user_id: user.userId
        },
        createdAt: new Date(),
      });

      return NextResponse.json(
        createSuccessResponse({
          response: fallbackResponse,
          response_time: Date.now() - startTime,
          token_usage: { prompt: 0, completion: 0, total: 0 },
          model: 'fallback',
          temperature: 0.7,
          language: processedMessage.detectedLanguage.suggestedResponseLanguage,
          session_id: sessionId,
          message_id: assistantMessageId,
          warning: 'Used fallback response due to agent service error'
        }),
        { status: 200 }
      );
    }

  } catch (error) {
    console.error('Error processing chat message:', error);
    return NextResponse.json(
      createErrorResponse('Failed to process message', 'PROCESSING_ERROR'),
      { status: 500 }
    );
  }
}