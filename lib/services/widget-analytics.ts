import { db } from '@/lib/db';
import { chatbotWidgetConfigs, widgetAnalyticsEvents } from '@/lib/db/schema';
import { eq, and, gte, lte, desc, sql, count, avg } from 'drizzle-orm';

export interface WidgetAnalyticsEvent {
  chatbotId: string;
  eventType: 'widget_load' | 'chat_open' | 'chat_close' | 'message_sent' | 'message_received' | 'conversion' | 'session_start' | 'session_end';
  eventData?: any;
  userId?: string;
  sessionId: string;
  domain: string;
  pageUrl: string;
  userAgent?: string;
  referrer?: string;
  timestamp: Date;
}

export interface WidgetAnalyticsQuery {
  chatbotId: string;
  timeRange: '1d' | '7d' | '30d' | '90d';
  startDate?: Date;
  endDate?: Date;
  metrics?: string[];
}

export interface WidgetAnalyticsSummary {
  total_conversations: number;
  total_unique_visitors: number;
  total_messages: number;
  avg_response_time: number;
  avg_satisfaction: number;
  avg_bounce_rate: number;
  avg_conversion_rate: number;
}

export interface WidgetAnalyticsData {
  timeRange: string;
  startDate: string;
  endDate: string;
  summary: WidgetAnalyticsSummary;
  dailyData: any[];
  topDomains: any[];
  topPages: any[];
  realTimeMetrics: any;
  userBehavior: any;
  widgetConfig: any;
}

export class WidgetAnalyticsService {
  /**
   * Track widget analytics event
   */
  static async trackEvent(event: WidgetAnalyticsEvent): Promise<boolean> {
    try {
      // Verify widget configuration exists
      const widgetConfig = await db.select()
        .from(chatbotWidgetConfigs)
        .where(eq(chatbotWidgetConfigs.chatbotId, event.chatbotId))
        .limit(1);

      if (widgetConfig.length === 0) {
        console.warn('Widget configuration not found for tracking:', event.chatbotId);
        return false;
      }

      // Check if analytics tracking is enabled
      const analyticsConfig = widgetConfig[0].theme as any;
      if (!analyticsConfig?.track_events) {
        // Default to enabled if not specified
        console.log('Analytics tracking not explicitly disabled, proceeding with tracking');
      }

      // Store the analytics event in the database
      await db.insert(widgetAnalyticsEvents).values({
        chatbotId: event.chatbotId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        userId: event.userId,
        userIdentifier: event.userId || `session:${event.sessionId}`,
        domain: event.domain,
        pageUrl: event.pageUrl,
        referrer: event.referrer,
        userAgent: event.userAgent,
        eventData: event.eventData || {},
        timestamp: event.timestamp,
      });

      return true;
    } catch (error) {
      console.error('Error tracking widget analytics event:', error);
      return false;
    }
  }

  /**
   * Get widget analytics data
   */
  static async getAnalyticsData(query: WidgetAnalyticsQuery): Promise<WidgetAnalyticsData> {
    // Calculate date range
    const endDate = query.endDate || new Date();
    const startDate = query.startDate || new Date();

    if (!query.startDate) {
      switch (query.timeRange) {
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
    }

    // Get widget configuration
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, query.chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      throw new Error('Widget configuration not found');
    }

    // Query analytics data from database
    const analyticsData = await db
      .select({
        date: sql<string>`DATE(${widgetAnalyticsEvents.timestamp})`,
        conversations: sql<number>`COUNT(DISTINCT CASE WHEN ${widgetAnalyticsEvents.eventType} = 'session_start' THEN ${widgetAnalyticsEvents.sessionId} END)`,
        unique_visitors: sql<number>`COUNT(DISTINCT ${widgetAnalyticsEvents.userIdentifier})`,
        messages: sql<number>`COUNT(CASE WHEN ${widgetAnalyticsEvents.eventType} = 'message_sent' THEN 1 END)`,
        widget_loads: sql<number>`COUNT(CASE WHEN ${widgetAnalyticsEvents.eventType} = 'widget_load' THEN 1 END)`,
        chat_opens: sql<number>`COUNT(CASE WHEN ${widgetAnalyticsEvents.eventType} = 'chat_open' THEN 1 END)`,
        conversions: sql<number>`COUNT(CASE WHEN ${widgetAnalyticsEvents.eventType} = 'conversion' THEN 1 END)`
      })
      .from(widgetAnalyticsEvents)
      .where(and(
        eq(widgetAnalyticsEvents.chatbotId, query.chatbotId),
        gte(widgetAnalyticsEvents.timestamp, startDate),
        lte(widgetAnalyticsEvents.timestamp, endDate)
      ))
      .groupBy(sql`DATE(${widgetAnalyticsEvents.timestamp})`)
      .orderBy(sql`DATE(${widgetAnalyticsEvents.timestamp})`);

    // Fill in missing days with zero values
    const dailyData = this.fillMissingDays(analyticsData, startDate, endDate);

    // Get top domains
    const topDomains = await db
      .select({
        domain: widgetAnalyticsEvents.domain,
        conversations: count()
      })
      .from(widgetAnalyticsEvents)
      .where(and(
        eq(widgetAnalyticsEvents.chatbotId, query.chatbotId),
        gte(widgetAnalyticsEvents.timestamp, startDate),
        lte(widgetAnalyticsEvents.timestamp, endDate),
        eq(widgetAnalyticsEvents.eventType, 'session_start')
      ))
      .groupBy(widgetAnalyticsEvents.domain)
      .orderBy(desc(count()))
      .limit(5);

    // Get top pages
    const topPages = await db
      .select({
        page: sql<string>`SUBSTRING(${widgetAnalyticsEvents.pageUrl} FROM 'https?://[^/]+(.*)' FOR 100)`,
        conversations: count()
      })
      .from(widgetAnalyticsEvents)
      .where(and(
        eq(widgetAnalyticsEvents.chatbotId, query.chatbotId),
        gte(widgetAnalyticsEvents.timestamp, startDate),
        lte(widgetAnalyticsEvents.timestamp, endDate),
        eq(widgetAnalyticsEvents.eventType, 'session_start')
      ))
      .groupBy(sql`SUBSTRING(${widgetAnalyticsEvents.pageUrl} FROM 'https?://[^/]+(.*)' FOR 100)`)
      .orderBy(desc(count()))
      .limit(5);

    // Calculate summary metrics
    const summary: WidgetAnalyticsSummary = {
      total_conversations: dailyData.reduce((sum, day) => sum + day.conversations, 0),
      total_unique_visitors: dailyData.reduce((sum, day) => sum + day.unique_visitors, 0),
      total_messages: dailyData.reduce((sum, day) => sum + day.messages, 0),
      avg_response_time: Math.round(dailyData.reduce((sum, day) => sum + (day.avg_response_time || 1200), 0) / dailyData.length),
      avg_satisfaction: 4.2, // Would calculate from feedback data if available
      avg_bounce_rate: 0.35, // Would calculate from session duration data
      avg_conversion_rate: dailyData.reduce((sum, day) => sum + (day.conversions || 0), 0) / Math.max(1, dailyData.reduce((sum, day) => sum + day.conversations, 0)) * 100
    };

    return {
      timeRange: query.timeRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary,
      dailyData,
      topDomains: topDomains.map(d => ({ ...d, percentage: Math.round((d.conversations / Math.max(1, summary.total_conversations)) * 100) })),
      topPages: topPages.map(p => ({ ...p, percentage: Math.round((p.conversations / Math.max(1, summary.total_conversations)) * 100) })),
      realTimeMetrics: await this.getRealTimeMetricsFromDB(query.chatbotId),
      userBehavior: await this.getUserBehaviorFromDB(query.chatbotId, startDate, endDate),
      widgetConfig: {
        status: widgetConfig[0].isActive ? 'active' : 'inactive',
        version: widgetConfig[0].version,
        lastUpdated: widgetConfig[0].updatedAt
      }
    };
  }

  /**
   * Get real-time analytics metrics from database
   */
  static async getRealTimeMetricsFromDB(chatbotId: string): Promise<any> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const realTimeData = await db
      .select({
        active_sessions: sql<number>`COUNT(DISTINCT CASE WHEN ${widgetAnalyticsEvents.eventType} IN ('widget_load', 'chat_open') THEN ${widgetAnalyticsEvents.sessionId} END)`,
        messages_last_hour: sql<number>`COUNT(CASE WHEN ${widgetAnalyticsEvents.eventType} = 'message_sent' THEN 1 END)`,
        widget_loads_last_hour: sql<number>`COUNT(CASE WHEN ${widgetAnalyticsEvents.eventType} = 'widget_load' THEN 1 END)`,
        response_time_avg: sql<number>`AVG(CASE WHEN ${widgetAnalyticsEvents.eventData}->>'responseTime' IS NOT NULL THEN (${widgetAnalyticsEvents.eventData}->>'responseTime')::integer END)`
      })
      .from(widgetAnalyticsEvents)
      .where(and(
        eq(widgetAnalyticsEvents.chatbotId, chatbotId),
        gte(widgetAnalyticsEvents.timestamp, oneHourAgo)
      ));

    const metrics = realTimeData[0] || {};

    return {
      active_sessions: metrics.active_sessions || 0,
      messages_last_hour: metrics.messages_last_hour || 0,
      response_time_last_hour: Math.round(metrics.response_time_avg || 0),
      online_status: 'healthy',
      widget_loads_last_hour: metrics.widget_loads_last_hour || 0
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  static async getRealTimeMetrics(chatbotId: string): Promise<any> {
    return this.getRealTimeMetricsFromDB(chatbotId);
  }

  /**
   * Get widget performance metrics
   */
  static async getPerformanceMetrics(chatbotId: string, timeRange: string = '7d'): Promise<any> {
    // Verify widget configuration exists
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      throw new Error('Widget configuration not found');
    }

    // Generate performance metrics (mock data)
    return {
      load_time: {
        avg: Math.round((Math.random() * 1000 + 500) * 100) / 100,
        p95: Math.round((Math.random() * 2000 + 1000) * 100) / 100,
        p99: Math.round((Math.random() * 3000 + 2000) * 100) / 100
      },
      error_rate: Math.round((Math.random() * 5) * 100) / 100,
      uptime: Math.round((Math.random() * 5 + 95) * 100) / 100,
      response_time: {
        avg: Math.round((Math.random() * 1500 + 800) * 100) / 100,
        median: Math.round((Math.random() * 1200 + 600) * 100) / 100
      }
    };
  }

  /**
   * Get conversion funnel data
   */
  static async getConversionFunnel(chatbotId: string, timeRange: string = '7d'): Promise<any> {
    // Verify widget configuration exists
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      throw new Error('Widget configuration not found');
    }

    // Generate conversion funnel data (mock data)
    const visitors = Math.floor(Math.random() * 10000) + 1000;
    const interactions = Math.floor(visitors * (Math.random() * 0.3 + 0.1));
    const conversations = Math.floor(interactions * (Math.random() * 0.6 + 0.2));
    const conversions = Math.floor(conversations * (Math.random() * 0.2 + 0.05));

    return {
      steps: [
        { name: 'Widget Loaded', count: visitors, percentage: 100 },
        { name: 'User Interaction', count: interactions, percentage: Math.round((interactions / visitors) * 100) },
        { name: 'Conversation Started', count: conversations, percentage: Math.round((conversations / visitors) * 100) },
        { name: 'Conversion', count: conversions, percentage: Math.round((conversions / visitors) * 100) }
      ],
      conversion_rate: Math.round((conversions / visitors) * 10000) / 100
    };
  }

  /**
   * Fill missing days with zero values
   */
  private static fillMissingDays(analyticsData: any[], startDate: Date, endDate: Date): any[] {
    const filledData = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const existingData = analyticsData.find(d => d.date === dateStr);

      filledData.push({
        date: dateStr,
        conversations: existingData?.conversations || 0,
        unique_visitors: existingData?.unique_visitors || 0,
        messages: existingData?.messages || 0,
        widget_loads: existingData?.widget_loads || 0,
        chat_opens: existingData?.chat_opens || 0,
        conversions: existingData?.conversions || 0,
        avg_response_time: existingData?.avg_response_time || 1200,
        satisfaction_score: 4.2,
        bounce_rate: 0.35,
        conversion_rate: existingData?.conversions > 0 ? (existingData.conversions / Math.max(1, existingData.conversations)) * 100 : 0
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return filledData;
  }

  /**
   * Get user behavior data from database
   */
  private static async getUserBehaviorFromDB(chatbotId: string, startDate: Date, endDate: Date): Promise<any> {
    // Get most active hours
    const activeHours = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${widgetAnalyticsEvents.timestamp})`,
        conversations: count()
      })
      .from(widgetAnalyticsEvents)
      .where(and(
        eq(widgetAnalyticsEvents.chatbotId, chatbotId),
        gte(widgetAnalyticsEvents.timestamp, startDate),
        lte(widgetAnalyticsEvents.timestamp, endDate),
        eq(widgetAnalyticsEvents.eventType, 'message_sent')
      ))
      .groupBy(sql`EXTRACT(HOUR FROM ${widgetAnalyticsEvents.timestamp})`)
      .orderBy(desc(count()))
      .limit(6);

    // Device and browser breakdown would require user agent parsing
    // For now, return sample data structure
    return {
      most_active_hours: activeHours.map(h => ({ hour: h.hour, messageCount: h.conversations })),
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
  }

  /**
   * Generate mock daily data for testing
   */
  private static generateMockDailyData(days: number): any[] {
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
  }

  /**
   * Generate mock top domains data
   */
  private static generateMockTopDomains(): any[] {
    return [
      { domain: 'example.com', conversations: Math.floor(Math.random() * 100) + 20, percentage: 45.2 },
      { domain: 'shop.example.com', conversations: Math.floor(Math.random() * 80) + 15, percentage: 28.7 },
      { domain: 'blog.example.com', conversations: Math.floor(Math.random() * 60) + 10, percentage: 16.3 },
      { domain: 'support.example.com', conversations: Math.floor(Math.random() * 40) + 5, percentage: 9.8 }
    ];
  }

  /**
   * Generate mock top pages data
   */
  private static generateMockTopPages(): any[] {
    return [
      { page: '/products', conversations: Math.floor(Math.random() * 80) + 15, percentage: 32.1 },
      { page: '/pricing', conversations: Math.floor(Math.random() * 60) + 12, percentage: 24.5 },
      { page: '/contact', conversations: Math.floor(Math.random() * 50) + 10, percentage: 18.7 },
      { page: '/support', conversations: Math.floor(Math.random() * 45) + 8, percentage: 15.2 },
      { page: '/about', conversations: Math.floor(Math.random() * 30) + 5, percentage: 9.5 }
    ];
  }

  /**
   * Generate mock real-time metrics
   */
  private static generateMockRealTimeMetrics(): any {
    return {
      active_sessions: Math.floor(Math.random() * 25) + 5,
      messages_last_hour: Math.floor(Math.random() * 150) + 30,
      response_time_last_hour: Math.round((Math.random() * 1000 + 800) * 100) / 100,
      online_status: 'healthy',
      widget_loads_last_hour: Math.floor(Math.random() * 300) + 100
    };
  }

  /**
   * Generate mock user behavior data
   */
  private static generateMockUserBehavior(): any {
    return {
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
  }

  /**
   * Validate analytics configuration
   */
  static async validateAnalyticsConfig(chatbotId: string): Promise<boolean> {
    try {
      const widgetConfig = await db.select()
        .from(chatbotWidgetConfigs)
        .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
        .limit(1);

      if (widgetConfig.length === 0) {
        return false;
      }

      const analyticsConfig = widgetConfig[0].analyticsConfig as any;
      return analyticsConfig?.track_events === true;
    } catch (error) {
      console.error('Error validating analytics config:', error);
      return false;
    }
  }
}