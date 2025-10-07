import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiHandler, CommonSchemas, ErrorCodes, ApiError, type ApiContext } from '../handler';
import { performanceMonitor, MetricType, AlertLevel } from '@/lib/services/performance-monitor';

// GET /api/monitoring/health
export const getSystemHealthHandler = createApiHandler(
  {
    method: 'GET',
    auth: {
      required: true,
      roles: ['admin'], // Only admins can view system health
    },
    cache: {
      ttl: 30, // 30 seconds for health data
    },
    rateLimit: {
      windowMs: 60000,
      max: 60,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    try {
      const healthStatus = await performanceMonitor.checkSystemHealth();

      return {
        health: healthStatus,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to check system health: ${error.message}`
      );
    }
  }
);

// GET /api/monitoring/metrics
export const getPerformanceMetricsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      query: z.object({
        timeRange: z.enum(['5m', '1h', '6h', '24h', '7d']).default('1h'),
        type: z.nativeEnum(MetricType).optional(),
        source: z.string().min(1).max(100).optional(),
        chatbotId: z.string().uuid().optional(),
        success: z.coerce.boolean().optional(),
        groupBy: z.enum(['type', 'source', 'hour']).default('type'),
      }),
    },
    auth: {
      required: true,
      roles: ['admin'],
    },
    cache: {
      ttl: 300, // 5 minutes for metrics data
    },
    rateLimit: {
      windowMs: 60000,
      max: 30,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { timeRange, type, source, chatbotId, success, groupBy } = context.validatedQuery;

    try {
      const endTime = new Date();
      const startTime = getStartTimeFromRange(timeRange, endTime);

      // Get raw metrics
      const metrics = performanceMonitor.getMetrics(
        { start: startTime, end: endTime },
        { type, source, chatbotId, success }
      );

      // Get aggregated statistics
      const stats = performanceMonitor.getPerformanceStats(
        { start: startTime, end: endTime },
        groupBy
      );

      // Calculate trends
      const trends = calculateMetricTrends(metrics, timeRange);

      return {
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          range: timeRange
        },
        filters: { type, source, chatbotId, success },
        metrics: {
          total: metrics.length,
          successful: metrics.filter(m => m.success).length,
          failed: metrics.filter(m => !m.success).length,
          avgDuration: metrics.length > 0 ?
            Math.round(metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length) : 0
        },
        stats,
        trends,
        groupBy
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get performance metrics: ${error.message}`
      );
    }
  }
);

// GET /api/monitoring/alerts
export const getAlertsHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      query: z.object({
        level: z.nativeEnum(AlertLevel).optional(),
        resolved: z.coerce.boolean().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
        source: z.string().min(1).max(100).optional(),
      }),
    },
    auth: {
      required: true,
      roles: ['admin'],
    },
    cache: {
      ttl: 60, // 1 minute for alerts
    },
    rateLimit: {
      windowMs: 60000,
      max: 60,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { level, resolved, limit, source } = context.validatedQuery;

    try {
      let alerts = performanceMonitor.getActiveAlerts(level);

      // Apply filters
      if (resolved !== undefined) {
        alerts = alerts.filter(alert => alert.resolved === resolved);
      }

      if (source) {
        alerts = alerts.filter(alert => alert.source === source);
      }

      // Apply limit
      alerts = alerts.slice(0, limit);

      // Get alert statistics
      const allAlerts = performanceMonitor.getActiveAlerts();
      const alertStats = {
        total: allAlerts.length,
        byLevel: {
          critical: allAlerts.filter(a => a.level === AlertLevel.CRITICAL).length,
          error: allAlerts.filter(a => a.level === AlertLevel.ERROR).length,
          warning: allAlerts.filter(a => a.level === AlertLevel.WARNING).length,
          info: allAlerts.filter(a => a.level === AlertLevel.INFO).length,
        },
        resolved: allAlerts.filter(a => a.resolved).length,
        unresolved: allAlerts.filter(a => !a.resolved).length
      };

      return {
        alerts,
        stats: alertStats,
        filters: { level, resolved, source },
        pagination: {
          limit,
          returned: alerts.length,
          hasMore: allAlerts.length > limit
        }
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get alerts: ${error.message}`
      );
    }
  }
);

// POST /api/monitoring/alerts/[alertId]/resolve
export const resolveAlertHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      params: z.object({
        alertId: z.string().min(1),
      }),
    },
    auth: {
      required: true,
      roles: ['admin'],
    },
    rateLimit: {
      windowMs: 60000,
      max: 100,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { alertId } = context.validatedParams;

    try {
      await performanceMonitor.resolveAlert(alertId);

      return {
        alertId,
        message: 'Alert resolved successfully',
        resolvedAt: new Date().toISOString(),
        resolvedBy: context.userId
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to resolve alert: ${error.message}`
      );
    }
  }
);

// GET /api/monitoring/realtime
export const getRealtimeMetricsHandler = createApiHandler(
  {
    method: 'GET',
    auth: {
      required: true,
      roles: ['admin'],
    },
    cache: {
      ttl: 10, // 10 seconds for real-time data
    },
    rateLimit: {
      windowMs: 60000,
      max: 300, // Higher limit for real-time dashboard
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    try {
      const realtimeData = await performanceMonitor.getRealtimeMetrics();

      return {
        realtime: realtimeData,
        timestamp: new Date().toISOString(),
        refreshIntervalSec: 10
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get real-time metrics: ${error.message}`
      );
    }
  }
);

// GET /api/monitoring/performance/[chatbotId]
export const getChatbotPerformanceHandler = createApiHandler(
  {
    method: 'GET',
    validation: {
      params: CommonSchemas.chatbotId,
      query: z.object({
        timeRange: z.enum(['1h', '6h', '24h', '7d']).default('24h'),
        metrics: z.array(z.enum(['response_time', 'throughput', 'errors', 'ai_generation'])).default(['response_time', 'throughput', 'errors']),
      }),
    },
    auth: {
      required: true,
    },
    cache: {
      ttl: 300, // 5 minutes for chatbot performance
    },
    rateLimit: {
      windowMs: 60000,
      max: 60,
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { chatbotId } = context.validatedParams;
    const { timeRange, metrics } = context.validatedQuery;

    try {
      const endTime = new Date();
      const startTime = getStartTimeFromRange(timeRange, endTime);

      const chatbotMetrics = performanceMonitor.getMetrics(
        { start: startTime, end: endTime },
        { chatbotId }
      );

      const performanceData = {
        chatbotId,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          range: timeRange
        },
        metrics: {} as Record<string, any>
      };

      // Calculate requested metrics
      if (metrics.includes('response_time')) {
        const aiMetrics = chatbotMetrics.filter(m => m.type === MetricType.AI_GENERATION);
        performanceData.metrics.response_time = {
          avg: aiMetrics.length > 0 ?
            Math.round(aiMetrics.reduce((sum, m) => sum + m.duration, 0) / aiMetrics.length) : 0,
          min: aiMetrics.length > 0 ? Math.min(...aiMetrics.map(m => m.duration)) : 0,
          max: aiMetrics.length > 0 ? Math.max(...aiMetrics.map(m => m.duration)) : 0,
          p95: calculatePercentile(aiMetrics.map(m => m.duration), 0.95)
        };
      }

      if (metrics.includes('throughput')) {
        const httpMetrics = chatbotMetrics.filter(m => m.type === MetricType.HTTP_REQUEST);
        const hoursInRange = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        performanceData.metrics.throughput = {
          requestsPerHour: Math.round(httpMetrics.length / hoursInRange),
          conversationsPerHour: Math.round(
            chatbotMetrics.filter(m => m.type === MetricType.USER_ACTION && m.name === 'start_conversation').length / hoursInRange
          )
        };
      }

      if (metrics.includes('errors')) {
        const errorMetrics = chatbotMetrics.filter(m => !m.success);
        const errorRate = chatbotMetrics.length > 0 ?
          (errorMetrics.length / chatbotMetrics.length) * 100 : 0;

        const errorTypes: Record<string, number> = {};
        errorMetrics.forEach(m => {
          const errorType = m.error || 'Unknown Error';
          errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
        });

        performanceData.metrics.errors = {
          rate: Number(errorRate.toFixed(2)),
          count: errorMetrics.length,
          types: Object.entries(errorTypes)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([type, count]) => ({ type, count }))
        };
      }

      if (metrics.includes('ai_generation')) {
        const aiMetrics = chatbotMetrics.filter(m => m.type === MetricType.AI_GENERATION);
        const vectorMetrics = chatbotMetrics.filter(m => m.type === MetricType.VECTOR_SEARCH);

        performanceData.metrics.ai_generation = {
          totalGenerations: aiMetrics.length,
          successRate: aiMetrics.length > 0 ?
            Number(((aiMetrics.filter(m => m.success).length / aiMetrics.length) * 100).toFixed(2)) : 0,
          avgGenerationTime: aiMetrics.length > 0 ?
            Math.round(aiMetrics.reduce((sum, m) => sum + m.duration, 0) / aiMetrics.length) : 0,
          vectorSearches: vectorMetrics.length,
          avgVectorSearchTime: vectorMetrics.length > 0 ?
            Math.round(vectorMetrics.reduce((sum, m) => sum + m.duration, 0) / vectorMetrics.length) : 0
        };
      }

      return performanceData;

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get chatbot performance: ${error.message}`
      );
    }
  }
);

// POST /api/monitoring/test-alert
export const createTestAlertHandler = createApiHandler(
  {
    method: 'POST',
    validation: {
      body: z.object({
        level: z.nativeEnum(AlertLevel).default(AlertLevel.INFO),
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(1000),
        source: z.string().min(1).max(100).default('test'),
      }),
    },
    auth: {
      required: true,
      roles: ['admin'],
    },
    rateLimit: {
      windowMs: 300000, // 5 minutes
      max: 10, // Limit test alerts
    },
  },
  async (request: NextRequest, context: ApiContext) => {
    const { level, title, message, source } = context.validatedBody;

    try {
      await performanceMonitor.createAlert({
        level,
        title,
        message,
        source,
        metadata: {
          testAlert: true,
          createdBy: context.userId
        }
      });

      return {
        message: 'Test alert created successfully',
        alert: { level, title, message, source },
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to create test alert: ${error.message}`
      );
    }
  }
);

// Helper functions
function getStartTimeFromRange(range: string, endTime: Date): Date {
  const multipliers = {
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000
  };

  return new Date(endTime.getTime() - multipliers[range]);
}

function calculateMetricTrends(metrics: any[], timeRange: string) {
  if (metrics.length < 2) return null;

  const sortedMetrics = metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const midpoint = Math.floor(sortedMetrics.length / 2);

  const firstHalf = sortedMetrics.slice(0, midpoint);
  const secondHalf = sortedMetrics.slice(midpoint);

  const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.duration, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.duration, 0) / secondHalf.length;

  const trendDirection = secondHalfAvg > firstHalfAvg ? 'increasing' : 'decreasing';
  const trendPercentage = firstHalfAvg > 0 ?
    Math.abs((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100) : 0;

  return {
    direction: trendDirection,
    percentage: Number(trendPercentage.toFixed(2)),
    firstHalfAvg: Math.round(firstHalfAvg),
    secondHalfAvg: Math.round(secondHalfAvg)
  };
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[Math.max(0, index)];
}

// Example API routes using these handlers:
/*
// app/api/monitoring/health/route.ts
import { getSystemHealthHandler } from '@/lib/api/examples/monitoring-api-handler';

export async function GET(request: NextRequest) {
  return getSystemHealthHandler.handle(request);
}

// app/api/monitoring/alerts/[alertId]/resolve/route.ts
import { resolveAlertHandler } from '@/lib/api/examples/monitoring-api-handler';

export async function POST(
  request: NextRequest,
  { params }: { params: { alertId: string } }
) {
  return resolveAlertHandler.handle(request, params);
}
*/