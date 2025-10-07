import { cacheInstances } from '@/lib/cache/redis-cache';
import { ConnectionHealth, OptimizedQuery } from '@/lib/db/optimized-db';
import { CompressionStats } from '@/lib/middleware/compression';

export interface PerformanceMetrics {
  timestamp: Date;
  system: {
    memory: {
      used: number;
      free: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
    uptime: number;
  };
  database: {
    connectionHealth: any;
    queryStats: {
      totalQueries: number;
      slowQueries: number;
      averageResponseTime: number;
      errorRate: number;
    };
    poolStats: any;
  };
  cache: {
    redis: {
      status: 'connected' | 'disconnected' | 'error';
      hitRate: number;
      memory: number;
      keys: number;
    };
    instances: Record<string, {
      hits: number;
      misses: number;
      hitRate: number;
      size: number;
    }>;
  };
  compression: {
    totalRequests: number;
    compressionRate: number;
    avgCompressionRatio: number;
    totalSavings: number;
    savingsPercentage: number;
  };
  performance: {
    responseTime: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
    throughput: {
      requestsPerSecond: number;
      requestsPerMinute: number;
    };
    errors: {
      total: number;
      rate: number;
      by4xx: number;
      by5xx: number;
    };
  };
}

export interface AlertThresholds {
  memory: {
    warning: number; // percentage
    critical: number;
  };
  cpu: {
    warning: number; // percentage
    critical: number;
  };
  database: {
    responseTime: {
      warning: number; // ms
      critical: number;
    };
    errorRate: {
      warning: number; // percentage
      critical: number;
    };
  };
  cache: {
    hitRate: {
      warning: number; // percentage
      critical: number;
    };
  };
  performance: {
    responseTime: {
      warning: number; // ms
      critical: number;
    };
    errorRate: {
      warning: number; // percentage
      critical: number;
    };
  };
}

/**
 * Performance monitoring service
 */
export class PerformanceMonitor {
  private static metrics: PerformanceMetrics[] = [];
  private static alerts: any[] = [];
  private static isMonitoring = false;
  private static monitoringInterval: NodeJS.Timeout | null = null;

  private static defaultThresholds: AlertThresholds = {
    memory: { warning: 80, critical: 95 },
    cpu: { warning: 70, critical: 90 },
    database: {
      responseTime: { warning: 1000, critical: 5000 },
      errorRate: { warning: 5, critical: 10 }
    },
    cache: {
      hitRate: { warning: 80, critical: 60 }
    },
    performance: {
      responseTime: { warning: 2000, critical: 5000 },
      errorRate: { warning: 5, critical: 10 }
    }
  };

  /**
   * Start performance monitoring
   */
  static start(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, intervalMs);

    console.log('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  static stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Performance monitoring stopped');
  }

  /**
   * Collect comprehensive performance metrics
   */
  static async collectMetrics(): Promise<PerformanceMetrics> {
    try {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        system: await this.getSystemMetrics(),
        database: await this.getDatabaseMetrics(),
        cache: await this.getCacheMetrics(),
        compression: this.getCompressionMetrics(),
        performance: await this.getPerformanceMetrics()
      };

      // Store metrics (keep last 1000 entries)
      this.metrics.push(metrics);
      if (this.metrics.length > 1000) {
        this.metrics = this.metrics.slice(-1000);
      }

      // Check for alerts
      await this.checkAlerts(metrics);

      return metrics;
    } catch (error) {
      console.error('Error collecting performance metrics:', error);
      throw error;
    }
  }

  /**
   * Get system resource metrics
   */
  private static async getSystemMetrics(): Promise<PerformanceMetrics['system']> {
    // Note: In a real implementation, you'd use libraries like 'os' or 'systeminformation'
    // For now, we'll return mock data with realistic values
    const memUsed = process.memoryUsage();
    const totalMem = 8 * 1024 * 1024 * 1024; // 8GB mock

    return {
      memory: {
        used: memUsed.heapUsed,
        free: totalMem - memUsed.heapUsed,
        total: totalMem,
        percentage: (memUsed.heapUsed / totalMem) * 100
      },
      cpu: {
        usage: Math.random() * 50 + 10, // Mock CPU usage between 10-60%
        loadAverage: [1.2, 1.5, 1.8] // Mock load averages
      },
      uptime: process.uptime()
    };
  }

  /**
   * Get database performance metrics
   */
  private static async getDatabaseMetrics(): Promise<PerformanceMetrics['database']> {
    const connectionHealth = ConnectionHealth.getMetrics();
    const poolStats = {
      totalConnections: 20,
      activeConnections: 5,
      idleConnections: 15,
      waitingClients: 0
    };

    return {
      connectionHealth,
      queryStats: {
        totalQueries: connectionHealth.totalQueries,
        slowQueries: connectionHealth.slowQueries,
        averageResponseTime: connectionHealth.averageResponseTime,
        errorRate: connectionHealth.totalQueries > 0
          ? (connectionHealth.failedQueries / connectionHealth.totalQueries) * 100
          : 0
      },
      poolStats
    };
  }

  /**
   * Get cache performance metrics
   */
  private static async getCacheMetrics(): Promise<PerformanceMetrics['cache']> {
    const redisStatus = 'connected'; // Would check actual Redis status
    const instances: Record<string, any> = {};

    // Collect stats from all cache instances
    for (const [name, cache] of Object.entries(cacheInstances)) {
      try {
        const stats = await cache.getStats();
        instances[name] = {
          hits: stats.hits,
          misses: stats.misses,
          hitRate: stats.hits + stats.misses > 0
            ? (stats.hits / (stats.hits + stats.misses)) * 100
            : 0,
          size: stats.size
        };
      } catch (error) {
        instances[name] = {
          hits: 0,
          misses: 0,
          hitRate: 0,
          size: 0
        };
      }
    }

    // Calculate overall hit rate
    const totalHits = Object.values(instances).reduce((sum, stats) => sum + stats.hits, 0);
    const totalMisses = Object.values(instances).reduce((sum, stats) => sum + stats.misses, 0);
    const overallHitRate = totalHits + totalMisses > 0
      ? (totalHits / (totalHits + totalMisses)) * 100
      : 0;

    return {
      redis: {
        status: redisStatus as any,
        hitRate: overallHitRate,
        memory: 50 * 1024 * 1024, // Mock 50MB
        keys: Object.values(instances).reduce((sum, stats) => sum + stats.size, 0)
      },
      instances
    };
  }

  /**
   * Get compression metrics
   */
  private static getCompressionMetrics(): PerformanceMetrics['compression'] {
    const stats = CompressionStats.getStats();
    return {
      totalRequests: stats.totalRequests,
      compressionRate: stats.compressionRate * 100,
      avgCompressionRatio: stats.averageCompressionRatio,
      totalSavings: stats.totalSavings,
      savingsPercentage: stats.savingsPercentage
    };
  }

  /**
   * Get application performance metrics
   */
  private static async getPerformanceMetrics(): Promise<PerformanceMetrics['performance']> {
    // In a real implementation, these would come from APM tools or middleware
    // For now, return mock data based on recent metrics
    return {
      responseTime: {
        avg: 250,
        p50: 200,
        p95: 800,
        p99: 1500
      },
      throughput: {
        requestsPerSecond: 25,
        requestsPerMinute: 1500
      },
      errors: {
        total: 10,
        rate: 0.5,
        by4xx: 7,
        by5xx: 3
      }
    };
  }

  /**
   * Check alert thresholds and trigger alerts
   */
  private static async checkAlerts(
    metrics: PerformanceMetrics,
    thresholds: AlertThresholds = this.defaultThresholds
  ): Promise<void> {
    const alerts = [];

    // Memory alerts
    if (metrics.system.memory.percentage >= thresholds.memory.critical) {
      alerts.push({
        level: 'critical',
        type: 'memory',
        message: `Memory usage critical: ${metrics.system.memory.percentage.toFixed(1)}%`,
        value: metrics.system.memory.percentage,
        threshold: thresholds.memory.critical
      });
    } else if (metrics.system.memory.percentage >= thresholds.memory.warning) {
      alerts.push({
        level: 'warning',
        type: 'memory',
        message: `Memory usage high: ${metrics.system.memory.percentage.toFixed(1)}%`,
        value: metrics.system.memory.percentage,
        threshold: thresholds.memory.warning
      });
    }

    // CPU alerts
    if (metrics.system.cpu.usage >= thresholds.cpu.critical) {
      alerts.push({
        level: 'critical',
        type: 'cpu',
        message: `CPU usage critical: ${metrics.system.cpu.usage.toFixed(1)}%`,
        value: metrics.system.cpu.usage,
        threshold: thresholds.cpu.critical
      });
    } else if (metrics.system.cpu.usage >= thresholds.cpu.warning) {
      alerts.push({
        level: 'warning',
        type: 'cpu',
        message: `CPU usage high: ${metrics.system.cpu.usage.toFixed(1)}%`,
        value: metrics.system.cpu.usage,
        threshold: thresholds.cpu.warning
      });
    }

    // Database alerts
    if (metrics.database.queryStats.averageResponseTime >= thresholds.database.responseTime.critical) {
      alerts.push({
        level: 'critical',
        type: 'database_response_time',
        message: `Database response time critical: ${metrics.database.queryStats.averageResponseTime}ms`,
        value: metrics.database.queryStats.averageResponseTime,
        threshold: thresholds.database.responseTime.critical
      });
    }

    if (metrics.database.queryStats.errorRate >= thresholds.database.errorRate.critical) {
      alerts.push({
        level: 'critical',
        type: 'database_error_rate',
        message: `Database error rate critical: ${metrics.database.queryStats.errorRate.toFixed(1)}%`,
        value: metrics.database.queryStats.errorRate,
        threshold: thresholds.database.errorRate.critical
      });
    }

    // Cache alerts
    if (metrics.cache.redis.hitRate <= thresholds.cache.hitRate.critical) {
      alerts.push({
        level: 'critical',
        type: 'cache_hit_rate',
        message: `Cache hit rate critical: ${metrics.cache.redis.hitRate.toFixed(1)}%`,
        value: metrics.cache.redis.hitRate,
        threshold: thresholds.cache.hitRate.critical
      });
    }

    // Store alerts
    for (const alert of alerts) {
      this.alerts.push({
        ...alert,
        timestamp: metrics.timestamp,
        id: `${alert.type}_${Date.now()}`
      });
    }

    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    // Log critical alerts
    for (const alert of alerts.filter(a => a.level === 'critical')) {
      console.error(`CRITICAL ALERT: ${alert.message}`);
    }
  }

  /**
   * Get current performance metrics
   */
  static getCurrentMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * Get historical metrics
   */
  static getHistoricalMetrics(
    from: Date,
    to: Date = new Date()
  ): PerformanceMetrics[] {
    return this.metrics.filter(
      m => m.timestamp >= from && m.timestamp <= to
    );
  }

  /**
   * Get active alerts
   */
  static getActiveAlerts(): any[] {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp >= oneDayAgo);
  }

  /**
   * Generate performance report
   */
  static generateReport(
    timeframe: '1h' | '6h' | '24h' | '7d' = '24h'
  ): {
    summary: any;
    trends: any;
    alerts: any[];
    recommendations: string[];
  } {
    const hoursBack = timeframe === '1h' ? 1 : timeframe === '6h' ? 6 : timeframe === '24h' ? 24 : 168;
    const from = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const metrics = this.getHistoricalMetrics(from);

    if (metrics.length === 0) {
      return {
        summary: {},
        trends: {},
        alerts: [],
        recommendations: ['Insufficient data for analysis']
      };
    }

    // Calculate averages and trends
    const avgMemory = metrics.reduce((sum, m) => sum + m.system.memory.percentage, 0) / metrics.length;
    const avgCpu = metrics.reduce((sum, m) => sum + m.system.cpu.usage, 0) / metrics.length;
    const avgDbResponseTime = metrics.reduce((sum, m) => sum + m.database.queryStats.averageResponseTime, 0) / metrics.length;
    const avgCacheHitRate = metrics.reduce((sum, m) => sum + m.cache.redis.hitRate, 0) / metrics.length;

    const summary = {
      period: timeframe,
      dataPoints: metrics.length,
      averageMemoryUsage: avgMemory,
      averageCpuUsage: avgCpu,
      averageDbResponseTime: avgDbResponseTime,
      averageCacheHitRate: avgCacheHitRate
    };

    const trends = {
      memory: this.calculateTrend(metrics.map(m => m.system.memory.percentage)),
      cpu: this.calculateTrend(metrics.map(m => m.system.cpu.usage)),
      dbResponseTime: this.calculateTrend(metrics.map(m => m.database.queryStats.averageResponseTime)),
      cacheHitRate: this.calculateTrend(metrics.map(m => m.cache.redis.hitRate))
    };

    const alerts = this.getActiveAlerts();
    const recommendations = this.generateRecommendations(summary, trends, alerts);

    return { summary, trends, alerts, recommendations };
  }

  /**
   * Calculate trend direction
   */
  private static calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';

    const recent = values.slice(-Math.min(10, values.length));
    const older = values.slice(0, Math.min(10, values.length));

    const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;

    const diff = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (diff > 5) return 'up';
    if (diff < -5) return 'down';
    return 'stable';
  }

  /**
   * Generate performance recommendations
   */
  private static generateRecommendations(
    summary: any,
    trends: any,
    alerts: any[]
  ): string[] {
    const recommendations = [];

    // Memory recommendations
    if (summary.averageMemoryUsage > 80) {
      recommendations.push('Consider increasing memory allocation or optimizing memory usage');
    }

    // Database recommendations
    if (summary.averageDbResponseTime > 1000) {
      recommendations.push('Database response times are high - consider query optimization or connection pooling');
    }

    // Cache recommendations
    if (summary.averageCacheHitRate < 80) {
      recommendations.push('Cache hit rate is low - review caching strategy and TTL settings');
    }

    // Trend-based recommendations
    if (trends.memory === 'up') {
      recommendations.push('Memory usage is trending upward - monitor for potential memory leaks');
    }

    if (trends.dbResponseTime === 'up') {
      recommendations.push('Database response times are increasing - investigate slow queries');
    }

    // Alert-based recommendations
    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push('Critical alerts detected - immediate attention required');
    }

    return recommendations.length > 0 ? recommendations : ['System performance is within normal parameters'];
  }
}

/**
 * Performance dashboard API endpoints
 */
export class PerformanceDashboard {
  /**
   * Get dashboard data
   */
  static async getDashboardData(): Promise<{
    current: PerformanceMetrics | null;
    alerts: any[];
    report: any;
  }> {
    return {
      current: PerformanceMonitor.getCurrentMetrics(),
      alerts: PerformanceMonitor.getActiveAlerts(),
      report: PerformanceMonitor.generateReport('24h')
    };
  }

  /**
   * Get metrics for a specific timeframe
   */
  static async getMetricsData(
    timeframe: string,
    from?: string,
    to?: string
  ): Promise<PerformanceMetrics[]> {
    if (from && to) {
      return PerformanceMonitor.getHistoricalMetrics(
        new Date(from),
        new Date(to)
      );
    }

    const hoursBack = timeframe === '1h' ? 1 : timeframe === '6h' ? 6 : timeframe === '24h' ? 24 : 168;
    const fromDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    return PerformanceMonitor.getHistoricalMetrics(fromDate);
  }

  /**
   * Export metrics data
   */
  static async exportMetrics(
    format: 'json' | 'csv',
    timeframe: string
  ): Promise<string> {
    const metrics = await this.getMetricsData(timeframe);

    if (format === 'csv') {
      return this.convertToCSV(metrics);
    }

    return JSON.stringify(metrics, null, 2);
  }

  private static convertToCSV(metrics: PerformanceMetrics[]): string {
    if (metrics.length === 0) return '';

    const headers = [
      'timestamp',
      'memory_percentage',
      'cpu_usage',
      'db_avg_response_time',
      'db_error_rate',
      'cache_hit_rate',
      'compression_rate'
    ];

    const rows = metrics.map(m => [
      m.timestamp.toISOString(),
      m.system.memory.percentage.toFixed(2),
      m.system.cpu.usage.toFixed(2),
      m.database.queryStats.averageResponseTime.toFixed(2),
      m.database.queryStats.errorRate.toFixed(2),
      m.cache.redis.hitRate.toFixed(2),
      m.compression.compressionRate.toFixed(2)
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}