import { db } from '@/lib/db';
import { apiUsage, apiUsageLimits, apiUsageQuotas } from '@/lib/db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

export interface UsageData {
  endpoint: string;
  method: string;
  chatbotId?: string;
  userId?: string;
  messageLength?: number;
  tokensUsed?: number;
  responseTime?: number;
  metadata?: Record<string, any>;
}

export interface UsageLimit {
  requestsPerHour: number;
  requestsPerDay: number;
  requestsPerMonth: number;
  tokensPerHour: number;
  tokensPerDay: number;
  tokensPerMonth: number;
}

export interface UsageQuota {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  period: 'daily' | 'monthly' | 'yearly';
  resetDate: Date;
}

export interface BillingData {
  requestCost: number;
  tokenCost: number;
  totalCost: number;
  tier: 'free' | 'basic' | 'premium' | 'enterprise';
}

export class ApiUsageService {
  /**
   * Track API usage for billing and analytics
   */
  static async trackUsage(apiKeyId: string, data: UsageData): Promise<void> {
    try {
      const now = new Date();

      await db.insert(apiUsage).values({
        apiKeyId,
        endpoint: data.endpoint,
        method: data.method,
        chatbotId: data.chatbotId || null,
        userId: data.userId || null,
        messageLength: data.messageLength || null,
        tokensUsed: data.tokensUsed || null,
        responseTime: data.responseTime || null,
        metadata: data.metadata || {},
        timestamp: now,
        createdAt: now
      });

      // Update usage counters (for real-time monitoring)
      await this.updateUsageCounters(apiKeyId, data);

    } catch (error) {
      console.error('Failed to track API usage:', error);
      // Don't throw - tracking failures shouldn't break the API
    }
  }

  /**
   * Check if API key is within usage limits
   */
  static async checkUsageLimits(apiKeyId: string): Promise<{
    allowed: boolean;
    limits: UsageLimit;
    current: UsageLimit;
    resetTimes: {
      hourly: Date;
      daily: Date;
      monthly: Date;
    };
  }> {
    try {
      // Get usage limits for the API key
      const limits = await this.getUsageLimits(apiKeyId);

      // Get current usage
      const current = await this.getCurrentUsage(apiKeyId);

      // Calculate reset times
      const now = new Date();
      const resetTimes = {
        hourly: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1),
        daily: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        monthly: new Date(now.getFullYear(), now.getMonth() + 1, 1)
      };

      // Check if within limits
      const allowed =
        current.requestsPerHour < limits.requestsPerHour &&
        current.requestsPerDay < limits.requestsPerDay &&
        current.requestsPerMonth < limits.requestsPerMonth &&
        current.tokensPerHour < limits.tokensPerHour &&
        current.tokensPerDay < limits.tokensPerDay &&
        current.tokensPerMonth < limits.tokensPerMonth;

      return {
        allowed,
        limits,
        current,
        resetTimes
      };

    } catch (error) {
      console.error('Failed to check usage limits:', error);
      // Default to allowing requests if check fails
      return {
        allowed: true,
        limits: this.getDefaultLimits(),
        current: this.getZeroUsage(),
        resetTimes: {
          hourly: new Date(),
          daily: new Date(),
          monthly: new Date()
        }
      };
    }
  }

  /**
   * Get usage statistics for an API key
   */
  static async getUsageStats(apiKeyId: string, period: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<{
    totalRequests: number;
    totalTokens: number;
    averageResponseTime: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    errorRate: number;
    usageByHour: Array<{ hour: string; requests: number; tokens: number }>;
  }> {
    try {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'hour':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      // Get total stats
      const totalStats = await db
        .select({
          totalRequests: sql<number>`count(*)`,
          totalTokens: sql<number>`sum(coalesce(tokens_used, 0))`,
          averageResponseTime: sql<number>`avg(coalesce(response_time, 0))`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, startDate)
        ));

      // Get top endpoints
      const topEndpoints = await db
        .select({
          endpoint: apiUsage.endpoint,
          count: sql<number>`count(*)`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, startDate)
        ))
        .groupBy(apiUsage.endpoint)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      // Get usage by hour (simplified - would need more complex query for actual hourly breakdown)
      const usageByHour = await db
        .select({
          hour: sql<string>`date_trunc('hour', timestamp)`,
          requests: sql<number>`count(*)`,
          tokens: sql<number>`sum(coalesce(tokens_used, 0))`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, startDate)
        ))
        .groupBy(sql`date_trunc('hour', timestamp)`)
        .orderBy(sql`date_trunc('hour', timestamp)`);

      const stats = totalStats[0] || { totalRequests: 0, totalTokens: 0, averageResponseTime: 0 };

      return {
        totalRequests: Number(stats.totalRequests),
        totalTokens: Number(stats.totalTokens),
        averageResponseTime: Number(stats.averageResponseTime),
        topEndpoints: topEndpoints.map(e => ({
          endpoint: e.endpoint,
          count: Number(e.count)
        })),
        errorRate: 0, // Would need error tracking to calculate this
        usageByHour: usageByHour.map(u => ({
          hour: u.hour,
          requests: Number(u.requests),
          tokens: Number(u.tokens)
        }))
      };

    } catch (error) {
      console.error('Failed to get usage stats:', error);
      return {
        totalRequests: 0,
        totalTokens: 0,
        averageResponseTime: 0,
        topEndpoints: [],
        errorRate: 0,
        usageByHour: []
      };
    }
  }

  /**
   * Calculate billing data for an API key
   */
  static async calculateBilling(apiKeyId: string, period: 'daily' | 'monthly' = 'monthly'): Promise<BillingData> {
    try {
      const now = new Date();
      const startDate = period === 'monthly'
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const usage = await db
        .select({
          totalRequests: sql<number>`count(*)`,
          totalTokens: sql<number>`sum(coalesce(tokens_used, 0))`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, startDate)
        ));

      const stats = usage[0] || { totalRequests: 0, totalTokens: 0 };

      // Simple billing calculation (would be more complex in production)
      const requestCost = Number(stats.totalRequests) * 0.001; // $0.001 per request
      const tokenCost = Number(stats.totalTokens) * 0.00001; // $0.00001 per token
      const totalCost = requestCost + tokenCost;

      // Determine tier based on usage (simplified)
      let tier: BillingData['tier'] = 'free';
      if (totalCost > 100) tier = 'enterprise';
      else if (totalCost > 20) tier = 'premium';
      else if (totalCost > 5) tier = 'basic';

      return {
        requestCost,
        tokenCost,
        totalCost,
        tier
      };

    } catch (error) {
      console.error('Failed to calculate billing:', error);
      return {
        requestCost: 0,
        tokenCost: 0,
        totalCost: 0,
        tier: 'free'
      };
    }
  }

  /**
   * Get or create usage limits for an API key
   */
  private static async getUsageLimits(apiKeyId: string): Promise<UsageLimit> {
    try {
      const limits = await db
        .select()
        .from(apiUsageLimits)
        .where(eq(apiUsageLimits.apiKeyId, apiKeyId))
        .limit(1);

      if (limits.length > 0) {
        const limit = limits[0];
        return {
          requestsPerHour: limit.requestsPerHour,
          requestsPerDay: limit.requestsPerDay,
          requestsPerMonth: limit.requestsPerMonth,
          tokensPerHour: limit.tokensPerHour,
          tokensPerDay: limit.tokensPerDay,
          tokensPerMonth: limit.tokensPerMonth
        };
      }

      // Create default limits
      const defaultLimits = this.getDefaultLimits();
      await db.insert(apiUsageLimits).values({
        apiKeyId,
        ...defaultLimits,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return defaultLimits;

    } catch (error) {
      console.error('Failed to get usage limits:', error);
      return this.getDefaultLimits();
    }
  }

  /**
   * Get current usage for an API key
   */
  private static async getCurrentUsage(apiKeyId: string): Promise<UsageLimit> {
    try {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get hourly usage
      const hourlyUsage = await db
        .select({
          requests: sql<number>`count(*)`,
          tokens: sql<number>`sum(coalesce(tokens_used, 0))`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, hourAgo)
        ));

      // Get daily usage
      const dailyUsage = await db
        .select({
          requests: sql<number>`count(*)`,
          tokens: sql<number>`sum(coalesce(tokens_used, 0))`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, dayAgo)
        ));

      // Get monthly usage
      const monthlyUsage = await db
        .select({
          requests: sql<number>`count(*)`,
          tokens: sql<number>`sum(coalesce(tokens_used, 0))`
        })
        .from(apiUsage)
        .where(and(
          eq(apiUsage.apiKeyId, apiKeyId),
          gte(apiUsage.timestamp, monthAgo)
        ));

      const hourly = hourlyUsage[0] || { requests: 0, tokens: 0 };
      const daily = dailyUsage[0] || { requests: 0, tokens: 0 };
      const monthly = monthlyUsage[0] || { requests: 0, tokens: 0 };

      return {
        requestsPerHour: Number(hourly.requests),
        requestsPerDay: Number(daily.requests),
        requestsPerMonth: Number(monthly.requests),
        tokensPerHour: Number(hourly.tokens),
        tokensPerDay: Number(daily.tokens),
        tokensPerMonth: Number(monthly.tokens)
      };

    } catch (error) {
      console.error('Failed to get current usage:', error);
      return this.getZeroUsage();
    }
  }

  /**
   * Update usage counters (for caching/performance)
   */
  private static async updateUsageCounters(apiKeyId: string, data: UsageData): Promise<void> {
    // This could update Redis counters or database aggregates for performance
    // For now, we'll rely on real-time queries
  }

  /**
   * Get default usage limits
   */
  private static getDefaultLimits(): UsageLimit {
    return {
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      requestsPerMonth: 100000,
      tokensPerHour: 100000,
      tokensPerDay: 1000000,
      tokensPerMonth: 10000000
    };
  }

  /**
   * Get zero usage for initialization
   */
  private static getZeroUsage(): UsageLimit {
    return {
      requestsPerHour: 0,
      requestsPerDay: 0,
      requestsPerMonth: 0,
      tokensPerHour: 0,
      tokensPerDay: 0,
      tokensPerMonth: 0
    };
  }
}