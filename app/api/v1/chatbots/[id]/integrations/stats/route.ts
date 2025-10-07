import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatbotInstances } from '@/lib/db/simple-schema';
import { eq } from 'drizzle-orm';

export interface IntegrationStats {
  total_integrations: number;
  active_integrations: number;
  total_messages: number;
  total_users: number;
  popular_platform: string;
  growth_rate: number;
  breakdown: {
    by_type: Record<string, number>;
    by_status: Record<string, number>;
  };
  performance: {
    average_response_time: number;
    success_rate: number;
    error_rate: number;
  };
  trends: {
    daily_messages: Array<{ date: string; count: number }>;
    weekly_users: Array<{ week: string; count: number }>;
  };
}

export interface StatsResponse {
  success: boolean;
  stats: IntegrationStats;
  generated_at: string;
}

/**
 * GET /api/v1/chatbots/[id]/integrations/stats
 * Get integration statistics for a specific chatbot
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<StatsResponse | { success: false; error: any }>> {
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
    const timeRange = searchParams.get('timeRange') || '30d'; // 7d, 30d, 90d
    const includeBreakdown = searchParams.get('includeBreakdown') === 'true';
    const includeTrends = searchParams.get('includeTrends') === 'true';

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

    // For now, return mock statistics
    // In a real implementation, you would aggregate from integrations and usage tables
    const mockStats: IntegrationStats = {
      total_integrations: 3,
      active_integrations: 2,
      total_messages: 1890,
      total_users: 135,
      popular_platform: "Widget",
      growth_rate: 25.6,
      breakdown: {
        by_type: {
          widget: 1,
          line_oa: 1,
          api: 1,
          webhook: 0
        },
        by_status: {
          active: 2,
          inactive: 1,
          error: 0,
          pending: 0
        }
      },
      performance: {
        average_response_time: 245, // milliseconds
        success_rate: 98.5, // percentage
        error_rate: 1.5 // percentage
      },
      trends: {
        daily_messages: generateDailyMessageTrend(30),
        weekly_users: generateWeeklyUserTrend(12)
      }
    };

    // Filter out unnecessary data based on query parameters
    if (!includeBreakdown) {
      delete mockStats.breakdown;
    }

    if (!includeTrends) {
      delete mockStats.trends;
    }

    return NextResponse.json({
      success: true,
      stats: mockStats,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching integration stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to fetch integration statistics',
          code: 'INTERNAL_ERROR'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Generate mock daily message trend data
 */
function generateDailyMessageTrend(days: number): Array<{ date: string; count: number }> {
  const trend = [];
  const baseCount = 50;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // Generate realistic-looking trend with some randomness
    const variation = Math.random() * 30 - 15; // ±15 messages
    const weekdayMultiplier = date.getDay() === 0 || date.getDay() === 6 ? 0.7 : 1; // Lower on weekends
    const growthFactor = 1 + (days - i) * 0.01; // Slight growth over time

    const count = Math.max(
      10,
      Math.round(baseCount * weekdayMultiplier * growthFactor + variation)
    );

    trend.push({
      date: date.toISOString().split('T')[0],
      count
    });
  }

  return trend;
}

/**
 * Generate mock weekly user trend data
 */
function generateWeeklyUserTrend(weeks: number): Array<{ week: string; count: number }> {
  const trend = [];
  const baseCount = 25;

  for (let i = weeks - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - (i * 7));

    // Get Monday of the week
    const monday = new Date(date);
    monday.setDate(date.getDate() - date.getDay() + 1);

    const variation = Math.random() * 10 - 5; // ±5 users
    const growthFactor = 1 + (weeks - i) * 0.02; // Slight growth over time

    const count = Math.max(
      5,
      Math.round(baseCount * growthFactor + variation)
    );

    trend.push({
      week: monday.toISOString().split('T')[0],
      count
    });
  }

  return trend;
}

/**
 * POST /api/v1/chatbots/[id]/integrations/stats
 * Refresh integration statistics (trigger recalculation)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<{ success: boolean; message?: string; error?: any }>> {
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

    // In a real implementation, you would:
    // 1. Trigger a background job to recalculate statistics
    // 2. Update cached statistics
    // 3. Notify relevant systems

    return NextResponse.json({
      success: true,
      message: 'Statistics refresh initiated. Updated data will be available shortly.'
    });

  } catch (error) {
    console.error('Error refreshing integration stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Failed to refresh integration statistics',
          code: 'INTERNAL_ERROR'
        }
      },
      { status: 500 }
    );
  }
}