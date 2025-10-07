import { db } from '@/lib/db';
import {
  activityLogs,
  chatbotConversations,
  chatbotMessages,
  chatbotInstances,
  users
} from '@/lib/db/schema';
import { eq, and, gte, lte, desc, sql, count, avg } from 'drizzle-orm';
import { cache, CacheKeys } from './cache-service';

/**
 * Optimized Analytics Service with Redis caching and N+1 query fixes
 * Provides high-performance analytics with aggressive caching strategies
 */
export class CachedAnalyticsService {

  /**
   * Get real-time dashboard metrics with caching
   */
  static async getRealtimeMetrics(chatbotId: string): Promise<{
    activeConversations: number;
    messagesLastMinute: number;
    onlineUsers: number;
    averageResponseTime: number;
    errorRate: number;
    connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
    trends: {
      conversations: 'up' | 'down' | 'neutral';
      responseTime: 'up' | 'down' | 'neutral';
      users: 'up' | 'down' | 'neutral';
    };
  }> {
    const cacheKey = CacheKeys.realtimeMetrics(chatbotId);

    return await cache.getOrSet(
      cacheKey,
      async () => {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        // Single optimized query for all real-time metrics
        const [metrics] = await db
          .select({
            // Active conversations (not ended)
            activeConversations: sql<number>`
              COUNT(DISTINCT CASE
                WHEN ${chatbotConversations.endedAt} IS NULL
                THEN ${chatbotConversations.id}
              END)
            `,

            // Messages in last minute
            messagesLastMinute: sql<number>`
              COUNT(CASE
                WHEN ${chatbotMessages.createdAt} >= ${oneMinuteAgo}
                THEN ${chatbotMessages.id}
              END)
            `,

            // Users active in last hour
            onlineUsers: sql<number>`
              COUNT(DISTINCT CASE
                WHEN ${chatbotConversations.lastActivityAt} >= ${oneHourAgo}
                AND ${chatbotConversations.userIdentifier} IS NOT NULL
                THEN ${chatbotConversations.userIdentifier}
              END)
            `,

            // Average response time for assistant messages in last hour
            averageResponseTime: sql<number>`
              AVG(CASE
                WHEN ${chatbotMessages.role} = 'assistant'
                AND ${chatbotMessages.createdAt} >= ${oneHourAgo}
                THEN (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
              END)
            `,

            // Error rate in last hour
            totalMessages: sql<number>`
              COUNT(CASE
                WHEN ${chatbotMessages.createdAt} >= ${oneHourAgo}
                THEN ${chatbotMessages.id}
              END)
            `,

            errorMessages: sql<number>`
              COUNT(CASE
                WHEN ${chatbotMessages.createdAt} >= ${oneHourAgo}
                AND ${chatbotMessages.metadata}->>'error' IS NOT NULL
                THEN ${chatbotMessages.id}
              END)
            `
          })
          .from(chatbotConversations)
          .leftJoin(
            chatbotMessages,
            eq(chatbotMessages.conversationId, chatbotConversations.id)
          )
          .where(eq(chatbotConversations.chatbotId, chatbotId));

        // Calculate trends
        const trends = await this.calculateTrends(chatbotId);

        const errorRate = metrics.totalMessages > 0
          ? (metrics.errorMessages / metrics.totalMessages) * 100
          : 0;

        return {
          activeConversations: metrics.activeConversations || 0,
          messagesLastMinute: metrics.messagesLastMinute || 0,
          onlineUsers: metrics.onlineUsers || 0,
          averageResponseTime: Math.round(metrics.averageResponseTime || 0),
          errorRate: Math.round(errorRate * 100) / 100,
          connectionStatus: 'connected' as const,
          trends
        };
      },
      10 // 10 seconds cache for real-time feel
    );
  }

  /**
   * Get dashboard metrics for a specific time range with aggressive caching
   */
  static async getDashboardMetrics(
    chatbotId: string,
    timeRange: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<{
    summary: {
      totalConversations: number;
      totalMessages: number;
      uniqueUsers: number;
      avgResponseTime: number;
      totalErrors: number;
    };
    growth: {
      conversationsGrowth: number;
      usersGrowth: number;
      responseTimeChange: number;
    };
    hourlyBreakdown: Array<{
      hour: string;
      conversations: number;
      messages: number;
      users: number;
      responseTime: number;
    }>;
  }> {
    const cacheKey = CacheKeys.dashboardMetrics(chatbotId, timeRange);

    return await cache.getOrSet(
      cacheKey,
      async () => {
        const { startDate, endDate } = this.getTimeRangeDate(timeRange);

        // Single aggregated query for summary metrics
        const [summary] = await db
          .select({
            totalConversations: sql<number>`COUNT(DISTINCT ${chatbotConversations.id})`,
            totalMessages: sql<number>`COUNT(${chatbotMessages.id})`,
            uniqueUsers: sql<number>`COUNT(DISTINCT ${chatbotConversations.userIdentifier})`,
            avgResponseTime: sql<number>`
              AVG(CASE
                WHEN ${chatbotMessages.role} = 'assistant'
                THEN (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
              END)
            `,
            totalErrors: sql<number>`
              COUNT(CASE
                WHEN ${chatbotMessages.metadata}->>'error' IS NOT NULL
                THEN ${chatbotMessages.id}
              END)
            `
          })
          .from(chatbotConversations)
          .leftJoin(
            chatbotMessages,
            eq(chatbotMessages.conversationId, chatbotConversations.id)
          )
          .where(
            and(
              eq(chatbotConversations.chatbotId, chatbotId),
              gte(chatbotConversations.startedAt, startDate),
              lte(chatbotConversations.startedAt, endDate)
            )
          );

        // Hourly breakdown query (if needed for detailed view)
        const hourlyBreakdown = timeRange === '1h' || timeRange === '24h'
          ? await this.getHourlyBreakdown(chatbotId, startDate, endDate)
          : [];

        // Calculate growth compared to previous period
        const growth = await this.calculateGrowthMetrics(chatbotId, timeRange);

        return {
          summary: {
            totalConversations: summary?.totalConversations || 0,
            totalMessages: summary?.totalMessages || 0,
            uniqueUsers: summary?.uniqueUsers || 0,
            avgResponseTime: Math.round(summary?.avgResponseTime || 0),
            totalErrors: summary?.totalErrors || 0
          },
          growth,
          hourlyBreakdown
        };
      },
      this.getCacheTTL(timeRange) // Different cache TTL based on time range
    );
  }

  /**
   * Get conversation list with optimized JOIN (fixes N+1 problem)
   */
  static async getConversationsWithMetrics(
    chatbotId: string,
    options: {
      page?: number;
      limit?: number;
      status?: 'active' | 'completed' | 'all';
    } = {}
  ): Promise<{
    conversations: Array<{
      id: string;
      sessionId: string;
      userIdentifier: string | null;
      startedAt: Date;
      endedAt: Date | null;
      lastActivityAt: Date;
      messageCount: number;
      avgResponseTime: number;
      firstMessage: string | null;
    }>;
    pagination: {
      total: number;
      pages: number;
      current: number;
    };
  }> {
    const { page = 1, limit = 20, status = 'all' } = options;
    const cacheKey = `conversations:list:${chatbotId}:${page}:${limit}:${status}`;

    return await cache.getOrSet(
      cacheKey,
      async () => {
        // Build where conditions
        const whereConditions = [eq(chatbotConversations.chatbotId, chatbotId)];

        if (status === 'active') {
          whereConditions.push(sql`${chatbotConversations.endedAt} IS NULL`);
        } else if (status === 'completed') {
          whereConditions.push(sql`${chatbotConversations.endedAt} IS NOT NULL`);
        }

        // Single optimized query with JOIN and aggregation
        const conversations = await db
          .select({
            id: chatbotConversations.id,
            sessionId: chatbotConversations.sessionId,
            userIdentifier: chatbotConversations.userIdentifier,
            startedAt: chatbotConversations.startedAt,
            endedAt: chatbotConversations.endedAt,
            lastActivityAt: chatbotConversations.lastActivityAt,

            // Aggregated metrics from messages
            messageCount: sql<number>`COUNT(${chatbotMessages.id})`,
            avgResponseTime: sql<number>`
              AVG(CASE
                WHEN ${chatbotMessages.role} = 'assistant'
                THEN (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
              END)
            `,
            firstMessage: sql<string>`
              MIN(CASE
                WHEN ${chatbotMessages.role} = 'user'
                THEN ${chatbotMessages.content}
              END)
            `
          })
          .from(chatbotConversations)
          .leftJoin(
            chatbotMessages,
            eq(chatbotMessages.conversationId, chatbotConversations.id)
          )
          .where(and(...whereConditions))
          .groupBy(chatbotConversations.id)
          .orderBy(desc(chatbotConversations.lastActivityAt))
          .limit(limit)
          .offset((page - 1) * limit);

        // Get total count for pagination
        const [{ total }] = await db
          .select({ total: count() })
          .from(chatbotConversations)
          .where(and(...whereConditions));

        return {
          conversations: conversations.map(conv => ({
            ...conv,
            messageCount: conv.messageCount || 0,
            avgResponseTime: Math.round(conv.avgResponseTime || 0),
            firstMessage: conv.firstMessage?.substring(0, 100) || null
          })),
          pagination: {
            total: total || 0,
            pages: Math.ceil((total || 0) / limit),
            current: page
          }
        };
      },
      60 // 1 minute cache for conversation lists
    );
  }

  /**
   * Get chatbot performance statistics with caching
   */
  static async getChatbotStats(chatbotId: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    totalUsers: number;
    averageRating: number;
    responseTimeP95: number;
    errorRate: number;
    topHours: Array<{ hour: number; messageCount: number }>;
    userSatisfaction: number;
  }> {
    const cacheKey = CacheKeys.chatbotStats(chatbotId);

    return await cache.getOrSet(
      cacheKey,
      async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Single comprehensive query for all stats
        const [stats] = await db
          .select({
            totalConversations: sql<number>`COUNT(DISTINCT ${chatbotConversations.id})`,
            totalMessages: sql<number>`COUNT(${chatbotMessages.id})`,
            totalUsers: sql<number>`COUNT(DISTINCT ${chatbotConversations.userIdentifier})`,
            avgResponseTime: sql<number>`
              AVG(CASE
                WHEN ${chatbotMessages.role} = 'assistant'
                THEN (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
              END)
            `,
            p95ResponseTime: sql<number>`
              PERCENTILE_CONT(0.95) WITHIN GROUP (
                ORDER BY (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
              ) FILTER (WHERE ${chatbotMessages.role} = 'assistant')
            `,
            errorCount: sql<number>`
              COUNT(CASE
                WHEN ${chatbotMessages.metadata}->>'error' IS NOT NULL
                THEN ${chatbotMessages.id}
              END)
            `
          })
          .from(chatbotConversations)
          .leftJoin(
            chatbotMessages,
            eq(chatbotMessages.conversationId, chatbotConversations.id)
          )
          .where(
            and(
              eq(chatbotConversations.chatbotId, chatbotId),
              gte(chatbotConversations.startedAt, thirtyDaysAgo)
            )
          );

        const errorRate = stats.totalMessages > 0
          ? (stats.errorCount / stats.totalMessages) * 100
          : 0;

        // Get top active hours
        const topHours = await this.getTopActiveHours(chatbotId);

        return {
          totalConversations: stats.totalConversations || 0,
          totalMessages: stats.totalMessages || 0,
          totalUsers: stats.totalUsers || 0,
          averageRating: 0, // Placeholder - would need rating system
          responseTimeP95: Math.round(stats.p95ResponseTime || 0),
          errorRate: Math.round(errorRate * 100) / 100,
          topHours,
          userSatisfaction: 85 // Placeholder - would calculate from feedback
        };
      },
      300 // 5 minutes cache for stats
    );
  }

  /**
   * Invalidate cache for a specific chatbot
   */
  static async invalidateChatbotCache(chatbotId: string): Promise<void> {
    await Promise.all([
      cache.invalidate(`*:${chatbotId}:*`),
      cache.invalidate(`*:${chatbotId}`),
      cache.delete(CacheKeys.chatbotStats(chatbotId)),
      cache.delete(CacheKeys.realtimeMetrics(chatbotId))
    ]);
  }

  /**
   * Bulk cache warming for multiple chatbots
   */
  static async warmCache(chatbotIds: string[]): Promise<void> {
    const warmingPromises = chatbotIds.map(async (chatbotId) => {
      try {
        // Warm up the most frequently accessed caches
        await Promise.all([
          this.getRealtimeMetrics(chatbotId),
          this.getDashboardMetrics(chatbotId, '24h'),
          this.getChatbotStats(chatbotId)
        ]);
      } catch (error) {
        console.error(`Failed to warm cache for chatbot ${chatbotId}:`, error);
      }
    });

    await Promise.allSettled(warmingPromises);
  }

  // Private helper methods

  private static async calculateTrends(chatbotId: string): Promise<{
    conversations: 'up' | 'down' | 'neutral';
    responseTime: 'up' | 'down' | 'neutral';
    users: 'up' | 'down' | 'neutral';
  }> {
    const now = new Date();
    const currentHour = new Date(now.getTime() - 60 * 60 * 1000);
    const previousHour = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const [current, previous] = await Promise.all([
      this.getHourlyMetrics(chatbotId, currentHour, now),
      this.getHourlyMetrics(chatbotId, previousHour, currentHour)
    ]);

    return {
      conversations: this.calculateTrend(current.conversations, previous.conversations),
      responseTime: this.calculateTrend(previous.responseTime, current.responseTime), // Reverse for response time
      users: this.calculateTrend(current.users, previous.users)
    };
  }

  private static calculateTrend(current: number, previous: number): 'up' | 'down' | 'neutral' {
    const threshold = 0.1; // 10% change threshold
    const change = previous > 0 ? (current - previous) / previous : 0;

    if (change > threshold) return 'up';
    if (change < -threshold) return 'down';
    return 'neutral';
  }

  private static async getHourlyMetrics(
    chatbotId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ conversations: number; responseTime: number; users: number }> {
    const [metrics] = await db
      .select({
        conversations: sql<number>`COUNT(DISTINCT ${chatbotConversations.id})`,
        responseTime: sql<number>`
          AVG(CASE
            WHEN ${chatbotMessages.role} = 'assistant'
            THEN (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
          END)
        `,
        users: sql<number>`COUNT(DISTINCT ${chatbotConversations.userIdentifier})`
      })
      .from(chatbotConversations)
      .leftJoin(
        chatbotMessages,
        eq(chatbotMessages.conversationId, chatbotConversations.id)
      )
      .where(
        and(
          eq(chatbotConversations.chatbotId, chatbotId),
          gte(chatbotConversations.startedAt, startDate),
          lte(chatbotConversations.startedAt, endDate)
        )
      );

    return {
      conversations: metrics?.conversations || 0,
      responseTime: metrics?.responseTime || 0,
      users: metrics?.users || 0
    };
  }

  private static async getHourlyBreakdown(
    chatbotId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    hour: string;
    conversations: number;
    messages: number;
    users: number;
    responseTime: number;
  }>> {
    const breakdown = await db
      .select({
        hour: sql<string>`DATE_TRUNC('hour', ${chatbotConversations.startedAt})`,
        conversations: sql<number>`COUNT(DISTINCT ${chatbotConversations.id})`,
        messages: sql<number>`COUNT(${chatbotMessages.id})`,
        users: sql<number>`COUNT(DISTINCT ${chatbotConversations.userIdentifier})`,
        responseTime: sql<number>`
          AVG(CASE
            WHEN ${chatbotMessages.role} = 'assistant'
            THEN (${chatbotMessages.metadata}->>'llmResponseTime')::numeric
          END)
        `
      })
      .from(chatbotConversations)
      .leftJoin(
        chatbotMessages,
        eq(chatbotMessages.conversationId, chatbotConversations.id)
      )
      .where(
        and(
          eq(chatbotConversations.chatbotId, chatbotId),
          gte(chatbotConversations.startedAt, startDate),
          lte(chatbotConversations.startedAt, endDate)
        )
      )
      .groupBy(sql`DATE_TRUNC('hour', ${chatbotConversations.startedAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${chatbotConversations.startedAt})`);

    return breakdown.map(row => ({
      hour: row.hour || '',
      conversations: row.conversations || 0,
      messages: row.messages || 0,
      users: row.users || 0,
      responseTime: Math.round(row.responseTime || 0)
    }));
  }

  private static async calculateGrowthMetrics(
    chatbotId: string,
    timeRange: string
  ): Promise<{
    conversationsGrowth: number;
    usersGrowth: number;
    responseTimeChange: number;
  }> {
    // Implementation for growth calculation
    // This would compare current period with previous period
    return {
      conversationsGrowth: 0,
      usersGrowth: 0,
      responseTimeChange: 0
    };
  }

  private static async getTopActiveHours(chatbotId: string): Promise<Array<{
    hour: number;
    messageCount: number;
  }>> {
    const topHours = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${chatbotMessages.createdAt})`,
        messageCount: count()
      })
      .from(chatbotMessages)
      .innerJoin(
        chatbotConversations,
        eq(chatbotMessages.conversationId, chatbotConversations.id)
      )
      .where(eq(chatbotConversations.chatbotId, chatbotId))
      .groupBy(sql`EXTRACT(HOUR FROM ${chatbotMessages.createdAt})`)
      .orderBy(desc(count()))
      .limit(5);

    return topHours.map(row => ({
      hour: row.hour || 0,
      messageCount: row.messageCount || 0
    }));
  }

  private static getTimeRangeDate(timeRange: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = now;
    let startDate: Date;

    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  private static getCacheTTL(timeRange: string): number {
    switch (timeRange) {
      case '1h':
        return 60; // 1 minute for hourly data
      case '24h':
        return 300; // 5 minutes for daily data
      case '7d':
        return 900; // 15 minutes for weekly data
      case '30d':
        return 3600; // 1 hour for monthly data
      default:
        return 300;
    }
  }
}

export default CachedAnalyticsService;