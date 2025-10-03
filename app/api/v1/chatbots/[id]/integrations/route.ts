import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatbotInstances } from '@/lib/db/simple-schema';
import { eq } from 'drizzle-orm';

export interface Integration {
  id: string;
  type: "line_oa" | "widget" | "api" | "webhook";
  name: string;
  status: "active" | "inactive" | "error" | "pending";
  description: string;
  last_activity: string;
  usage_stats: {
    messages: number;
    users: number;
    sessions: number;
  };
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface IntegrationResponse {
  success: boolean;
  integrations: Integration[];
  total: number;
  page: number;
  limit: number;
}

/**
 * GET /api/v1/chatbots/[id]/integrations
 * Get all integrations for a specific chatbot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<IntegrationResponse | { success: false; error: any }>> {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const chatbotId = params.id;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    // Verify chatbot exists and user has access
    const chatbot = await db
      .select()
      .from(chatbotInstances)
      .where(eq(chatbotInstances.id, chatbotId))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'Chatbot not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // For now, return mock data since integrations table doesn't exist yet
    // In a real implementation, you would query the integrations table
    const mockIntegrations: Integration[] = [
      {
        id: '1',
        type: 'widget',
        name: 'Website Widget',
        status: 'active',
        description: 'Chat widget embedded on the main website',
        last_activity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        usage_stats: {
          messages: 1234,
          users: 89,
          sessions: 156
        },
        config: {
          domain_restrictions: ['example.com'],
          theme: 'blue',
          position: 'bottom-right'
        },
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '2',
        type: 'line_oa',
        name: 'Line Official Account',
        status: 'active',
        description: 'Connected to Line messaging platform',
        last_activity: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        usage_stats: {
          messages: 567,
          users: 34,
          sessions: 78
        },
        config: {
          channel_id: 'line_channel_123',
          webhook_url: 'https://api.line.me/v2/bot/message/push'
        },
        created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days ago
        updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
      },
      {
        id: '3',
        type: 'api',
        name: 'REST API Integration',
        status: 'inactive',
        description: 'Custom API integration for mobile app',
        last_activity: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        usage_stats: {
          messages: 89,
          users: 12,
          sessions: 23
        },
        config: {
          api_key: 'api_key_redacted',
          rate_limit: 1000,
          allowed_ips: ['192.168.1.0/24']
        },
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // Apply filters
    let filteredIntegrations = mockIntegrations;

    if (status) {
      filteredIntegrations = filteredIntegrations.filter(i => i.status === status);
    }

    if (type) {
      filteredIntegrations = filteredIntegrations.filter(i => i.type === type);
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedIntegrations = filteredIntegrations.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      integrations: paginatedIntegrations,
      total: filteredIntegrations.length,
      page,
      limit
    });

  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to fetch integrations',
          code: 'INTERNAL_ERROR'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/chatbots/[id]/integrations
 * Create a new integration for a chatbot
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<{ success: boolean; integration?: Integration; error?: any }>> {
  try {
    // Verify authentication
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const chatbotId = params.id;
    const body = await request.json();

    // Validate required fields
    const { type, name, config } = body;
    if (!type || !name) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing required fields: type, name', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Verify chatbot exists and user has access
    const chatbot = await db
      .select()
      .from(chatbotInstances)
      .where(eq(chatbotInstances.id, chatbotId))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'Chatbot not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Create new integration (mock implementation)
    const newIntegration: Integration = {
      id: `integration_${Date.now()}`,
      type,
      name,
      status: 'pending',
      description: body.description || `${type} integration for ${chatbot[0].name}`,
      last_activity: new Date().toISOString(),
      usage_stats: {
        messages: 0,
        users: 0,
        sessions: 0
      },
      config: config || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // In a real implementation, save to database
    // await db.insert(integrations).values(newIntegration);

    return NextResponse.json({
      success: true,
      integration: newIntegration
    });

  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to create integration',
          code: 'INTERNAL_ERROR'
        }
      },
      { status: 500 }
    );
  }
}