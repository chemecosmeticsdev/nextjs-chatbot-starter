import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '@/lib/security/api-keys';
import { ApiUsageService } from '@/lib/services/api-usage-service';
import { PublicApiValidator } from '@/lib/validation/public-api';
import { createErrorResponse, createSuccessResponse } from '@/lib/utils/api-response';

/**
 * API Usage Analytics Endpoint
 * GET /api/v1/analytics/usage
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract API key
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return createErrorResponse('API key required', 401, {
        code: 'MISSING_API_KEY'
      });
    }

    // Verify API key and permissions
    const apiKeyData = await ApiKeyService.verifyApiKey(apiKey);
    if (!apiKeyData || (!apiKeyData.scopes.includes('read') && !apiKeyData.scopes.includes('admin'))) {
      return createErrorResponse('Invalid API key or insufficient permissions', 401, {
        code: 'UNAUTHORIZED'
      });
    }

    // Parse and validate query parameters
    const period = searchParams.get('period') || 'day';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy');
    const metrics = searchParams.get('metrics')?.split(',');
    const endpoint = searchParams.get('endpoint');
    const userId = searchParams.get('userId');
    const chatbotId = searchParams.get('chatbotId');

    const validationData = {
      period,
      startDate,
      endDate,
      groupBy,
      metrics,
      filters: {
        endpoint,
        userId,
        chatbotId
      }
    };

    const validation = PublicApiValidator.validateUsageAnalyticsRequest(validationData);
    if (!validation.success) {
      return createErrorResponse('Invalid request parameters', 400, {
        code: 'VALIDATION_ERROR',
        errors: validation.errors
      });
    }

    // Get usage statistics
    const stats = await ApiUsageService.getUsageStats(
      apiKeyData.id,
      period as 'hour' | 'day' | 'week' | 'month'
    );

    // Get usage limits and current usage
    const usageLimits = await ApiUsageService.checkUsageLimits(apiKeyData.id);

    // Get billing information
    const billing = await ApiUsageService.calculateBilling(
      apiKeyData.id,
      period === 'month' ? 'monthly' : 'daily'
    );

    const response = {
      period,
      dateRange: {
        start: startDate || 'auto',
        end: endDate || 'auto'
      },
      usage: {
        requests: {
          total: stats.totalRequests,
          byHour: stats.usageByHour
        },
        tokens: {
          total: stats.totalTokens,
          byHour: stats.usageByHour.map(h => ({
            hour: h.hour,
            tokens: h.tokens
          }))
        },
        performance: {
          averageResponseTime: stats.averageResponseTime,
          errorRate: stats.errorRate
        },
        endpoints: {
          top: stats.topEndpoints
        }
      },
      limits: {
        current: usageLimits.current,
        maximum: usageLimits.limits,
        remaining: {
          requestsPerHour: Math.max(0, usageLimits.limits.requestsPerHour - usageLimits.current.requestsPerHour),
          requestsPerDay: Math.max(0, usageLimits.limits.requestsPerDay - usageLimits.current.requestsPerDay),
          requestsPerMonth: Math.max(0, usageLimits.limits.requestsPerMonth - usageLimits.current.requestsPerMonth),
          tokensPerHour: Math.max(0, usageLimits.limits.tokensPerHour - usageLimits.current.tokensPerHour),
          tokensPerDay: Math.max(0, usageLimits.limits.tokensPerDay - usageLimits.current.tokensPerDay),
          tokensPerMonth: Math.max(0, usageLimits.limits.tokensPerMonth - usageLimits.current.tokensPerMonth)
        },
        resetTimes: usageLimits.resetTimes
      },
      billing: {
        currentPeriodCost: billing.totalCost,
        breakdown: {
          requestCost: billing.requestCost,
          tokenCost: billing.tokenCost
        },
        tier: billing.tier,
        projectedMonthlyCost: period === 'month' ? billing.totalCost : billing.totalCost * 30
      },
      metadata: {
        apiKeyId: apiKeyData.id,
        generatedAt: new Date().toISOString(),
        filters: validation.data.filters
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Usage analytics API error:', error);
    return createErrorResponse('Internal server error', 500, {
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Real-time Usage Monitoring Endpoint
 * GET /api/v1/analytics/usage/realtime
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { timeWindow = '1h', metrics = ['requests', 'tokens'] } = body;

    // Extract API key
    const apiKey = request.headers.get('x-api-key') ||
                   request.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      return createErrorResponse('API key required', 401, {
        code: 'MISSING_API_KEY'
      });
    }

    // Verify API key
    const apiKeyData = await ApiKeyService.verifyApiKey(apiKey);
    if (!apiKeyData || (!apiKeyData.scopes.includes('read') && !apiKeyData.scopes.includes('admin'))) {
      return createErrorResponse('Invalid API key or insufficient permissions', 401, {
        code: 'UNAUTHORIZED'
      });
    }

    // Get real-time usage data
    const now = new Date();
    let startTime: Date;

    switch (timeWindow) {
      case '5m':
        startTime = new Date(now.getTime() - 5 * 60 * 1000);
        break;
      case '15m':
        startTime = new Date(now.getTime() - 15 * 60 * 1000);
        break;
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }

    // Get current usage and limits
    const usageLimits = await ApiUsageService.checkUsageLimits(apiKeyData.id);
    const stats = await ApiUsageService.getUsageStats(apiKeyData.id, 'hour');

    // Calculate rate per minute for the last hour
    const ratePerMinute = stats.totalRequests / 60;
    const tokensPerMinute = stats.totalTokens / 60;

    // Health indicators
    const healthScore = calculateHealthScore(usageLimits, stats);
    const alerts = generateAlerts(usageLimits, stats, ratePerMinute);

    const response = {
      timeWindow,
      timestamp: now.toISOString(),
      realtime: {
        requestsPerMinute: Math.round(ratePerMinute),
        tokensPerMinute: Math.round(tokensPerMinute),
        averageResponseTime: stats.averageResponseTime,
        errorRate: stats.errorRate,
        activeEndpoints: stats.topEndpoints.length
      },
      capacity: {
        requestUtilization: {
          hourly: (usageLimits.current.requestsPerHour / usageLimits.limits.requestsPerHour) * 100,
          daily: (usageLimits.current.requestsPerDay / usageLimits.limits.requestsPerDay) * 100,
          monthly: (usageLimits.current.requestsPerMonth / usageLimits.limits.requestsPerMonth) * 100
        },
        tokenUtilization: {
          hourly: (usageLimits.current.tokensPerHour / usageLimits.limits.tokensPerHour) * 100,
          daily: (usageLimits.current.tokensPerDay / usageLimits.limits.tokensPerDay) * 100,
          monthly: (usageLimits.current.tokensPerMonth / usageLimits.limits.tokensPerMonth) * 100
        }
      },
      health: {
        score: healthScore,
        status: healthScore > 80 ? 'healthy' : healthScore > 60 ? 'warning' : 'critical',
        alerts
      },
      predictions: {
        hourlyBurnRate: ratePerMinute * 60,
        dailyProjection: ratePerMinute * 60 * 24,
        monthlyProjection: ratePerMinute * 60 * 24 * 30,
        limitReachTime: predictLimitReachTime(usageLimits, ratePerMinute)
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Real-time monitoring API error:', error);
    return createErrorResponse('Internal server error', 500, {
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Calculate health score based on usage patterns
 */
function calculateHealthScore(
  usageLimits: any,
  stats: any
): number {
  let score = 100;

  // Deduct points for high utilization
  const hourlyUtilization = (usageLimits.current.requestsPerHour / usageLimits.limits.requestsPerHour) * 100;
  const dailyUtilization = (usageLimits.current.requestsPerDay / usageLimits.limits.requestsPerDay) * 100;

  if (hourlyUtilization > 90) score -= 30;
  else if (hourlyUtilization > 80) score -= 20;
  else if (hourlyUtilization > 70) score -= 10;

  if (dailyUtilization > 90) score -= 30;
  else if (dailyUtilization > 80) score -= 20;
  else if (dailyUtilization > 70) score -= 10;

  // Deduct points for slow response times
  if (stats.averageResponseTime > 5000) score -= 20;
  else if (stats.averageResponseTime > 3000) score -= 10;
  else if (stats.averageResponseTime > 2000) score -= 5;

  // Deduct points for error rate
  if (stats.errorRate > 10) score -= 25;
  else if (stats.errorRate > 5) score -= 15;
  else if (stats.errorRate > 2) score -= 5;

  return Math.max(0, score);
}

/**
 * Generate alerts based on usage patterns
 */
function generateAlerts(
  usageLimits: any,
  stats: any,
  ratePerMinute: number
): Array<{ level: string; message: string; code: string }> {
  const alerts = [];

  // Usage alerts
  const hourlyUtilization = (usageLimits.current.requestsPerHour / usageLimits.limits.requestsPerHour) * 100;
  const dailyUtilization = (usageLimits.current.requestsPerDay / usageLimits.limits.requestsPerDay) * 100;

  if (hourlyUtilization > 90) {
    alerts.push({
      level: 'critical',
      message: 'Hourly rate limit almost reached (>90%)',
      code: 'HIGH_HOURLY_USAGE'
    });
  } else if (hourlyUtilization > 80) {
    alerts.push({
      level: 'warning',
      message: 'High hourly usage detected (>80%)',
      code: 'ELEVATED_HOURLY_USAGE'
    });
  }

  if (dailyUtilization > 90) {
    alerts.push({
      level: 'critical',
      message: 'Daily rate limit almost reached (>90%)',
      code: 'HIGH_DAILY_USAGE'
    });
  }

  // Performance alerts
  if (stats.averageResponseTime > 5000) {
    alerts.push({
      level: 'warning',
      message: 'High response times detected (>5s average)',
      code: 'SLOW_RESPONSE_TIME'
    });
  }

  if (stats.errorRate > 5) {
    alerts.push({
      level: 'warning',
      message: `High error rate detected (${stats.errorRate}%)`,
      code: 'HIGH_ERROR_RATE'
    });
  }

  // Rate alerts
  if (ratePerMinute > 50) {
    alerts.push({
      level: 'info',
      message: 'High traffic volume detected',
      code: 'HIGH_TRAFFIC'
    });
  }

  return alerts;
}

/**
 * Predict when limits will be reached
 */
function predictLimitReachTime(
  usageLimits: any,
  currentRatePerMinute: number
): { hourly?: string; daily?: string } | null {
  const predictions: any = {};

  // Hourly prediction
  const remainingHourlyRequests = usageLimits.limits.requestsPerHour - usageLimits.current.requestsPerHour;
  if (remainingHourlyRequests > 0 && currentRatePerMinute > 0) {
    const minutesToHourlyLimit = remainingHourlyRequests / currentRatePerMinute;
    if (minutesToHourlyLimit < 60) {
      predictions.hourly = `${Math.round(minutesToHourlyLimit)} minutes`;
    }
  }

  // Daily prediction
  const remainingDailyRequests = usageLimits.limits.requestsPerDay - usageLimits.current.requestsPerDay;
  if (remainingDailyRequests > 0 && currentRatePerMinute > 0) {
    const minutesToDailyLimit = remainingDailyRequests / currentRatePerMinute;
    if (minutesToDailyLimit < 1440) { // Less than 24 hours
      const hours = Math.floor(minutesToDailyLimit / 60);
      const minutes = Math.round(minutesToDailyLimit % 60);
      predictions.daily = `${hours}h ${minutes}m`;
    }
  }

  return Object.keys(predictions).length > 0 ? predictions : null;
}