import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatbotWidgetConfigs, chatbots } from '@/lib/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/middleware/api-auth';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limit';

// GET /api/v1/chatbots/[id]/integrations/widget/analytics
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
    const url = new URL(request.url);

    // Parse query parameters
    const timeRange = url.searchParams.get('range') || '7d'; // 1d, 7d, 30d, 90d
    const metrics = url.searchParams.get('metrics')?.split(',') || ['all'];

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

    // Verify widget configuration exists
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      return NextResponse.json({ error: 'Widget configuration not found' }, { status: 404 });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '1d':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    // Generate mock analytics data (in a real implementation, this would query actual analytics tables)
    const generateMockData = (days: number) => {
      const data = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        data.push({
          date: date.toISOString().split('T')[0],
          conversations: Math.floor(Math.random() * 50) + 10,
          unique_visitors: Math.floor(Math.random() * 100) + 20,
          messages: Math.floor(Math.random() * 200) + 50,
          avg_response_time: Math.round((Math.random() * 2000 + 500) * 100) / 100,
          satisfaction_score: Math.round((Math.random() * 2 + 3) * 100) / 100,
          bounce_rate: Math.round((Math.random() * 30 + 20) * 100) / 100,
          conversion_rate: Math.round((Math.random() * 15 + 5) * 100) / 100
        });
      }
      return data;
    };

    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dailyData = generateMockData(days);

    // Calculate summary metrics
    const summary = {
      total_conversations: dailyData.reduce((sum, day) => sum + day.conversations, 0),
      total_unique_visitors: dailyData.reduce((sum, day) => sum + day.unique_visitors, 0),
      total_messages: dailyData.reduce((sum, day) => sum + day.messages, 0),
      avg_response_time: Math.round(dailyData.reduce((sum, day) => sum + day.avg_response_time, 0) / dailyData.length),
      avg_satisfaction: Math.round((dailyData.reduce((sum, day) => sum + day.satisfaction_score, 0) / dailyData.length) * 100) / 100,
      avg_bounce_rate: Math.round((dailyData.reduce((sum, day) => sum + day.bounce_rate, 0) / dailyData.length) * 100) / 100,
      avg_conversion_rate: Math.round((dailyData.reduce((sum, day) => sum + day.conversion_rate, 0) / dailyData.length) * 100) / 100
    };

    // Popular domains and pages (mock data)
    const topDomains = [
      { domain: 'example.com', conversations: Math.floor(Math.random() * 100) + 20, percentage: 45.2 },
      { domain: 'shop.example.com', conversations: Math.floor(Math.random() * 80) + 15, percentage: 28.7 },
      { domain: 'blog.example.com', conversations: Math.floor(Math.random() * 60) + 10, percentage: 16.3 },
      { domain: 'support.example.com', conversations: Math.floor(Math.random() * 40) + 5, percentage: 9.8 }
    ];

    const topPages = [
      { page: '/products', conversations: Math.floor(Math.random() * 80) + 15, percentage: 32.1 },
      { page: '/pricing', conversations: Math.floor(Math.random() * 60) + 12, percentage: 24.5 },
      { page: '/contact', conversations: Math.floor(Math.random() * 50) + 10, percentage: 18.7 },
      { page: '/support', conversations: Math.floor(Math.random() * 45) + 8, percentage: 15.2 },
      { page: '/about', conversations: Math.floor(Math.random() * 30) + 5, percentage: 9.5 }
    ];

    // Real-time metrics (mock data)
    const realTimeMetrics = {
      active_sessions: Math.floor(Math.random() * 25) + 5,
      messages_last_hour: Math.floor(Math.random() * 150) + 30,
      response_time_last_hour: Math.round((Math.random() * 1000 + 800) * 100) / 100,
      online_status: 'healthy',
      widget_loads_last_hour: Math.floor(Math.random() * 300) + 100
    };

    // User behavior patterns (mock data)
    const userBehavior = {
      most_active_hours: [
        { hour: 9, conversations: 45 },
        { hour: 10, conversations: 62 },
        { hour: 11, conversations: 58 },
        { hour: 14, conversations: 71 },
        { hour: 15, conversations: 69 },
        { hour: 16, conversations: 53 }
      ],
      device_breakdown: {
        desktop: 58.3,
        mobile: 35.2,
        tablet: 6.5
      },
      browser_breakdown: {
        chrome: 65.2,
        safari: 18.7,
        firefox: 8.9,
        edge: 5.1,
        other: 2.1
      }
    };

    return NextResponse.json({
      success: true,
      data: {
        timeRange,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary,
        dailyData,
        topDomains,
        topPages,
        realTimeMetrics,
        userBehavior,
        widgetConfig: {
          status: widgetConfig[0].status,
          version: widgetConfig[0].version,
          lastUpdated: widgetConfig[0].updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error fetching widget analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/v1/chatbots/[id]/integrations/widget/analytics
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // This endpoint would be called by the widget to track events
    const body = await request.json();
    const { event_type, event_data, user_id, session_id, domain, page_url } = body;

    // Apply basic rate limiting for analytics events
    const rateLimitResult = await rateLimitMiddleware(request, 'public');
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const chatbotId = params.id;

    // Verify widget configuration exists
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      return NextResponse.json({ error: 'Widget not found' }, { status: 404 });
    }

    // Check if analytics tracking is enabled
    const analyticsConfig = widgetConfig[0].analyticsConfig as any;
    if (!analyticsConfig?.track_events) {
      return NextResponse.json({ success: true, message: 'Analytics tracking disabled' });
    }

    // In a real implementation, store the analytics event in the database
    // For now, just return success
    console.log('Widget analytics event:', {
      chatbotId,
      event_type,
      event_data,
      user_id,
      session_id,
      domain,
      page_url,
      timestamp: new Date()
    });

    return NextResponse.json({
      success: true,
      message: 'Analytics event recorded'
    });

  } catch (error) {
    console.error('Error recording widget analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}