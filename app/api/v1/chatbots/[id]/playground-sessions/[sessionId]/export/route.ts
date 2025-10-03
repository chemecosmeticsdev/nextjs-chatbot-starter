import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';
import { chatbotPlaygroundSessions, chatbotMessages, chatbotInstances } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * GET /api/v1/chatbots/[id]/playground-sessions/[sessionId]/export
 *
 * Export playground session conversation in various formats
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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    if (!['json', 'txt', 'csv'].includes(format)) {
      return NextResponse.json(
        createErrorResponse('Invalid format. Supported formats: json, txt, csv', 'VALIDATION_ERROR'),
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

    // Get chatbot details
    const chatbot = await db
      .select()
      .from(chatbotInstances)
      .where(eq(chatbotInstances.id, chatbotId))
      .limit(1);

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

    const sessionData = {
      session_id: sessionId,
      chatbot_id: chatbotId,
      chatbot_name: chatbot.length ? chatbot[0].name : 'Unknown Chatbot',
      user_id: user.id,
      created_at: session[0].createdAt,
      exported_at: new Date().toISOString(),
      message_count: messages.length,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at?.toISOString() || new Date().toISOString(),
        metadata: msg.metadata,
        vector_search_results: msg.vector_search_results
      }))
    };

    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'json':
        content = JSON.stringify(sessionData, null, 2);
        contentType = 'application/json';
        filename = `conversation-${sessionId}.json`;
        break;

      case 'txt':
        content = generateTextExport(sessionData);
        contentType = 'text/plain';
        filename = `conversation-${sessionId}.txt`;
        break;

      case 'csv':
        content = generateCsvExport(sessionData);
        contentType = 'text/csv';
        filename = `conversation-${sessionId}.csv`;
        break;

      default:
        return NextResponse.json(
          createErrorResponse('Unsupported format', 'VALIDATION_ERROR'),
          { status: 400 }
        );
    }

    // Log export
    console.log(
      `Conversation exported - Session: ${sessionId}, User: ${user.id}, ` +
      `Format: ${format}, Messages: ${messages.length}`
    );

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Error exporting conversation:', error);
    return NextResponse.json(
      createErrorResponse('Failed to export conversation', 'EXPORT_ERROR'),
      { status: 500 }
    );
  }
}

function generateTextExport(sessionData: any): string {
  const lines = [
    `Chatbot Playground Conversation Export`,
    `=====================================`,
    ``,
    `Session ID: ${sessionData.session_id}`,
    `Chatbot: ${sessionData.chatbot_name}`,
    `Created: ${sessionData.created_at}`,
    `Exported: ${sessionData.exported_at}`,
    `Total Messages: ${sessionData.message_count}`,
    ``,
    `Conversation:`,
    `------------`,
    ``
  ];

  sessionData.messages.forEach((msg: any, index: number) => {
    lines.push(`[${index + 1}] ${msg.role.toUpperCase()} (${msg.timestamp})`);
    lines.push(msg.content);
    lines.push('');

    if (msg.metadata?.responseTime) {
      lines.push(`   Response Time: ${msg.metadata.responseTime}ms`);
    }
    if (msg.metadata?.tokenUsage?.total) {
      lines.push(`   Tokens Used: ${msg.metadata.tokenUsage.total}`);
    }
    if (msg.vector_search_results?.length) {
      lines.push(`   Vector Results: ${msg.vector_search_results.length} matches`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

function generateCsvExport(sessionData: any): string {
  const headers = [
    'Message ID',
    'Role',
    'Content',
    'Timestamp',
    'Response Time (ms)',
    'Tokens Used',
    'Vector Results Count'
  ];

  const rows = [headers.join(',')];

  sessionData.messages.forEach((msg: any) => {
    const row = [
      msg.id,
      msg.role,
      `"${msg.content.replace(/"/g, '""')}"`, // Escape quotes in CSV
      msg.timestamp,
      msg.metadata?.responseTime || '',
      msg.metadata?.tokenUsage?.total || '',
      msg.vector_search_results?.length || 0
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}