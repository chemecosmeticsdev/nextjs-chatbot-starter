import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, CommonSchemas, ErrorCodes, ApiError, type ApiContext } from '../handler';
import { db } from '@/lib/db';
import {
  chatbotHourlyAnalytics,
  chatbotWeeklyAnalytics,
  chatbotMonthlyAnalytics,
  realtimeDashboardCache,
  userBehaviorAnalytics,
  performanceMetrics
} from '@/lib/db/analytics-schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { cache, CacheKeys } from '@/lib/services/cache-service';

// GET /api/dashboard/[chatbotId]/realtime
export const getRealtimeDashboardHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 30, // 30 seconds for real-time data
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 120, // 120 requests per minute for real-time dashboard
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;

    try {
      // First try to get from Redis cache
      const cacheKey = CacheKeys.realtimeMetrics(chatbotId);
      const cachedData = await cache.get(cacheKey);

      if (cachedData) {
        return {
          dashboard: cachedData,
          source: 'cache',
          lastUpdated: cachedData.lastUpdated
        };
      }

      // Fall back to database
      const dashboardData = await db
        .select()
        .from(realtimeDashboardCache)
        .where(eq(realtimeDashboardCache.chatbotId, chatbotId))
        .limit(1);

      if (dashboardData.length === 0) {
        throw new ApiError(
          ErrorCodes.NOT_FOUND,
          'Real-time dashboard data not available yet'
        );
      }

      return {
        dashboard: dashboardData[0],
        source: 'database',
        lastUpdated: dashboardData[0].lastUpdated
      };

    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch real-time dashboard: ${error.message}`
      );
    }
  }
);

// GET /api/dashboard/[chatbotId]/hourly
export const getHourlyAnalyticsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        hours: z.coerce.number().min(1).max(168).default(24), // Max 1 week
        metric: z.enum(['conversations', 'messages', 'users', 'performance']).optional(),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 300, // 5 minutes for hourly data
    },
    rateLimit: {
      windowMs: 60000,
      max: 60,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { hours, metric } = context.validatedQuery;

    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      const hourlyData = await db
        .select()
        .from(chatbotHourlyAnalytics)
        .where(
          and(
            eq(chatbotHourlyAnalytics.chatbotId, chatbotId),
            gte(chatbotHourlyAnalytics.hourTimestamp, startTime),
            lte(chatbotHourlyAnalytics.hourTimestamp, endTime)
          )
        )
        .orderBy(chatbotHourlyAnalytics.hourTimestamp);

      // Format data based on requested metric
      const formattedData = metric ? this.formatMetricData(hourlyData, metric) : hourlyData;

      // Calculate summary statistics
      const summary = this.calculateHourlySummary(hourlyData);

      return {
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          hours
        },
        data: formattedData,
        summary,
        dataPoints: hourlyData.length
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch hourly analytics: ${error.message}`
      );
    }
  }
);

// GET /api/dashboard/[chatbotId]/weekly
export const getWeeklyAnalyticsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        weeks: z.coerce.number().min(1).max(52).default(12), // Max 1 year
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 3600, // 1 hour for weekly data
    },
    rateLimit: {
      windowMs: 60000,
      max: 30,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { weeks } = context.validatedQuery;

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

      const weeklyData = await db
        .select()
        .from(chatbotWeeklyAnalytics)
        .where(
          and(
            eq(chatbotWeeklyAnalytics.chatbotId, chatbotId),
            gte(chatbotWeeklyAnalytics.weekStart, startDate)
          )
        )
        .orderBy(chatbotWeeklyAnalytics.weekStart);

      // Calculate trends
      const trends = this.calculateWeeklyTrends(weeklyData);

      return {
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          weeks
        },
        data: weeklyData,
        trends,
        dataPoints: weeklyData.length
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch weekly analytics: ${error.message}`
      );
    }
  }
);

// GET /api/dashboard/[chatbotId]/monthly
export const getMonthlyAnalyticsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        months: z.coerce.number().min(1).max(24).default(6), // Max 2 years
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 7200, // 2 hours for monthly data
    },
    rateLimit: {
      windowMs: 60000,
      max: 20,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { months } = context.validatedQuery;

    try {
      // Get monthly data for the specified period
      const monthlyData = await db
        .select()
        .from(chatbotMonthlyAnalytics)
        .where(eq(chatbotMonthlyAnalytics.chatbotId, chatbotId))
        .orderBy(desc(chatbotMonthlyAnalytics.monthStart))
        .limit(months);

      // Calculate business metrics
      const businessMetrics = this.calculateBusinessMetrics(monthlyData);

      return {
        data: monthlyData.reverse(), // Chronological order
        businessMetrics,
        dataPoints: monthlyData.length
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch monthly analytics: ${error.message}`
      );
    }
  }
);

// GET /api/dashboard/[chatbotId]/performance
export const getPerformanceMetricsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        timeRange: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
        granularity: z.enum(['hour', 'day']).default('hour'),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 300, // 5 minutes for performance data
    },
    rateLimit: {
      windowMs: 60000,
      max: 60,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { timeRange, granularity } = context.validatedQuery;

    try {
      const endTime = new Date();
      const startTime = this.getStartTimeFromRange(timeRange, endTime);

      const performanceData = await db
        .select()
        .from(performanceMetrics)
        .where(
          and(
            eq(performanceMetrics.chatbotId, chatbotId),
            eq(performanceMetrics.granularity, granularity),
            gte(performanceMetrics.metricTimestamp, startTime),
            lte(performanceMetrics.metricTimestamp, endTime)
          )
        )
        .orderBy(performanceMetrics.metricTimestamp);

      // Calculate performance insights
      const insights = this.calculatePerformanceInsights(performanceData);

      return {
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          range: timeRange
        },
        granularity,
        data: performanceData,
        insights,
        dataPoints: performanceData.length
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch performance metrics: ${error.message}`
      );
    }
  }
);

// GET /api/dashboard/[chatbotId]/user-behavior
export const getUserBehaviorHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        days: z.coerce.number().min(1).max(90).default(30),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 1800, // 30 minutes for user behavior data
    },
    rateLimit: {
      windowMs: 60000,
      max: 30,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { days } = context.validatedQuery;

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const behaviorData = await db
        .select()
        .from(userBehaviorAnalytics)
        .where(
          and(
            eq(userBehaviorAnalytics.chatbotId, chatbotId),
            gte(userBehaviorAnalytics.date, startDateStr),
            lte(userBehaviorAnalytics.date, endDateStr)
          )
        )
        .orderBy(userBehaviorAnalytics.date);

      // Analyze behavior patterns
      const patterns = this.analyzeBehaviorPatterns(behaviorData);

      return {
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days
        },
        data: behaviorData,
        patterns,
        dataPoints: behaviorData.length
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch user behavior data: ${error.message}`
      );
    }
  }
);

// Helper methods for data processing
function formatMetricData(data: any[], metric: string) {
  return data.map(item => ({
    timestamp: item.hourTimestamp,
    value: getMetricValue(item, metric)
  }));
}

function getMetricValue(item: any, metric: string): number {
  switch (metric) {
    case 'conversations':
      return item.newConversations;
    case 'messages':
      return item.totalMessages;
    case 'users':
      return item.uniqueUsers;
    case 'performance':
      return item.avgResponseTimeMs;
    default:
      return item.totalMessages;
  }
}

function calculateHourlySummary(data: any[]) {
  if (data.length === 0) return null;

  const totals = data.reduce((acc, item) => ({
    conversations: acc.conversations + item.newConversations,
    messages: acc.messages + item.totalMessages,
    users: acc.users + item.uniqueUsers,
    errors: acc.errors + item.errorCount
  }), { conversations: 0, messages: 0, users: 0, errors: 0 });

  const avgResponseTime = data.reduce((acc, item) => acc + item.avgResponseTimeMs, 0) / data.length;

  return {
    totals,
    averages: {
      responseTimeMs: Math.round(avgResponseTime),
      conversationsPerHour: Math.round(totals.conversations / data.length),
      messagesPerHour: Math.round(totals.messages / data.length)
    }
  };
}

function calculateWeeklyTrends(data: any[]) {
  if (data.length < 2) return null;

  const latest = data[data.length - 1];
  const previous = data[data.length - 2];

  return {
    conversations: {
      current: latest.totalConversations,
      previous: previous.totalConversations,
      change: latest.conversationGrowthPercent
    },
    users: {
      current: latest.totalUsers,
      previous: previous.totalUsers,
      change: latest.userGrowthPercent
    },
    responseTime: {
      current: latest.avgResponseTimeMs,
      previous: previous.avgResponseTimeMs,
      change: ((latest.avgResponseTimeMs - previous.avgResponseTimeMs) / previous.avgResponseTimeMs * 100).toFixed(2)
    }
  };
}

function calculateBusinessMetrics(data: any[]) {
  if (data.length === 0) return null;

  const totalCost = data.reduce((acc, item) => acc + Number(item.estimatedCostUsd), 0);
  const totalConversations = data.reduce((acc, item) => acc + item.totalConversations, 0);
  const totalUsers = data.reduce((acc, item) => acc + item.uniqueUsers, 0);

  return {
    totalCost: totalCost.toFixed(2),
    costPerConversation: totalConversations > 0 ? (totalCost / totalConversations).toFixed(4) : '0',
    avgRetentionRate: (data.reduce((acc, item) => acc + Number(item.userRetentionRate), 0) / data.length).toFixed(2),
    avgMessagesPerConversation: (data.reduce((acc, item) => acc + Number(item.avgMessagesPerConversation), 0) / data.length).toFixed(2)
  };
}

function calculatePerformanceInsights(data: any[]) {
  if (data.length === 0) return null;

  const responseTimes = data.map(item => item.avgResponseTimeMs);
  const errorRates = data.map(item => Number(item.errorRate));

  return {
    avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
    maxResponseTime: Math.max(...responseTimes),
    avgErrorRate: (errorRates.reduce((a, b) => a + b, 0) / errorRates.length).toFixed(4),
    trending: {
      responseTime: responseTimes.length >= 2 ?
        (responseTimes[responseTimes.length - 1] > responseTimes[0] ? 'up' : 'down') : 'stable',
      errorRate: errorRates.length >= 2 ?
        (errorRates[errorRates.length - 1] > errorRates[0] ? 'up' : 'down') : 'stable'
    }
  };
}

function analyzeBehaviorPatterns(data: any[]) {
  if (data.length === 0) return null;

  const totalConversations = data.reduce((acc, item) =>
    acc + item.shortConversations + item.mediumConversations + item.longConversations, 0);

  const conversationLengthDistribution = {
    short: data.reduce((acc, item) => acc + item.shortConversations, 0),
    medium: data.reduce((acc, item) => acc + item.mediumConversations, 0),
    long: data.reduce((acc, item) => acc + item.longConversations, 0)
  };

  return {
    conversationLengthDistribution,
    avgSatisfactionScore: (data.reduce((acc, item) => acc + Number(item.avgSatisfactionScore), 0) / data.length).toFixed(2),
    dropoffRate: totalConversations > 0 ?
      ((data.reduce((acc, item) => acc + item.firstMessageDropoffs + item.midConversationDropoffs, 0) / totalConversations) * 100).toFixed(2) : '0'
  };
}

function getStartTimeFromRange(range: string, endTime: Date): Date {
  const multipliers = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000
  };

  return new Date(endTime.getTime() - multipliers[range]);
}

// Example API routes using these handlers:
/*
// app/api/dashboard/[chatbotId]/realtime/route.ts
import { getRealtimeDashboardHandler } from '@/lib/api/examples/dashboard-api-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatbotId: string } }
) {
  return getRealtimeDashboardHandler.handle(request, params);
}
*/