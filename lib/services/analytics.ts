import { db } from '@/lib/db';
import { chatbotInstances } from '@/lib/db/simple-schema';
import {
  activityLogs,
  users,
  searchQueries,
  searchResultsCache,
  systemSettings
} from '@/lib/db/schema';
import { eq, and, gte, lte, desc, asc, sql, count, avg, min, max, sum } from 'drizzle-orm';
import type {
  AnalyticsQuery,
  PerformanceMetricsQuery,
  UserActivityEvent,
  SessionAnalyticsQuery,
  DashboardMetricsQuery,
  ExportRequest,
  AnalyticsMetric,
  PerformanceMetric,
  SessionSummary
} from '@/lib/validation/analytics';

interface AnalyticsResult {
  metrics: AnalyticsMetric[];
  summary: {
    totalEvents: number;
    timeRange: string;
    averageValue: number;
    trend: 'up' | 'down' | 'stable';
  };
  breakdown?: Record<string, number>;
}

interface PerformanceAnalyticsResult {
  metrics: PerformanceMetric[];
  summary: {
    averageResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
    throughput: number;
  };
  trends: {
    responseTime: { direction: 'up' | 'down' | 'stable'; percentage: number };
    errorRate: { direction: 'up' | 'down' | 'stable'; percentage: number };
  };
}

interface SessionAnalyticsResult {
  sessions: SessionSummary[];
  aggregates: {
    totalSessions: number;
    averageDuration: number;
    averageMessagesPerSession: number;
    uniqueUsers: number;
    topChatbots: Array<{ chatbotId: string; sessionCount: number }>;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface DashboardMetrics {
  realTimeMetrics: {
    activeSessions: number;
    messagesPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
  };
  periodMetrics: {
    totalConversations: number;
    uniqueUsers: number;
    knowledgeBaseQueries: number;
    userSatisfactionScore: number;
  };
  trends: {
    conversationsTrend: number;
    usersTrend: number;
    responseTrend: number;
  };
  topPerformers: {
    chatbots: Array<{ id: string; name: string; messageCount: number }>;
    topics: Array<{ topic: string; frequency: number }>;
  };
}

export class AnalyticsService {
  /**
   * Generate general analytics based on activity logs and user interactions
   */
  static async generateAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    try {
      const { timeRange, filters, granularity, includeBreakdown } = query;

      let whereConditions = [
        gte(activityLogs.createdAt, new Date(timeRange.startDate)),
        lte(activityLogs.createdAt, new Date(timeRange.endDate))
      ];

      // Apply filters
      if (filters.chatbotIds?.length) {
        whereConditions.push(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${filters.chatbotIds})`);
      }

      if (filters.userIds?.length) {
        whereConditions.push(sql`${activityLogs.userId} = ANY(${filters.userIds})`);
      }

      if (filters.sessionIds?.length) {
        whereConditions.push(sql`${activityLogs.metadata}->>'sessionId' = ANY(${filters.sessionIds})`);
      }

      // Get time-series data based on granularity
      const timeFormat = this.getTimeFormat(granularity);
      const metricsQuery = db
        .select({
          timestamp: sql<string>`date_trunc('${sql.raw(timeFormat)}', ${activityLogs.createdAt})`,
          count: count(),
          avgDuration: avg(sql<number>`CAST(${activityLogs.metadata}->>'duration' AS NUMERIC)`),
        })
        .from(activityLogs)
        .where(and(...whereConditions))
        .groupBy(sql`date_trunc('${sql.raw(timeFormat)}', ${activityLogs.createdAt})`)
        .orderBy(sql`date_trunc('${sql.raw(timeFormat)}', ${activityLogs.createdAt})`);

      const results = await metricsQuery;

      // Calculate summary statistics
      const totalEvents = results.reduce((sum, r) => sum + (r.count || 0), 0);
      const averageValue = totalEvents / (results.length || 1);

      // Calculate trend (compare first half vs second half)
      const midpoint = Math.floor(results.length / 2);
      const firstHalf = results.slice(0, midpoint);
      const secondHalf = results.slice(midpoint);

      const firstHalfAvg = firstHalf.reduce((sum, r) => sum + (r.count || 0), 0) / (firstHalf.length || 1);
      const secondHalfAvg = secondHalf.reduce((sum, r) => sum + (r.count || 0), 0) / (secondHalf.length || 1);

      let trend: 'up' | 'down' | 'stable' = 'stable';
      const trendThreshold = 0.1; // 10% change threshold

      if (secondHalfAvg > firstHalfAvg * (1 + trendThreshold)) {
        trend = 'up';
      } else if (secondHalfAvg < firstHalfAvg * (1 - trendThreshold)) {
        trend = 'down';
      }

      // Generate breakdown if requested
      let breakdown: Record<string, number> | undefined;
      if (includeBreakdown && filters.chatbotIds?.length) {
        const breakdownQuery = db
          .select({
            chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
            count: count()
          })
          .from(activityLogs)
          .where(and(...whereConditions))
          .groupBy(sql`${activityLogs.metadata}->>'chatbotId'`);

        const breakdownResults = await breakdownQuery;
        breakdown = breakdownResults.reduce((acc, r) => {
          if (r.chatbotId) {
            acc[r.chatbotId] = r.count || 0;
          }
          return acc;
        }, {} as Record<string, number>);
      }

      const metrics: AnalyticsMetric[] = results.map(result => ({
        timestamp: result.timestamp,
        value: result.count || 0,
        label: this.formatTimeLabel(result.timestamp, granularity),
        metadata: {
          averageDuration: result.avgDuration || 0
        }
      }));

      return {
        metrics,
        summary: {
          totalEvents,
          timeRange: `${timeRange.startDate} to ${timeRange.endDate}`,
          averageValue,
          trend
        },
        breakdown
      };

    } catch (error) {
      console.error('Error generating analytics:', error);
      throw new Error('Failed to generate analytics data');
    }
  }

  /**
   * Generate performance metrics and analysis
   */
  static async generatePerformanceMetrics(query: PerformanceMetricsQuery): Promise<PerformanceAnalyticsResult> {
    try {
      const { timeRange, metricTypes, aggregation, percentile, granularity } = query;

      const timeFormat = this.getTimeFormat(granularity);

      // Query performance metrics from activity logs
      const whereConditions = [
        gte(activityLogs.createdAt, new Date(timeRange.startDate)),
        lte(activityLogs.createdAt, new Date(timeRange.endDate)),
        sql`${activityLogs.metadata} ? 'responseTime'`
      ];

      const metricsQuery = db
        .select({
          timestamp: sql<string>`date_trunc('${sql.raw(timeFormat)}', ${activityLogs.createdAt})`,
          avgResponseTime: avg(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`),
          minResponseTime: min(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`),
          maxResponseTime: max(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`),
          totalRequests: count(),
          errorCount: sql<number>`SUM(CASE WHEN ${activityLogs.metadata}->>'error' IS NOT NULL THEN 1 ELSE 0 END)`
        })
        .from(activityLogs)
        .where(and(...whereConditions))
        .groupBy(sql`date_trunc('${sql.raw(timeFormat)}', ${activityLogs.createdAt})`)
        .orderBy(sql`date_trunc('${sql.raw(timeFormat)}', ${activityLogs.createdAt})`);

      const results = await metricsQuery;

      // Calculate percentiles for response time
      const responseTimesQuery = db
        .select({
          responseTime: sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`
        })
        .from(activityLogs)
        .where(and(...whereConditions))
        .orderBy(sql`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`);

      const responseTimes = await responseTimesQuery;
      const p95Index = Math.floor(responseTimes.length * (percentile / 100));
      const p95ResponseTime = responseTimes[p95Index]?.responseTime || 0;

      // Calculate summary metrics
      const totalRequests = results.reduce((sum, r) => sum + (r.totalRequests || 0), 0);
      const totalErrors = results.reduce((sum, r) => sum + (r.errorCount || 0), 0);
      const averageResponseTime = results.reduce((sum, r) => sum + (r.avgResponseTime || 0), 0) / (results.length || 1);
      const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
      const throughput = totalRequests / ((new Date(timeRange.endDate).getTime() - new Date(timeRange.startDate).getTime()) / (1000 * 60)); // requests per minute

      // Calculate trends (compare first half vs second half)
      const midpoint = Math.floor(results.length / 2);
      const firstHalf = results.slice(0, midpoint);
      const secondHalf = results.slice(midpoint);

      const firstHalfResponseTime = firstHalf.reduce((sum, r) => sum + (r.avgResponseTime || 0), 0) / (firstHalf.length || 1);
      const secondHalfResponseTime = secondHalf.reduce((sum, r) => sum + (r.avgResponseTime || 0), 0) / (secondHalf.length || 1);

      const firstHalfErrorRate = firstHalf.reduce((sum, r) => sum + (r.errorCount || 0), 0) / firstHalf.reduce((sum, r) => sum + (r.totalRequests || 0), 0) || 0;
      const secondHalfErrorRate = secondHalf.reduce((sum, r) => sum + (r.errorCount || 0), 0) / secondHalf.reduce((sum, r) => sum + (r.totalRequests || 0), 0) || 0;

      const responseTimeTrend = this.calculateTrend(firstHalfResponseTime, secondHalfResponseTime);
      const errorRateTrend = this.calculateTrend(firstHalfErrorRate, secondHalfErrorRate);

      const metrics: PerformanceMetric[] = results.map(result => ({
        metricType: 'response_time',
        value: result.avgResponseTime || 0,
        unit: 'ms',
        timestamp: result.timestamp,
        percentile,
        breakdown: {
          min: result.minResponseTime || 0,
          max: result.maxResponseTime || 0,
          avg: result.avgResponseTime || 0,
          requests: result.totalRequests || 0,
          errors: result.errorCount || 0
        }
      }));

      return {
        metrics,
        summary: {
          averageResponseTime,
          p95ResponseTime,
          errorRate,
          throughput
        },
        trends: {
          responseTime: responseTimeTrend,
          errorRate: errorRateTrend
        }
      };

    } catch (error) {
      console.error('Error generating performance metrics:', error);
      throw new Error('Failed to generate performance metrics');
    }
  }

  /**
   * Get recent activity data for dashboard display
   */
  static async getRecentActivity(options: {
    userId?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      const { userId, limit = 50 } = options;

      // For now, return empty array since the activity_logs table is causing Drizzle ORM issues
      // This is a temporary workaround to fix the 500 error on the dashboard
      console.log('getRecentActivity called - returning empty array (temporary fix)');

      return [];

      /* COMMENTED OUT UNTIL DRIZZLE ISSUE IS RESOLVED
      let whereConditions = [];

      // Filter by user if specified
      if (userId) {
        whereConditions.push(eq(activityLogs.userId, userId));
      }

      // Get recent activity logs using correct column names
      const activities = await db
        .select({
          id: activityLogs.id,
          action: activityLogs.activityType,
          resourceType: activityLogs.entityType,
          resourceId: activityLogs.entityId,
          description: activityLogs.description,
          metadata: activityLogs.metadata,
          timestamp: activityLogs.createdAt,
          userId: activityLogs.userId,
        })
        .from(activityLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(activityLogs.createdAt))
        .limit(Math.min(limit, 200));

      // Handle empty results gracefully
      if (!activities || !Array.isArray(activities)) {
        return [];
      }

      return activities.map(activity => ({
        id: activity.id,
        action: activity.action,
        resourceType: activity.resourceType,
        resourceId: activity.resourceId,
        description: activity.description,
        metadata: activity.metadata || {},
        timestamp: activity.timestamp?.toISOString(),
        userId: activity.userId,
      }));
      */

    } catch (error) {
      console.error('Error getting recent activity:', error);
      throw new Error('Failed to get recent activity');
    }
  }

  /**
   * Track user activity events
   */
  static async trackUserActivity(event: UserActivityEvent): Promise<string> {
    try {
      const result = await db.insert(activityLogs).values({
        userId: event.userId || null,
        activityType: event.eventType,
        entityType: 'chatbot',
        entityId: event.chatbotId,
        description: `User ${event.eventType} activity`,
        metadata: {
          sessionId: event.sessionId,
          eventData: event.eventData,
          userAgent: event.userAgent,
          ipAddress: event.ipAddress,
          responseTime: event.responseTime
        },
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        createdAt: new Date(event.timestamp)
      }).returning({ id: activityLogs.id });

      return result[0].id;
    } catch (error) {
      console.error('Error tracking user activity:', error);
      throw new Error('Failed to track user activity');
    }
  }

  /**
   * Generate session analytics
   */
  static async generateSessionAnalytics(query: SessionAnalyticsQuery): Promise<SessionAnalyticsResult> {
    try {
      const { timeRange, pagination, filters } = query;

      // Build session aggregation query
      const sessionQuery = db
        .select({
          sessionId: sql<string>`${activityLogs.metadata}->>'sessionId'`,
          chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
          userId: activityLogs.userId,
          startTime: sql<string>`MIN(${activityLogs.createdAt})`,
          endTime: sql<string>`MAX(${activityLogs.createdAt})`,
          messageCount: count(),
          avgResponseTime: avg(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`),
          errorCount: sql<number>`SUM(CASE WHEN ${activityLogs.metadata}->>'error' IS NOT NULL THEN 1 ELSE 0 END)`,
          knowledgeSearchCount: sql<number>`SUM(CASE WHEN ${activityLogs.activityType} = 'similarity_search' THEN 1 ELSE 0 END)`
        })
        .from(activityLogs)
        .where(and(
          gte(activityLogs.createdAt, new Date(timeRange.startDate)),
          lte(activityLogs.createdAt, new Date(timeRange.endDate)),
          sql`${activityLogs.metadata}->>'sessionId' IS NOT NULL`
        ))
        .groupBy(
          sql`${activityLogs.metadata}->>'sessionId'`,
          sql`${activityLogs.metadata}->>'chatbotId'`,
          activityLogs.userId
        );

      // Apply filters
      if (filters.chatbotIds?.length) {
        sessionQuery.where(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${filters.chatbotIds})`);
      }

      if (filters.userIds?.length) {
        sessionQuery.where(sql`${activityLogs.userId} = ANY(${filters.userIds})`);
      }

      // Add pagination
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const offset = (page - 1) * limit;

      const [sessionsData, countResult] = await Promise.all([
        sessionQuery.limit(limit).offset(offset),
        db.select({ count: count() }).from(sessionQuery.as('session_count'))
      ]);

      const totalSessions = countResult[0]?.count || 0;

      // Process session data
      const sessions: SessionSummary[] = sessionsData.map(session => {
        const duration = session.endTime && session.startTime
          ? (session.endTime.getTime() - session.startTime.getTime()) / 1000
          : 0;

        return {
          sessionId: session.sessionId || '',
          userId: session.userId || undefined,
          chatbotId: session.chatbotId || '',
          startTime: session.startTime?.toISOString() || '',
          endTime: session.endTime?.toISOString(),
          duration,
          messageCount: session.messageCount || 0,
          knowledgeSearchCount: session.knowledgeSearchCount || 0,
          errorCount: session.errorCount || 0,
          averageResponseTime: Number(session.avgResponseTime) || 0
        };
      });

      // Calculate aggregates
      const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
      const averageDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
      const averageMessagesPerSession = sessions.reduce((sum, s) => sum + s.messageCount, 0) / (sessions.length || 1);
      const uniqueUsers = new Set(sessions.map(s => s.userId).filter(Boolean)).size;

      // Get top chatbots
      const chatbotCounts = sessions.reduce((acc, session) => {
        acc[session.chatbotId] = (acc[session.chatbotId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topChatbots = Object.entries(chatbotCounts)
        .map(([chatbotId, sessionCount]) => ({ chatbotId, sessionCount }))
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .slice(0, 5);

      return {
        sessions,
        aggregates: {
          totalSessions,
          averageDuration,
          averageMessagesPerSession,
          uniqueUsers,
          topChatbots
        },
        pagination: {
          page,
          limit,
          total: totalSessions,
          totalPages: Math.ceil(totalSessions / limit)
        }
      };

    } catch (error) {
      console.error('Error generating session analytics:', error);
      throw new Error('Failed to generate session analytics');
    }
  }

  /**
   * Generate dashboard metrics for real-time monitoring
   */
  static async generateDashboardMetrics(query: DashboardMetricsQuery): Promise<DashboardMetrics> {
    try {
      const { timeRange, realTime, metricsToInclude, chatbotIds } = query;

      const whereConditions = [];

      if (timeRange) {
        whereConditions.push(
          gte(activityLogs.createdAt, new Date(timeRange.startDate)),
          lte(activityLogs.createdAt, new Date(timeRange.endDate))
        );
      } else if (realTime) {
        // Last 24 hours for real-time metrics
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        whereConditions.push(gte(activityLogs.createdAt, yesterday));
      }

      if (chatbotIds?.length) {
        whereConditions.push(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${chatbotIds})`);
      }

      // Real-time metrics (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const realTimeConditions = [gte(activityLogs.createdAt, oneHourAgo)];
      if (chatbotIds?.length) {
        realTimeConditions.push(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${chatbotIds})`);
      }

      const realTimeQuery = db
        .select({
          activeSessions: sql<number>`COUNT(DISTINCT ${activityLogs.metadata}->>'sessionId')`,
          totalMessages: count(),
          avgResponseTime: avg(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`),
          errorCount: sql<number>`SUM(CASE WHEN ${activityLogs.metadata}->>'error' IS NOT NULL THEN 1 ELSE 0 END)`
        })
        .from(activityLogs)
        .where(and(...realTimeConditions));

      // Period metrics
      let periodQuery = db
        .select({
          totalConversations: sql<number>`COUNT(DISTINCT ${activityLogs.metadata}->>'sessionId')`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${activityLogs.userId})`,
          knowledgeBaseQueries: sql<number>`SUM(CASE WHEN ${activityLogs.activityType} = 'similarity_search' THEN 1 ELSE 0 END)`,
          totalMessages: count()
        })
        .from(activityLogs);

      if (whereConditions.length > 0) {
        periodQuery = periodQuery.where(and(...whereConditions));
      }

      const [realTimeData, periodData] = await Promise.all([
        realTimeQuery,
        periodQuery
      ]);

      const realTimeMetrics = realTimeData[0] || {};
      const periodMetrics = periodData[0] || {};

      const messagesPerMinute = (realTimeMetrics.totalMessages || 0) / 60;
      const errorRate = realTimeMetrics.totalMessages > 0
        ? ((realTimeMetrics.errorCount || 0) / realTimeMetrics.totalMessages) * 100
        : 0;

      // Calculate trends (compare with previous period)
      const previousPeriodStart = timeRange
        ? new Date(new Date(timeRange.startDate).getTime() - (new Date(timeRange.endDate).getTime() - new Date(timeRange.startDate).getTime()))
        : new Date(Date.now() - 48 * 60 * 60 * 1000);

      const previousPeriodEnd = timeRange
        ? new Date(timeRange.startDate)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const previousPeriodQuery = db
        .select({
          totalConversations: sql<number>`COUNT(DISTINCT ${activityLogs.metadata}->>'sessionId')`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${activityLogs.userId})`,
          avgResponseTime: avg(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`)
        })
        .from(activityLogs)
        .where(and(
          gte(activityLogs.createdAt, previousPeriodStart),
          lte(activityLogs.createdAt, previousPeriodEnd),
          ...(chatbotIds?.length ? [sql`${activityLogs.metadata}->>'chatbotId' = ANY(${chatbotIds})`] : [])
        ));

      const previousData = await previousPeriodQuery;
      const previousMetrics = previousData[0] || {};

      const conversationsTrend = this.calculateTrendPercentage(
        previousMetrics.totalConversations || 0,
        periodMetrics.totalConversations || 0
      );

      const usersTrend = this.calculateTrendPercentage(
        previousMetrics.uniqueUsers || 0,
        periodMetrics.uniqueUsers || 0
      );

      const responseTrend = this.calculateTrendPercentage(
        previousMetrics.avgResponseTime || 0,
        realTimeMetrics.avgResponseTime || 0
      );

      // Get top performing chatbots
      const topChatbotsQuery = db
        .select({
          chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
          messageCount: count()
        })
        .from(activityLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .groupBy(sql`${activityLogs.metadata}->>'chatbotId'`)
        .orderBy(desc(count()))
        .limit(5);

      const topChatbotsData = await topChatbotsQuery;

      // Get chatbot names
      const topChatbotIds = topChatbotsData.map(c => c.chatbotId).filter(Boolean);
      const chatbotDetails = topChatbotIds.length > 0 ? await db
        .select({ id: chatbotInstances.id, name: chatbotInstances.name })
        .from(chatbotInstances)
        .where(sql`${chatbotInstances.id} = ANY(${topChatbotIds})`) : [];

      const chatbotNameMap = chatbotDetails.reduce((acc, c) => {
        acc[c.id] = c.name;
        return acc;
      }, {} as Record<string, string>);

      const topPerformingChatbots = topChatbotsData.map(c => ({
        id: c.chatbotId || '',
        name: chatbotNameMap[c.chatbotId || ''] || 'Unknown',
        messageCount: c.messageCount || 0
      }));

      return {
        realTimeMetrics: {
          activeSessions: realTimeMetrics.activeSessions || 0,
          messagesPerMinute,
          averageResponseTime: realTimeMetrics.avgResponseTime || 0,
          errorRate
        },
        periodMetrics: {
          totalConversations: periodMetrics.totalConversations || 0,
          uniqueUsers: periodMetrics.uniqueUsers || 0,
          knowledgeBaseQueries: periodMetrics.knowledgeBaseQueries || 0,
          userSatisfactionScore: 0 // Placeholder - would need user feedback data
        },
        trends: {
          conversationsTrend,
          usersTrend,
          responseTrend
        },
        topPerformers: {
          chatbots: topPerformingChatbots,
          topics: [] // Placeholder - would need topic extraction
        }
      };

    } catch (error) {
      console.error('Error generating dashboard metrics:', error);
      throw new Error('Failed to generate dashboard metrics');
    }
  }

  /**
   * Export analytics data in various formats
   */
  static async exportAnalyticsData(request: ExportRequest): Promise<{
    downloadUrl: string;
    filename: string;
    format: string;
    size: number;
    expiresAt: string;
  }> {
    try {
      const { dataType, timeRange, format, filters, maxRecords } = request;

      // Query data based on dataType
      let exportData: any[] = [];
      const limit = maxRecords || 10000;

      switch (dataType) {
        case 'analytics':
          exportData = await this.getAnalyticsExportData(timeRange, filters, limit);
          break;
        case 'performance':
          exportData = await this.getPerformanceExportData(timeRange, filters, limit);
          break;
        case 'sessions':
          exportData = await this.getSessionsExportData(timeRange, filters, limit);
          break;
        case 'user_activity':
          exportData = await this.getUserActivityExportData(timeRange, filters, limit);
          break;
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${dataType}_export_${timestamp}.${format}`;

      // Format data according to requested format
      let fileContent: string;
      let mimeType: string;

      switch (format) {
        case 'csv':
          fileContent = this.convertToCSV(exportData);
          mimeType = 'text/csv';
          break;
        case 'json':
          fileContent = JSON.stringify({
            exportInfo: {
              dataType,
              timeRange,
              generatedAt: new Date().toISOString(),
              recordCount: exportData.length
            },
            data: exportData
          }, null, 2);
          mimeType = 'application/json';
          break;
        case 'xlsx':
          // For XLSX, we'll return a placeholder since it requires a library
          fileContent = this.convertToCSV(exportData);
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Calculate file size
      const size = Buffer.byteLength(fileContent, 'utf8');

      // In a production environment, you would:
      // 1. Upload to cloud storage (S3, CloudFlare R2, etc.)
      // 2. Generate a signed URL with expiration
      // 3. Store export metadata in database for tracking

      // For now, we'll create a data URL that can be downloaded client-side
      const base64Content = Buffer.from(fileContent).toString('base64');
      const downloadUrl = `data:${mimeType};base64,${base64Content}`;

      // Set expiration to 24 hours from now
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return {
        downloadUrl,
        filename,
        format,
        size,
        expiresAt
      };

    } catch (error) {
      console.error('Error exporting analytics data:', error);
      throw new Error('Failed to export analytics data');
    }
  }

  private static async getAnalyticsExportData(timeRange: any, filters: any, limit: number): Promise<any[]> {
    const whereConditions = [
      gte(activityLogs.createdAt, new Date(timeRange.startDate)),
      lte(activityLogs.createdAt, new Date(timeRange.endDate))
    ];

    if (filters.chatbotIds?.length) {
      whereConditions.push(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${filters.chatbotIds})`);
    }

    if (filters.userIds?.length) {
      whereConditions.push(sql`${activityLogs.userId} = ANY(${filters.userIds})`);
    }

    const results = await db
      .select({
        timestamp: activityLogs.createdAt,
        userId: activityLogs.userId,
        action: activityLogs.action,
        chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
        sessionId: sql<string>`${activityLogs.metadata}->>'sessionId'`,
        responseTime: sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`,
        eventData: sql<string>`${activityLogs.metadata}->>'eventData'`,
        error: sql<string>`${activityLogs.metadata}->>'error'`
      })
      .from(activityLogs)
      .where(and(...whereConditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return results.map(row => ({
      timestamp: row.timestamp?.toISOString(),
      userId: row.userId,
      action: row.action,
      chatbotId: row.chatbotId,
      sessionId: row.sessionId,
      responseTime: row.responseTime,
      eventData: row.eventData,
      hasError: !!row.error,
      errorMessage: row.error
    }));
  }

  private static async getPerformanceExportData(timeRange: any, filters: any, limit: number): Promise<any[]> {
    const whereConditions = [
      gte(activityLogs.createdAt, new Date(timeRange.startDate)),
      lte(activityLogs.createdAt, new Date(timeRange.endDate)),
      sql`${activityLogs.metadata} ? 'responseTime'`
    ];

    if (filters.chatbotIds?.length) {
      whereConditions.push(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${filters.chatbotIds})`);
    }

    const results = await db
      .select({
        timestamp: activityLogs.createdAt,
        chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
        responseTime: sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`,
        action: activityLogs.action,
        error: sql<string>`${activityLogs.metadata}->>'error'`,
        knowledgeBaseUsed: sql<boolean>`CAST(${activityLogs.metadata}->>'knowledgeBaseUsed' AS BOOLEAN)`
      })
      .from(activityLogs)
      .where(and(...whereConditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return results.map(row => ({
      timestamp: row.timestamp?.toISOString(),
      chatbotId: row.chatbotId,
      responseTime: row.responseTime,
      action: row.action,
      hasError: !!row.error,
      errorMessage: row.error,
      knowledgeBaseUsed: row.knowledgeBaseUsed || false
    }));
  }

  private static async getSessionsExportData(timeRange: any, filters: any, limit: number): Promise<any[]> {
    const sessionQuery = db
      .select({
        sessionId: sql<string>`${activityLogs.metadata}->>'sessionId'`,
        chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
        userId: activityLogs.userId,
        startTime: sql<string>`MIN(${activityLogs.createdAt})`,
        endTime: sql<string>`MAX(${activityLogs.createdAt})`,
        messageCount: count(),
        avgResponseTime: avg(sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`),
        errorCount: sum(sql<number>`CASE WHEN ${activityLogs.metadata}->>'error' IS NOT NULL THEN 1 ELSE 0 END`),
        knowledgeSearchCount: sql<number>`SUM(CASE WHEN ${activityLogs.activityType} = 'similarity_search' THEN 1 ELSE 0 END)`
      })
      .from(activityLogs)
      .where(and(
        gte(activityLogs.createdAt, new Date(timeRange.startDate)),
        lte(activityLogs.createdAt, new Date(timeRange.endDate)),
        sql`${activityLogs.metadata}->>'sessionId' IS NOT NULL`
      ))
      .groupBy(
        sql`${activityLogs.metadata}->>'sessionId'`,
        sql`${activityLogs.metadata}->>'chatbotId'`,
        activityLogs.userId
      )
      .orderBy(desc(min(activityLogs.createdAt)))
      .limit(limit);

    const results = await sessionQuery;

    return results.map(row => {
      const duration = row.endTime && row.startTime
        ? (row.endTime.getTime() - row.startTime.getTime()) / 1000
        : 0;

      return {
        sessionId: row.sessionId,
        chatbotId: row.chatbotId,
        userId: row.userId,
        startTime: row.startTime?.toISOString(),
        endTime: row.endTime?.toISOString(),
        duration,
        messageCount: row.messageCount,
        averageResponseTime: row.avgResponseTime,
        errorCount: row.errorCount,
        knowledgeSearchCount: row.knowledgeSearchCount
      };
    });
  }

  private static async getUserActivityExportData(timeRange: any, filters: any, limit: number): Promise<any[]> {
    const whereConditions = [
      gte(activityLogs.createdAt, new Date(timeRange.startDate)),
      lte(activityLogs.createdAt, new Date(timeRange.endDate))
    ];

    if (filters.userIds?.length) {
      whereConditions.push(sql`${activityLogs.userId} = ANY(${filters.userIds})`);
    }

    if (filters.chatbotIds?.length) {
      whereConditions.push(sql`${activityLogs.metadata}->>'chatbotId' = ANY(${filters.chatbotIds})`);
    }

    const results = await db
      .select({
        id: activityLogs.id,
        timestamp: activityLogs.createdAt,
        userId: activityLogs.userId,
        action: activityLogs.action,
        resourceType: activityLogs.resourceType,
        resourceId: activityLogs.resourceId,
        chatbotId: sql<string>`${activityLogs.metadata}->>'chatbotId'`,
        sessionId: sql<string>`${activityLogs.metadata}->>'sessionId'`,
        responseTime: sql<number>`CAST(${activityLogs.metadata}->>'responseTime' AS NUMERIC)`,
        userAgent: sql<string>`${activityLogs.metadata}->>'userAgent'`,
        ipAddress: sql<string>`${activityLogs.metadata}->>'ipAddress'`
      })
      .from(activityLogs)
      .where(and(...whereConditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return results.map(row => ({
      id: row.id,
      timestamp: row.timestamp?.toISOString(),
      userId: row.userId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      chatbotId: row.chatbotId,
      sessionId: row.sessionId,
      responseTime: row.responseTime,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress
    }));
  }

  private static convertToCSV(data: any[]): string {
    if (data.length === 0) {
      return '';
    }

    // Get headers from the first object
    const headers = Object.keys(data[0]);

    // Create CSV content
    const csvRows = [];

    // Add header row
    csvRows.push(headers.join(','));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        let value = row[header];

        // Handle null/undefined values
        if (value == null) {
          return '';
        }

        // Convert to string and escape if necessary
        value = String(value);

        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }

        return value;
      });

      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  // Helper methods
  private static getTimeFormat(granularity: string): string {
    switch (granularity) {
      case 'hour': return 'hour';
      case 'day': return 'day';
      case 'week': return 'week';
      case 'month': return 'month';
      case 'minute': return 'minute';
      default: return 'day';
    }
  }

  private static formatTimeLabel(timestamp: string, granularity: string): string {
    const date = new Date(timestamp);
    switch (granularity) {
      case 'hour': return date.toISOString().slice(0, 13) + ':00';
      case 'day': return date.toISOString().slice(0, 10);
      case 'week': return `Week of ${date.toISOString().slice(0, 10)}`;
      case 'month': return date.toISOString().slice(0, 7);
      case 'minute': return date.toISOString().slice(0, 16);
      default: return date.toISOString().slice(0, 10);
    }
  }

  private static calculateTrend(previousValue: number, currentValue: number): { direction: 'up' | 'down' | 'stable'; percentage: number } {
    if (previousValue === 0) {
      return { direction: 'stable', percentage: 0 };
    }

    const percentage = ((currentValue - previousValue) / previousValue) * 100;
    const threshold = 5; // 5% threshold for stability

    if (percentage > threshold) {
      return { direction: 'up', percentage };
    } else if (percentage < -threshold) {
      return { direction: 'down', percentage: Math.abs(percentage) };
    } else {
      return { direction: 'stable', percentage };
    }
  }

  private static calculateTrendPercentage(previousValue: number, currentValue: number): number {
    if (previousValue === 0) {
      return currentValue > 0 ? 100 : 0;
    }

    return ((currentValue - previousValue) / previousValue) * 100;
  }
}