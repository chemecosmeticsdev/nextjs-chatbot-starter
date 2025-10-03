import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { chatbotWidgetConfigs, chatbotInstances } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/middleware/api-auth';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limit';
import { sanitizeInput } from '@/lib/middleware/sanitize';
import crypto from 'crypto';

const widgetConfigSchema = z.object({
  name: z.string().min(1).max(255),
  api_key: z.string().optional(),
  theme: z.object({
    primary_color: z.string().regex(/^#[0-9A-F]{6}$/i),
    secondary_color: z.string().regex(/^#[0-9A-F]{6}$/i),
    background_color: z.string().regex(/^#[0-9A-F]{6}$/i),
    text_color: z.string().regex(/^#[0-9A-F]{6}$/i),
    border_radius: z.number().min(0).max(50),
    font_family: z.string().min(1),
    font_size: z.number().min(8).max(24)
  }),
  layout: z.object({
    position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
    width: z.number().min(300).max(600),
    height: z.number().min(400).max(800),
    margin: z.number().min(10).max(50),
    bubble_style: z.enum(['circle', 'rounded', 'square'])
  }),
  behavior: z.object({
    greeting_message: z.string().max(500),
    placeholder_text: z.string().max(100),
    auto_open: z.boolean(),
    auto_open_delay: z.number().min(1000).max(30000),
    show_typing_indicator: z.boolean(),
    sound_enabled: z.boolean(),
    persistent: z.boolean()
  }),
  security: z.object({
    allowed_domains: z.array(z.string().url()).max(10),
    rate_limit_enabled: z.boolean(),
    rate_limit_per_minute: z.number().min(1).max(100),
    csrf_protection: z.boolean()
  }),
  branding: z.object({
    show_powered_by: z.boolean(),
    custom_avatar_url: z.string().url().optional().or(z.literal('')),
    bot_name: z.string().min(1).max(50),
    company_name: z.string().max(100).optional()
  }),
  analytics: z.object({
    track_events: z.boolean(),
    track_user_behavior: z.boolean(),
    session_recording: z.boolean()
  }),
  status: z.enum(['active', 'inactive', 'draft'])
});

// GET /api/v1/chatbots/[id]/integrations/widget
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
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    // Get widget configuration
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      return NextResponse.json({ error: 'Widget configuration not found' }, { status: 404 });
    }

    // Generate mock analytics stats for now
    const stats = {
      total_conversations: Math.floor(Math.random() * 1000) + 100,
      unique_visitors: Math.floor(Math.random() * 500) + 50,
      conversion_rate: Math.round((Math.random() * 20 + 5) * 100) / 100,
      average_session_duration: Math.floor(Math.random() * 300) + 60,
      most_active_domain: 'example.com',
      bounce_rate: Math.round((Math.random() * 30 + 20) * 100) / 100
    };

    return NextResponse.json({
      success: true,
      config: widgetConfig[0],
      stats
    });

  } catch (error) {
    console.error('Error fetching widget config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/v1/chatbots/[id]/integrations/widget
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

    const rateLimitResult = await rateLimitMiddleware(request, 'api');
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const chatbotId = params.id;
    const userId = authResult.user.id;

    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);

    const validatedConfig = widgetConfigSchema.parse(sanitizedBody);

    // Generate API key if not provided
    if (!validatedConfig.api_key) {
      validatedConfig.api_key = `cb_widget_${chatbotId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Update or insert widget configuration
    const existingConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    const configData = {
      chatbotId,
      name: validatedConfig.name,
      apiKey: validatedConfig.api_key,
      themeConfig: validatedConfig.theme,
      layoutConfig: validatedConfig.layout,
      behaviorConfig: validatedConfig.behavior,
      securityConfig: validatedConfig.security,
      brandingConfig: validatedConfig.branding,
      analyticsConfig: validatedConfig.analytics,
      status: validatedConfig.status,
      version: existingConfig.length > 0 ? (existingConfig[0].version || 1) + 1 : 1,
      updatedAt: new Date()
    };

    let result;
    if (existingConfig.length > 0) {
      // Update existing configuration
      result = await db.update(chatbotWidgetConfigs)
        .set(configData)
        .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
        .returning();
    } else {
      // Create new configuration
      result = await db.insert(chatbotWidgetConfigs)
        .values({
          ...configData,
          id: crypto.randomUUID(),
          createdAt: new Date()
        })
        .returning();
    }

    return NextResponse.json({
      success: true,
      config: result[0],
      message: existingConfig.length > 0 ? 'Widget configuration updated' : 'Widget configuration created'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error saving widget config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/v1/chatbots/[id]/integrations/widget
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return POST(request, { params });
}

// DELETE /api/v1/chatbots/[id]/integrations/widget
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply middleware
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const chatbotId = params.id;
    const userId = authResult.user.id;

    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    // Delete widget configuration
    const result = await db.delete(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: 'Widget configuration not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Widget configuration deleted'
    });

  } catch (error) {
    console.error('Error deleting widget config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}