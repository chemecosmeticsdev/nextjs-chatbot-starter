import { cache, CacheKeys } from './cache-service';
import { jobQueue, JobType, JobPriority } from './job-queue';

// Performance metric types
export enum MetricType {
  HTTP_REQUEST = 'http_request',
  DATABASE_QUERY = 'database_query',
  CACHE_OPERATION = 'cache_operation',
  AI_GENERATION = 'ai_generation',
  VECTOR_SEARCH = 'vector_search',
  JOB_PROCESSING = 'job_processing',
  USER_ACTION = 'user_action'
}

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Performance metric interface
export interface PerformanceMetric {
  id: string;
  type: MetricType;
  name: string;
  duration: number; // milliseconds
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  traceId?: string;
  userId?: string;
  chatbotId?: string;
  source: string; // service/component name
}

// Health check interface
export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  lastCheck: Date;
  details?: Record<string, any>;
  dependencies?: HealthCheck[];
}

// Alert interface
export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

/**
 * Performance Monitoring Service
 * Provides comprehensive observability for the chatbot application
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private alerts: Alert[] = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private metricsBuffer: PerformanceMetric[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isEnabled = process.env.NODE_ENV === 'production' || process.env.ENABLE_MONITORING === 'true';

  // Performance thresholds
  private thresholds = {
    httpRequest: { warning: 1000, critical: 5000 }, // ms
    databaseQuery: { warning: 500, critical: 2000 },
    aiGeneration: { warning: 10000, critical: 30000 },
    vectorSearch: { warning: 1000, critical: 5000 },
    cacheOperation: { warning: 100, critical: 500 }
  };

  constructor() {
    if (this.isEnabled) {
      this.startPeriodicFlush();
      this.startHealthChecks();
    }
  }

  /**
   * Start a performance measurement
   */
  startMeasurement(
    type: MetricType,
    name: string,
    metadata?: Record<string, any>
  ): PerformanceMeasurement {
    return new PerformanceMeasurement(this, type, name, metadata);
  }

  /**
   * Record a performance metric
   */
  async recordMetric(metric: Omit<PerformanceMetric, 'id' | 'timestamp'>): Promise<void> {
    if (!this.isEnabled) return;

    const completeMetric: PerformanceMetric = {
      ...metric,
      id: this.generateMetricId(),
      timestamp: new Date()
    };

    // Add to buffer for batch processing
    this.metricsBuffer.push(completeMetric);

    // Check for alerts
    await this.checkPerformanceAlerts(completeMetric);

    // Store recent metrics in memory for quick access
    this.metrics.push(completeMetric);
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000); // Keep last 1000 metrics
    }
  }

  /**
   * Record an error with context
   */
  async recordError(
    error: Error,
    context: {
      type: MetricType;
      source: string;
      userId?: string;
      chatbotId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (!this.isEnabled) return;

    const errorMetric: Omit<PerformanceMetric, 'id' | 'timestamp'> = {
      type: context.type,
      name: `error_${error.name.toLowerCase()}`,
      duration: 0,
      success: false,
      error: error.message,
      metadata: {
        stack: error.stack,
        ...context.metadata
      },
      userId: context.userId,
      chatbotId: context.chatbotId,
      source: context.source
    };

    await this.recordMetric(errorMetric);

    // Create alert for errors
    await this.createAlert({
      level: AlertLevel.ERROR,
      title: `${error.name} in ${context.source}`,
      message: error.message,
      source: context.source,
      metadata: {
        errorType: error.name,
        stack: error.stack,
        ...context.metadata
      }
    });
  }

  /**
   * Get performance metrics for a time range
   */
  getMetrics(
    timeRange: { start: Date; end: Date },
    filters?: {
      type?: MetricType;
      source?: string;
      chatbotId?: string;
      success?: boolean;
    }
  ): PerformanceMetric[] {
    let filteredMetrics = this.metrics.filter(
      metric =>
        metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
    );

    if (filters) {
      if (filters.type) {
        filteredMetrics = filteredMetrics.filter(m => m.type === filters.type);
      }
      if (filters.source) {
        filteredMetrics = filteredMetrics.filter(m => m.source === filters.source);
      }
      if (filters.chatbotId) {
        filteredMetrics = filteredMetrics.filter(m => m.chatbotId === filters.chatbotId);
      }
      if (filters.success !== undefined) {
        filteredMetrics = filteredMetrics.filter(m => m.success === filters.success);
      }
    }

    return filteredMetrics;
  }

  /**
   * Get aggregated performance statistics
   */
  getPerformanceStats(
    timeRange: { start: Date; end: Date },
    groupBy: 'type' | 'source' | 'hour' = 'type'
  ): Record<string, {
    count: number;
    avgDuration: number;
    successRate: number;
    errorCount: number;
  }> {
    const metrics = this.getMetrics(timeRange);
    const grouped: Record<string, PerformanceMetric[]> = {};

    metrics.forEach(metric => {
      let key: string;
      switch (groupBy) {
        case 'type':
          key = metric.type;
          break;
        case 'source':
          key = metric.source;
          break;
        case 'hour':
          key = metric.timestamp.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          break;
        default:
          key = metric.type;
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(metric);
    });

    const stats: Record<string, any> = {};
    Object.entries(grouped).forEach(([key, metrics]) => {
      const successfulMetrics = metrics.filter(m => m.success);
      const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);

      stats[key] = {
        count: metrics.length,
        avgDuration: Math.round(totalDuration / metrics.length),
        successRate: Number(((successfulMetrics.length / metrics.length) * 100).toFixed(2)),
        errorCount: metrics.length - successfulMetrics.length
      };
    });

    return stats;
  }

  /**
   * Check system health
   */
  async checkSystemHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: HealthCheck[];
    lastUpdated: Date;
  }> {
    const services: HealthCheck[] = [];

    // Check database health
    services.push(await this.checkDatabaseHealth());

    // Check cache health
    services.push(await this.checkCacheHealth());

    // Check job queue health
    services.push(await this.checkJobQueueHealth());

    // Check external services
    services.push(await this.checkExternalServicesHealth());

    // Determine overall health
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const healthStatus = {
      overall,
      services,
      lastUpdated: new Date()
    };

    // Cache health status
    await cache.set(CacheKeys.systemHealth(), healthStatus, 60); // 1 minute

    return healthStatus;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(level?: AlertLevel): Alert[] {
    let alerts = this.alerts.filter(alert => !alert.resolved);

    if (level) {
      alerts = alerts.filter(alert => alert.level === level);
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Create an alert
   */
  async createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const completeAlert: Alert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.push(completeAlert);

    // Keep only last 500 alerts in memory
    if (this.alerts.length > 500) {
      this.alerts = this.alerts.slice(-500);
    }

    // Queue alert notification job for critical/error alerts
    if (alert.level === AlertLevel.CRITICAL || alert.level === AlertLevel.ERROR) {
      await jobQueue.addJob({
        type: JobType.EMAIL_NOTIFICATION,
        priority: alert.level === AlertLevel.CRITICAL ? JobPriority.HIGH : JobPriority.NORMAL,
        payload: {
          type: 'alert',
          alert: completeAlert
        }
      });
    }

    console.warn(`Alert [${alert.level.toUpperCase()}]: ${alert.title} - ${alert.message}`);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      console.info(`Alert resolved: ${alert.title}`);
    }
  }

  /**
   * Get real-time metrics dashboard data
   */
  async getRealtimeMetrics(): Promise<{
    requestsPerMinute: number;
    avgResponseTime: number;
    errorRate: number;
    activeUsers: number;
    systemHealth: string;
    topErrors: Array<{ error: string; count: number }>;
    recentAlerts: Alert[];
  }> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const now = new Date();

    const recentMetrics = this.getMetrics({ start: oneMinuteAgo, end: now });
    const httpMetrics = recentMetrics.filter(m => m.type === MetricType.HTTP_REQUEST);

    // Calculate error frequency
    const errorMetrics = recentMetrics.filter(m => !m.success);
    const errorCounts: Record<string, number> = {};
    errorMetrics.forEach(m => {
      const errorKey = m.error || 'Unknown Error';
      errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
    });

    const topErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    // Get unique users from recent metrics
    const uniqueUsers = new Set(
      recentMetrics
        .filter(m => m.userId)
        .map(m => m.userId)
    ).size;

    const healthStatus = await cache.get(CacheKeys.systemHealth());

    return {
      requestsPerMinute: httpMetrics.length,
      avgResponseTime: httpMetrics.length > 0 ?
        Math.round(httpMetrics.reduce((sum, m) => sum + m.duration, 0) / httpMetrics.length) : 0,
      errorRate: recentMetrics.length > 0 ?
        Number(((errorMetrics.length / recentMetrics.length) * 100).toFixed(2)) : 0,
      activeUsers: uniqueUsers,
      systemHealth: healthStatus?.overall || 'unknown',
      topErrors,
      recentAlerts: this.getActiveAlerts().slice(0, 10)
    };
  }

  // Private helper methods
  private async checkPerformanceAlerts(metric: PerformanceMetric): Promise<void> {
    const thresholdKey = metric.type.replace('_', '').toLowerCase() as keyof typeof this.thresholds;
    const threshold = this.thresholds[thresholdKey];

    if (!threshold) return;

    if (metric.duration > threshold.critical) {
      await this.createAlert({
        level: AlertLevel.CRITICAL,
        title: `Critical Performance Issue`,
        message: `${metric.name} took ${metric.duration}ms (threshold: ${threshold.critical}ms)`,
        source: metric.source,
        metadata: { metric: metric.name, duration: metric.duration, threshold: threshold.critical }
      });
    } else if (metric.duration > threshold.warning) {
      await this.createAlert({
        level: AlertLevel.WARNING,
        title: `Performance Warning`,
        message: `${metric.name} took ${metric.duration}ms (threshold: ${threshold.warning}ms)`,
        source: metric.source,
        metadata: { metric: metric.name, duration: metric.duration, threshold: threshold.warning }
      });
    }
  }

  private async checkDatabaseHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      // Simple database health check - would implement actual DB ping
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate DB check
      const latency = Date.now() - startTime;

      return {
        service: 'database',
        status: latency < 100 ? 'healthy' : latency < 500 ? 'degraded' : 'unhealthy',
        latencyMs: latency,
        lastCheck: new Date(),
        details: { connectionPool: 'active', queryCache: 'enabled' }
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: { error: error.message }
      };
    }
  }

  private async checkCacheHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const stats = await cache.getStats();
      const latency = Date.now() - startTime;

      return {
        service: 'cache',
        status: stats.healthy ? 'healthy' : 'unhealthy',
        latencyMs: latency,
        lastCheck: new Date(),
        details: stats
      };
    } catch (error) {
      return {
        service: 'cache',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: { error: error.message }
      };
    }
  }

  private async checkJobQueueHealth(): Promise<HealthCheck> {
    try {
      const queueStats = await jobQueue.getQueueStats();
      const unhealthyQueues = Object.values(queueStats).filter(stat => !stat.healthy).length;

      return {
        service: 'job_queue',
        status: unhealthyQueues === 0 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: queueStats
      };
    } catch (error) {
      return {
        service: 'job_queue',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: { error: error.message }
      };
    }
  }

  private async checkExternalServicesHealth(): Promise<HealthCheck> {
    // Check AWS Bedrock, S3, etc.
    return {
      service: 'external_services',
      status: 'healthy', // Would implement actual checks
      lastCheck: new Date(),
      details: { bedrock: 'healthy', s3: 'healthy' }
    };
  }

  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(async () => {
      await this.flushMetrics();
    }, 30000); // Flush every 30 seconds
  }

  private startHealthChecks(): void {
    // Run health checks every 5 minutes
    setInterval(async () => {
      await this.checkSystemHealth();
    }, 300000);
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    try {
      const metrics = [...this.metricsBuffer];
      this.metricsBuffer = [];

      // In production, would send to external monitoring service
      // For now, cache aggregated metrics
      const stats = this.calculateAggregatedStats(metrics);
      await cache.set(
        `metrics:aggregated:${Math.floor(Date.now() / 60000)}`, // Per-minute key
        stats,
        3600 // 1 hour retention
      );

      console.log(`Flushed ${metrics.length} performance metrics`);
    } catch (error) {
      console.error('Failed to flush metrics:', error);
    }
  }

  private calculateAggregatedStats(metrics: PerformanceMetric[]) {
    const byType = metrics.reduce((acc, metric) => {
      if (!acc[metric.type]) {
        acc[metric.type] = { count: 0, totalDuration: 0, errors: 0 };
      }
      acc[metric.type].count++;
      acc[metric.type].totalDuration += metric.duration;
      if (!metric.success) acc[metric.type].errors++;
      return acc;
    }, {} as Record<string, any>);

    return {
      timestamp: new Date(),
      totalMetrics: metrics.length,
      byType,
      avgDuration: metrics.length > 0 ?
        Math.round(metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length) : 0,
      errorRate: metrics.length > 0 ?
        Number(((metrics.filter(m => !m.success).length / metrics.length) * 100).toFixed(2)) : 0
    };
  }

  private generateMetricId(): string {
    return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Performance Measurement Helper Class
 * Provides easy-to-use measurement interface
 */
export class PerformanceMeasurement {
  private startTime: number;
  private endTime?: number;
  private traceId: string;

  constructor(
    private monitor: PerformanceMonitor,
    private type: MetricType,
    private name: string,
    private metadata?: Record<string, any>
  ) {
    this.startTime = performance.now();
    this.traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Complete the measurement successfully
   */
  async complete(additionalMetadata?: Record<string, any>): Promise<void> {
    this.endTime = performance.now();
    const duration = Math.round(this.endTime - this.startTime);

    await this.monitor.recordMetric({
      type: this.type,
      name: this.name,
      duration,
      success: true,
      metadata: { ...this.metadata, ...additionalMetadata },
      traceId: this.traceId,
      source: this.getCallerSource()
    });
  }

  /**
   * Complete the measurement with an error
   */
  async error(error: Error, additionalMetadata?: Record<string, any>): Promise<void> {
    this.endTime = performance.now();
    const duration = Math.round(this.endTime - this.startTime);

    await this.monitor.recordMetric({
      type: this.type,
      name: this.name,
      duration,
      success: false,
      error: error.message,
      metadata: {
        ...this.metadata,
        ...additionalMetadata,
        errorType: error.name,
        stack: error.stack
      },
      traceId: this.traceId,
      source: this.getCallerSource()
    });
  }

  private getCallerSource(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';

    const lines = stack.split('\n');
    // Find the first line that's not from this file
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('performance-monitor.ts')) {
        const match = line.match(/at\s+(.+?)\s+\(/);
        return match ? match[1] : 'unknown';
      }
    }
    return 'unknown';
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Convenience decorators and helpers
export function measurePerformance(type: MetricType, name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const metricName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const measurement = performanceMonitor.startMeasurement(type, metricName);

      try {
        const result = await originalMethod.apply(this, args);
        await measurement.complete();
        return result;
      } catch (error) {
        await measurement.error(error);
        throw error;
      }
    };

    return descriptor;
  };
}

// Express.js middleware for automatic HTTP request monitoring
export function performanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const measurement = performanceMonitor.startMeasurement(
      MetricType.HTTP_REQUEST,
      `${req.method} ${req.route?.path || req.path}`,
      {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }
    );

    // Store measurement in request for later completion
    req.performanceMeasurement = measurement;

    const originalSend = res.send;
    res.send = function (data: any) {
      const statusCode = res.statusCode;
      const isSuccess = statusCode < 400;

      if (isSuccess) {
        measurement.complete({ statusCode, responseSize: data?.length });
      } else {
        measurement.error(new Error(`HTTP ${statusCode}`), { statusCode });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}