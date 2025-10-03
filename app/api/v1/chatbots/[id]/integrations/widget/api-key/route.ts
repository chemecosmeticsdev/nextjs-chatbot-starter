import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatbotWidgetConfigs, chatbots } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/middleware/api-auth';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limit';
import crypto from 'crypto';

// POST /api/v1/chatbots/[id]/integrations/widget/api-key
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply middleware
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rateLimitResult = await rateLimitMiddleware(request, 'auth');
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const chatbotId = params.id;
    const userId = authResult.user.id;

    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbots)
      .where(and(
        eq(chatbots.id, chatbotId),
        eq(chatbots.userId, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    // Generate new API key
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const newApiKey = `cb_widget_${chatbotId.substring(0, 8)}_${timestamp}_${randomBytes}`;

    // Update widget configuration with new API key
    const existingConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (existingConfig.length === 0) {
      // Create initial widget configuration with new API key
      const defaultConfig = {
        id: crypto.randomUUID(),
        chatbotId,
        name: 'Website Chat Widget',
        apiKey: newApiKey,
        themeConfig: {
          primary_color: '#3b82f6',
          secondary_color: '#f3f4f6',
          background_color: '#ffffff',
          text_color: '#374151',
          border_radius: 12,
          font_family: 'Inter, sans-serif',
          font_size: 14
        },
        layoutConfig: {
          position: 'bottom-right',
          width: 380,
          height: 500,
          margin: 20,
          bubble_style: 'circle'
        },
        behaviorConfig: {
          greeting_message: 'Hi! How can I help you today?',
          placeholder_text: 'Type your message...',
          auto_open: false,
          auto_open_delay: 3000,
          show_typing_indicator: true,
          sound_enabled: true,
          persistent: true
        },
        securityConfig: {
          allowed_domains: [],
          rate_limit_enabled: true,
          rate_limit_per_minute: 30,
          csrf_protection: true
        },
        brandingConfig: {
          show_powered_by: true,
          bot_name: 'Assistant',
          company_name: ''
        },
        analyticsConfig: {
          track_events: true,
          track_user_behavior: false,
          session_recording: false
        },
        status: 'draft',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.insert(chatbotWidgetConfigs).values(defaultConfig);
    } else {
      // Update existing configuration with new API key
      await db.update(chatbotWidgetConfigs)
        .set({
          apiKey: newApiKey,
          version: (existingConfig[0].version || 1) + 1,
          updatedAt: new Date()
        })
        .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId));
    }

    return NextResponse.json({
      success: true,
      api_key: newApiKey,
      message: 'API key generated successfully',
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating widget API key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/v1/chatbots/[id]/integrations/widget/api-key
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply middleware
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rateLimitResult = await rateLimitMiddleware(request, 'api');
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const chatbotId = params.id;
    const userId = authResult.user.id;

    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbots)
      .where(and(
        eq(chatbots.id, chatbotId),
        eq(chatbots.userId, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    // Get current API key
    const widgetConfig = await db.select({
      apiKey: chatbotWidgetConfigs.apiKey,
      createdAt: chatbotWidgetConfigs.createdAt,
      updatedAt: chatbotWidgetConfigs.updatedAt
    })
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      return NextResponse.json({ error: 'Widget configuration not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      api_key: widgetConfig[0].apiKey,
      created_at: widgetConfig[0].createdAt,
      last_updated: widgetConfig[0].updatedAt
    });

  } catch (error) {
    console.error('Error fetching widget API key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}