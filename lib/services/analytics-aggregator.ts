import { db } from '@/lib/db';
import {
  chatbotConversations,
  chatbotMessages,
  chatbotInstances,
  messageFeedback
} from '@/lib/db/schema';
import {
  chatbotHourlyAnalytics,
  chatbotWeeklyAnalytics,
  chatbotMonthlyAnalytics,
  userBehaviorAnalytics,
  performanceMetrics,
  featureUsageAnalytics,
  realtimeDashboardCache,
  type NewChatbotHourlyAnalytics,
  type NewChatbotWeeklyAnalytics,
  type NewChatbotMonthlyAnalytics,
  type NewUserBehaviorAnalytics,
  type NewFeatureUsageAnalytics,
  type NewRealtimeDashboardCache
} from '@/lib/db/analytics-schema';
import { eq, and, gte, lte, sql, count, avg, min, max, desc } from 'drizzle-orm';
import { cache, CacheKeys } from './cache-service';
import { jobQueue, JobType, JobPriority } from './job-queue';

/**
 * Analytics Aggregation Service
 * Handles pre-calculation and storage of analytics data for dashboard performance
 */
export class AnalyticsAggregator {
  /**
   * Aggregate hourly analytics for a specific chatbot and hour
   */
  async aggregateHourlyAnalytics(chatbotId: string, hourTimestamp: Date): Promise<void> {
    try {
      const startTime = new Date(hourTimestamp);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour

      console.log(`Aggregating hourly analytics for ${chatbotId} at ${hourTimestamp.toISOString()}`);

      // Get conversation metrics for the hour
      const conversationMetrics = await this.getHourlyConversationMetrics(chatbotId, startTime, endTime);

      // Get message metrics for the hour
      const messageMetrics = await this.getHourlyMessageMetrics(chatbotId, startTime, endTime);

      // Get user metrics for the hour
      const userMetrics = await this.getHourlyUserMetrics(chatbotId, startTime, endTime);

      // Get performance metrics for the hour
      const performanceMetrics = await this.getHourlyPerformanceMetrics(chatbotId, startTime, endTime);

      // Create hourly analytics record
      const hourlyData: NewChatbotHourlyAnalytics = {
        chatbotId,
        hourTimestamp: startTime,

        // Conversation metrics
        newConversations: conversationMetrics.newConversations,
        activeConversations: conversationMetrics.activeConversations,
        completedConversations: conversationMetrics.completedConversations,

        // Message metrics
        totalMessages: messageMetrics.totalMessages,
        userMessages: messageMetrics.userMessages,
        assistantMessages: messageMetrics.assistantMessages,

        // User metrics
        uniqueUsers: userMetrics.uniqueUsers,
        newUsers: userMetrics.newUsers,
        returningUsers: userMetrics.returningUsers,

        // Performance metrics
        avgResponseTimeMs: performanceMetrics.avgResponseTimeMs,
        minResponseTimeMs: performanceMetrics.minResponseTimeMs,
        maxResponseTimeMs: performanceMetrics.maxResponseTimeMs,
        p95ResponseTimeMs: performanceMetrics.p95ResponseTimeMs,

        // Token usage
        totalTokensUsed: messageMetrics.totalTokensUsed,
        inputTokens: messageMetrics.inputTokens,
        outputTokens: messageMetrics.outputTokens,

        // Error metrics
        errorCount: performanceMetrics.errorCount,
        timeoutCount: performanceMetrics.timeoutCount,

        // Integration breakdown
        integrationStats: conversationMetrics.integrationStats
      };

      // Upsert hourly analytics
      await db
        .insert(chatbotHourlyAnalytics)
        .values(hourlyData)
        .onConflictDoUpdate({
          target: [chatbotHourlyAnalytics.chatbotId, chatbotHourlyAnalytics.hourTimestamp],
          set: {
            ...hourlyData,
            updatedAt: new Date()
          }
        });

      console.log(`Hourly analytics aggregated successfully for ${chatbotId}`);

    } catch (error) {
      console.error(`Failed to aggregate hourly analytics for ${chatbotId}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate weekly analytics for a specific chatbot and week
   */
  async aggregateWeeklyAnalytics(chatbotId: string, weekStart: Date): Promise<void> {
    try {
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      console.log(`Aggregating weekly analytics for ${chatbotId} from ${weekStart.toISOString()}`);

      // Get weekly totals from hourly data
      const hourlyData = await db
        .select({
          totalConversations: sql<number>`SUM(${chatbotHourlyAnalytics.newConversations})`,
          totalMessages: sql<number>`SUM(${chatbotHourlyAnalytics.totalMessages})`,
          uniqueUsers: sql<number>`SUM(${chatbotHourlyAnalytics.uniqueUsers})`,
          avgResponseTimeMs: sql<number>`AVG(${chatbotHourlyAnalytics.avgResponseTimeMs})`,
          totalErrors: sql<number>`SUM(${chatbotHourlyAnalytics.errorCount})`
        })
        .from(chatbotHourlyAnalytics)
        .where(
          and(
            eq(chatbotHourlyAnalytics.chatbotId, chatbotId),
            gte(chatbotHourlyAnalytics.hourTimestamp, weekStart),
            lte(chatbotHourlyAnalytics.hourTimestamp, weekEnd)
          )
        );

      const weeklyTotals = hourlyData[0] || {
        totalConversations: 0,
        totalMessages: 0,
        uniqueUsers: 0,
        avgResponseTimeMs: 0,
        totalErrors: 0
      };

      // Calculate growth metrics (compare to previous week)
      const previousWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      const previousWeekData = await this.getPreviousWeekData(chatbotId, previousWeekStart);

      const conversationGrowth = this.calculateGrowthPercentage(
        weeklyTotals.totalConversations,
        previousWeekData.totalConversations
      );
      const userGrowth = this.calculateGrowthPercentage(
        weeklyTotals.uniqueUsers,
        previousWeekData.uniqueUsers
      );

      // Get usage patterns
      const usagePatterns = await this.getWeeklyUsagePatterns(chatbotId, weekStart, weekEnd);

      const weeklyData: NewChatbotWeeklyAnalytics = {
        chatbotId,
        weekStart,
        weekEnd,
        totalConversations: weeklyTotals.totalConversations,
        totalMessages: weeklyTotals.totalMessages,
        totalUsers: weeklyTotals.uniqueUsers,
        avgConversationsPerDay: Number((weeklyTotals.totalConversations / 7).toFixed(2)),
        avgMessagesPerDay: Number((weeklyTotals.totalMessages / 7).toFixed(2)),
        avgUsersPerDay: Number((weeklyTotals.uniqueUsers / 7).toFixed(2)),
        avgResponseTimeMs: weeklyTotals.avgResponseTimeMs,
        conversationGrowthPercent: conversationGrowth,
        userGrowthPercent: userGrowth,
        peakHour: usagePatterns.peakHour,
        peakDayOfWeek: usagePatterns.peakDayOfWeek,
        errorRate: Number(((weeklyTotals.totalErrors / weeklyTotals.totalMessages) * 100).toFixed(4))
      };

      // Upsert weekly analytics
      await db
        .insert(chatbotWeeklyAnalytics)
        .values(weeklyData)
        .onConflictDoUpdate({
          target: [chatbotWeeklyAnalytics.chatbotId, chatbotWeeklyAnalytics.weekStart],
          set: {
            ...weeklyData,
            updatedAt: new Date()
          }
        });

      console.log(`Weekly analytics aggregated successfully for ${chatbotId}`);

    } catch (error) {
      console.error(`Failed to aggregate weekly analytics for ${chatbotId}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate monthly analytics for a specific chatbot and month
   */
  async aggregateMonthlyAnalytics(chatbotId: string, monthYear: string): Promise<void> {
    try {
      const [year, month] = monthYear.split('-');
      const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthEnd = new Date(parseInt(year), parseInt(month), 0);

      console.log(`Aggregating monthly analytics for ${chatbotId} for ${monthYear}`);

      // Get monthly totals from daily analytics
      const monthlyTotals = await this.getMonthlyTotals(chatbotId, monthStart, monthEnd);

      // Get cost estimates
      const costEstimates = await this.calculateMonthlyCosts(chatbotId, monthStart, monthEnd);

      // Get engagement metrics
      const engagementMetrics = await this.getMonthlyEngagementMetrics(chatbotId, monthStart, monthEnd);

      // Get top content analytics
      const topContent = await this.getTopContentAnalytics(chatbotId, monthStart, monthEnd);

      const monthlyData: NewChatbotMonthlyAnalytics = {
        chatbotId,
        monthYear,
        monthStart,
        monthEnd,
        totalConversations: monthlyTotals.totalConversations,
        totalMessages: monthlyTotals.totalMessages,
        uniqueUsers: monthlyTotals.uniqueUsers,
        totalTokensUsed: monthlyTotals.totalTokensUsed,
        estimatedCostUsd: costEstimates.totalCost,
        tokenCostBreakdown: costEstimates.breakdown,
        avgSessionDuration: engagementMetrics.avgSessionDuration,
        avgMessagesPerConversation: engagementMetrics.avgMessagesPerConversation,
        userRetentionRate: engagementMetrics.userRetentionRate,
        avgResponseTimeMs: monthlyTotals.avgResponseTimeMs,
        uptimePercentage: 99.9, // Would calculate from performance metrics
        errorRate: monthlyTotals.errorRate,
        vectorSearchUsage: monthlyTotals.vectorSearchUsage,
        documentReferences: monthlyTotals.documentReferences,
        feedbackSubmissions: monthlyTotals.feedbackSubmissions,
        topQuestionCategories: topContent.topQuestionCategories,
        topIntegrations: topContent.topIntegrations,
        topErrorTypes: topContent.topErrorTypes
      };

      // Upsert monthly analytics
      await db
        .insert(chatbotMonthlyAnalytics)
        .values(monthlyData)
        .onConflictDoUpdate({
          target: [chatbotMonthlyAnalytics.chatbotId, chatbotMonthlyAnalytics.monthYear],
          set: {
            ...monthlyData,
            updatedAt: new Date()
          }
        });

      console.log(`Monthly analytics aggregated successfully for ${chatbotId}`);

    } catch (error) {
      console.error(`Failed to aggregate monthly analytics for ${chatbotId}:`, error);
      throw error;
    }
  }

  /**
   * Update real-time dashboard cache
   */
  async updateRealtimeDashboardCache(chatbotId: string): Promise<void> {
    try {
      console.log(`Updating real-time dashboard cache for ${chatbotId}`);

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = this.getWeekStart(now);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get current activity (last 5 minutes)
      const currentActivity = await this.getCurrentActivity(chatbotId, fiveMinutesAgo, now);

      // Get today's metrics
      const todayMetrics = await this.getTodayMetrics(chatbotId, todayStart, now);

      // Get week metrics
      const weekMetrics = await this.getWeekMetrics(chatbotId, weekStart, now);

      // Get month metrics
      const monthMetrics = await this.getMonthMetrics(chatbotId, monthStart, now);

      // Calculate growth percentages
      const dailyGrowth = await this.calculateDailyGrowth(chatbotId, todayStart);
      const weeklyGrowth = await this.calculateWeeklyGrowth(chatbotId, weekStart);
      const monthlyGrowth = await this.calculateMonthlyGrowth(chatbotId, monthStart);

      const cacheData: NewRealtimeDashboardCache = {
        chatbotId,

        // Current activity
        activeConversationsNow: currentActivity.activeConversations,
        messagesLast5Min: currentActivity.messages,
        avgResponseTimeLast5Min: currentActivity.avgResponseTime,
        errorsLast5Min: currentActivity.errors,

        // Today's metrics
        conversationsToday: todayMetrics.conversations,
        messagesToday: todayMetrics.messages,
        uniqueUsersToday: todayMetrics.uniqueUsers,
        avgResponseTimeToday: todayMetrics.avgResponseTime,

        // Week metrics
        conversationsThisWeek: weekMetrics.conversations,
        messagesThisWeek: weekMetrics.messages,
        uniqueUsersThisWeek: weekMetrics.uniqueUsers,

        // Month metrics
        conversationsThisMonth: monthMetrics.conversations,
        messagesThisMonth: monthMetrics.messages,
        uniqueUsersThisMonth: monthMetrics.uniqueUsers,

        // Growth indicators
        dailyGrowthPercent: dailyGrowth,
        weeklyGrowthPercent: weeklyGrowth,
        monthlyGrowthPercent: monthlyGrowth,

        // Quick stats
        topIntegrationToday: todayMetrics.topIntegration,
        peakHourToday: todayMetrics.peakHour,
        totalTokensUsedToday: todayMetrics.totalTokens,

        lastUpdated: new Date()
      };

      // Upsert real-time cache
      await db
        .insert(realtimeDashboardCache)
        .values(cacheData)
        .onConflictDoUpdate({
          target: [realtimeDashboardCache.chatbotId],
          set: {
            ...cacheData,
            lastUpdated: new Date()
          }
        });

      // Also cache in Redis for ultra-fast access
      await cache.set(
        CacheKeys.realtimeMetrics(chatbotId),
        cacheData,
        300 // 5 minutes
      );

      console.log(`Real-time dashboard cache updated successfully for ${chatbotId}`);

    } catch (error) {
      console.error(`Failed to update real-time dashboard cache for ${chatbotId}:`, error);
      throw error;
    }
  }

  /**
   * Queue analytics aggregation jobs for all active chatbots
   */
  async queueAnalyticsJobs(): Promise<void> {
    try {
      // Get all active chatbots
      const activeChatbots = await db
        .select({ id: chatbotInstances.id })
        .from(chatbotInstances)
        .where(eq(chatbotInstances.status, 'active'));

      const now = new Date();
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      for (const chatbot of activeChatbots) {
        // Queue hourly analytics for the current hour
        await jobQueue.addJob({
          type: JobType.CONVERSATION_ANALYTICS,
          priority: JobPriority.LOW,
          payload: {
            chatbotId: chatbot.id,
            aggregationType: 'hourly',
            timestamp: currentHour.toISOString()
          }
        });

        // Queue real-time cache update
        await jobQueue.addJob({
          type: JobType.DASHBOARD_METRICS_UPDATE,
          priority: JobPriority.NORMAL,
          payload: {
            chatbotId: chatbot.id,
            aggregationType: 'realtime'
          }
        });
      }

      console.log(`Queued analytics jobs for ${activeChatbots.length} chatbots`);

    } catch (error) {
      console.error('Failed to queue analytics jobs:', error);
      throw error;
    }
  }

  // Helper methods for data aggregation
  private async getHourlyConversationMetrics(chatbotId: string, startTime: Date, endTime: Date) {
    const conversations = await db
      .select({
        id: chatbotConversations.id,
        integrationType: chatbotConversations.integrationType,
        startedAt: chatbotConversations.startedAt,
        endedAt: chatbotConversations.endedAt
      })
      .from(chatbotConversations)
      .where(
        and(
          eq(chatbotConversations.chatbotId, chatbotId),
          gte(chatbotConversations.startedAt, startTime),
          lte(chatbotConversations.startedAt, endTime)
        )
      );

    const integrationStats = conversations.reduce((acc, conv) => {
      acc[conv.integrationType] = (acc[conv.integrationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      newConversations: conversations.length,
      activeConversations: conversations.filter(c => !c.endedAt).length,
      completedConversations: conversations.filter(c => c.endedAt).length,
      integrationStats
    };
  }

  private async getHourlyMessageMetrics(chatbotId: string, startTime: Date, endTime: Date) {
    const messages = await db
      .select({
        role: chatbotMessages.role,
        metadata: chatbotMessages.metadata
      })
      .from(chatbotMessages)
      .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
      .where(
        and(
          eq(chatbotConversations.chatbotId, chatbotId),
          gte(chatbotMessages.createdAt, startTime),
          lte(chatbotMessages.createdAt, endTime)
        )
      );

    let totalTokensUsed = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    messages.forEach(message => {
      const metadata = message.metadata as any;
      if (metadata?.tokens) {
        totalTokensUsed += metadata.tokens.total || 0;
        inputTokens += metadata.tokens.input || 0;
        outputTokens += metadata.tokens.output || 0;
      }
    });

    return {
      totalMessages: messages.length,
      userMessages: messages.filter(m => m.role === 'user').length,
      assistantMessages: messages.filter(m => m.role === 'assistant').length,
      totalTokensUsed,
      inputTokens,
      outputTokens
    };
  }

  private async getHourlyUserMetrics(chatbotId: string, startTime: Date, endTime: Date) {
    // This would need to be implemented based on user tracking strategy
    // For now, returning placeholder values
    return {
      uniqueUsers: 0,
      newUsers: 0,
      returningUsers: 0
    };
  }

  private async getHourlyPerformanceMetrics(chatbotId: string, startTime: Date, endTime: Date) {
    const messages = await db
      .select({
        metadata: chatbotMessages.metadata
      })
      .from(chatbotMessages)
      .innerJoin(chatbotConversations, eq(chatbotMessages.conversationId, chatbotConversations.id))
      .where(
        and(
          eq(chatbotConversations.chatbotId, chatbotId),
          eq(chatbotMessages.role, 'assistant'),
          gte(chatbotMessages.createdAt, startTime),
          lte(chatbotMessages.createdAt, endTime)
        )
      );

    const responseTimes = messages
      .map(m => (m.metadata as any)?.llmResponseTime)
      .filter(rt => rt && !isNaN(rt))
      .sort((a, b) => a - b);

    if (responseTimes.length === 0) {
      return {
        avgResponseTimeMs: 0,
        minResponseTimeMs: 0,
        maxResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        errorCount: 0,
        timeoutCount: 0
      };
    }

    const p95Index = Math.floor(responseTimes.length * 0.95);

    return {
      avgResponseTimeMs: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
      minResponseTimeMs: responseTimes[0],
      maxResponseTimeMs: responseTimes[responseTimes.length - 1],
      p95ResponseTimeMs: responseTimes[p95Index],
      errorCount: 0, // Would be calculated from error logs
      timeoutCount: 0 // Would be calculated from timeout tracking
    };
  }

  private calculateGrowthPercentage(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number(((current - previous) / previous * 100).toFixed(2));
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
  }

  // Placeholder implementations for helper methods
  private async getPreviousWeekData(chatbotId: string, previousWeekStart: Date) {
    return { totalConversations: 0, uniqueUsers: 0 };
  }

  private async getWeeklyUsagePatterns(chatbotId: string, weekStart: Date, weekEnd: Date) {
    return { peakHour: 14, peakDayOfWeek: 3 };
  }

  private async getMonthlyTotals(chatbotId: string, monthStart: Date, monthEnd: Date) {
    return {
      totalConversations: 0,
      totalMessages: 0,
      uniqueUsers: 0,
      totalTokensUsed: 0,
      avgResponseTimeMs: 0,
      errorRate: 0,
      vectorSearchUsage: 0,
      documentReferences: 0,
      feedbackSubmissions: 0
    };
  }

  private async calculateMonthlyCosts(chatbotId: string, monthStart: Date, monthEnd: Date) {
    return {
      totalCost: 0,
      breakdown: {}
    };
  }

  private async getMonthlyEngagementMetrics(chatbotId: string, monthStart: Date, monthEnd: Date) {
    return {
      avgSessionDuration: 0,
      avgMessagesPerConversation: 0,
      userRetentionRate: 0
    };
  }

  private async getTopContentAnalytics(chatbotId: string, monthStart: Date, monthEnd: Date) {
    return {
      topQuestionCategories: {},
      topIntegrations: {},
      topErrorTypes: {}
    };
  }

  private async getCurrentActivity(chatbotId: string, startTime: Date, endTime: Date) {
    return {
      activeConversations: 0,
      messages: 0,
      avgResponseTime: 0,
      errors: 0
    };
  }

  private async getTodayMetrics(chatbotId: string, todayStart: Date, now: Date) {
    return {
      conversations: 0,
      messages: 0,
      uniqueUsers: 0,
      avgResponseTime: 0,
      topIntegration: 'web_embed',
      peakHour: 14,
      totalTokens: 0
    };
  }

  private async getWeekMetrics(chatbotId: string, weekStart: Date, now: Date) {
    return { conversations: 0, messages: 0, uniqueUsers: 0 };
  }

  private async getMonthMetrics(chatbotId: string, monthStart: Date, now: Date) {
    return { conversations: 0, messages: 0, uniqueUsers: 0 };
  }

  private async calculateDailyGrowth(chatbotId: string, todayStart: Date): Promise<number> {
    return 0;
  }

  private async calculateWeeklyGrowth(chatbotId: string, weekStart: Date): Promise<number> {
    return 0;
  }

  private async calculateMonthlyGrowth(chatbotId: string, monthStart: Date): Promise<number> {
    return 0;
  }
}

// Export singleton instance
export const analyticsAggregator = new AnalyticsAggregator();