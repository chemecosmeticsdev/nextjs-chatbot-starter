import { db } from '@/lib/db';
import { chatbotWidgetConfigs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
      const analyticsConfig = widgetConfig[0].analyticsConfig as any;
      if (!analyticsConfig?.track_events) {
        return false;
      }

      // In a real implementation, store the analytics event in a dedicated analytics table
      // For now, just log the event
      console.log('Widget analytics event tracked:', {
        chatbotId: event.chatbotId,
        eventType: event.eventType,
        eventData: event.eventData,
        userId: event.userId,
        sessionId: event.sessionId,
        domain: event.domain,
        pageUrl: event.pageUrl,
        userAgent: event.userAgent,
        referrer: event.referrer,
        timestamp: event.timestamp
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

    // Generate analytics data (in a real implementation, this would query actual analytics tables)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dailyData = this.generateMockDailyData(days);

    // Calculate summary metrics
    const summary: WidgetAnalyticsSummary = {
      total_conversations: dailyData.reduce((sum, day) => sum + day.conversations, 0),
      total_unique_visitors: dailyData.reduce((sum, day) => sum + day.unique_visitors, 0),
      total_messages: dailyData.reduce((sum, day) => sum + day.messages, 0),
      avg_response_time: Math.round(dailyData.reduce((sum, day) => sum + day.avg_response_time, 0) / dailyData.length),
      avg_satisfaction: Math.round((dailyData.reduce((sum, day) => sum + day.satisfaction_score, 0) / dailyData.length) * 100) / 100,
      avg_bounce_rate: Math.round((dailyData.reduce((sum, day) => sum + day.bounce_rate, 0) / dailyData.length) * 100) / 100,
      avg_conversion_rate: Math.round((dailyData.reduce((sum, day) => sum + day.conversion_rate, 0) / dailyData.length) * 100) / 100
    };

    return {
      timeRange: query.timeRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary,
      dailyData,
      topDomains: this.generateMockTopDomains(),
      topPages: this.generateMockTopPages(),
      realTimeMetrics: this.generateMockRealTimeMetrics(),
      userBehavior: this.generateMockUserBehavior(),
      widgetConfig: {
        status: widgetConfig[0].status,
        version: widgetConfig[0].version,
        lastUpdated: widgetConfig[0].updatedAt
      }
    };
  }

  /**
   * Get real-time analytics metrics
   */
  static async getRealTimeMetrics(chatbotId: string): Promise<any> {
    // Verify widget configuration exists
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      throw new Error('Widget configuration not found');
    }

    // In a real implementation, this would query real-time analytics data
    return this.generateMockRealTimeMetrics();
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