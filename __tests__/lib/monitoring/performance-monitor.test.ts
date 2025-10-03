import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock performance monitoring utilities
const PerformanceMonitor = {
  // Core monitoring
  startTimer: jest.fn(),
  endTimer: jest.fn(),
  recordMetric: jest.fn(),
  getMetrics: jest.fn(),

  // Response time tracking
  trackResponseTime: jest.fn(),
  getResponseTimeStats: jest.fn(),
  trackSlowRequests: jest.fn(),

  // Resource monitoring
  trackMemoryUsage: jest.fn(),
  trackCPUUsage: jest.fn(),
  trackDiskUsage: jest.fn(),
  getSystemHealth: jest.fn(),

  // Database monitoring
  trackQueryTime: jest.fn(),
  getSlowQueries: jest.fn(),
  trackConnectionPool: jest.fn(),

  // Error tracking
  trackError: jest.fn(),
  getErrorRate: jest.fn(),
  getErrorDistribution: jest.fn(),

  // Alert system
  checkThresholds: jest.fn(),
  sendAlert: jest.fn(),
  getAlerts: jest.fn(),

  // Reporting
  generateReport: jest.fn(),
  getInsights: jest.fn(),
  exportMetrics: jest.fn()
};

// Mock Node.js performance APIs
jest.mock('perf_hooks', () => ({
  performance: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByType: jest.fn(() => []),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn()
  },
  PerformanceObserver: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn()
  }))
}));

// Mock process for system metrics
const mockProcess = {
  memoryUsage: jest.fn(() => ({
    rss: 134217728, // 128MB
    heapTotal: 67108864, // 64MB
    heapUsed: 33554432, // 32MB
    external: 8388608, // 8MB
    arrayBuffers: 4194304 // 4MB
  })),
  cpuUsage: jest.fn(() => ({
    user: 123456789,
    system: 12345678
  })),
  uptime: jest.fn(() => 86400), // 24 hours
  pid: 12345
};

Object.defineProperty(global, 'process', {
  value: mockProcess,
  writable: true
});

describe('Performance Monitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Timer Management', () => {
    it('should start and track performance timers', () => {
      const timerId = 'api_request_123';

      PerformanceMonitor.startTimer.mockReturnValue({
        id: timerId,
        startTime: Date.now(),
        context: {
          endpoint: '/api/v1/chatbots',
          method: 'GET',
          userId: 'user123'
        }
      });

      const timer = PerformanceMonitor.startTimer(timerId, {
        endpoint: '/api/v1/chatbots',
        method: 'GET',
        userId: 'user123'
      });

      expect(timer.id).toBe(timerId);
      expect(timer.startTime).toBeDefined();
      expect(timer.context.endpoint).toBe('/api/v1/chatbots');
    });

    it('should end timers and calculate duration', () => {
      const timerId = 'api_request_123';
      const startTime = Date.now() - 250; // 250ms ago

      PerformanceMonitor.endTimer.mockReturnValue({
        id: timerId,
        duration: 250,
        endTime: Date.now(),
        performance: {
          category: 'fast',
          percentile: 'p75'
        }
      });

      const result = PerformanceMonitor.endTimer(timerId);

      expect(result.duration).toBe(250);
      expect(result.performance.category).toBe('fast');
      expect(PerformanceMonitor.endTimer).toHaveBeenCalledWith(timerId);
    });

    it('should record custom metrics with context', () => {
      const metric = {
        name: 'chatbot_response_generated',
        value: 1,
        tags: {
          chatbotId: 'bot123',
          userId: 'user456',
          responseType: 'text'
        },
        timestamp: Date.now()
      };

      PerformanceMonitor.recordMetric.mockReturnValue({
        recorded: true,
        metric,
        id: 'metric_789'
      });

      const result = PerformanceMonitor.recordMetric(metric);

      expect(result.recorded).toBe(true);
      expect(result.metric.name).toBe('chatbot_response_generated');
      expect(result.metric.tags.chatbotId).toBe('bot123');
    });
  });

  describe('Response Time Tracking', () => {
    it('should track API response times', () => {
      const responseData = {
        endpoint: '/api/v1/chatbots/123/chat',
        method: 'POST',
        duration: 156,
        statusCode: 200,
        contentLength: 2048,
        userId: 'user123'
      };

      PerformanceMonitor.trackResponseTime.mockReturnValue({
        tracked: true,
        category: 'normal',
        benchmark: {
          target: 200,
          actual: 156,
          performance: 'good'
        }
      });

      const result = PerformanceMonitor.trackResponseTime(responseData);

      expect(result.tracked).toBe(true);
      expect(result.benchmark.actual).toBeLessThan(result.benchmark.target);
      expect(result.benchmark.performance).toBe('good');
    });

    it('should provide response time statistics', () => {
      const timeRange = { hours: 24 };

      PerformanceMonitor.getResponseTimeStats.mockReturnValue({
        totalRequests: 15678,
        averageResponseTime: 145, // ms
        percentiles: {
          p50: 89,
          p75: 156,
          p90: 234,
          p95: 345,
          p99: 567
        },
        breakdown: {
          byEndpoint: [
            { endpoint: '/api/v1/chatbots', avgTime: 123, requests: 5672 },
            { endpoint: '/api/v1/chat', avgTime: 167, requests: 8901 },
            { endpoint: '/api/v1/documents', avgTime: 234, requests: 1105 }
          ],
          byMethod: {
            GET: { avgTime: 98, requests: 9876 },
            POST: { avgTime: 189, requests: 4567 },
            PUT: { avgTime: 156, requests: 987 },
            DELETE: { avgTime: 134, requests: 248 }
          }
        },
        trends: {
          hourly: generateHourlyTrend(24),
          improvement: 0.12 // 12% improvement
        }
      });

      const stats = PerformanceMonitor.getResponseTimeStats(timeRange);

      expect(stats.averageResponseTime).toBeLessThan(200);
      expect(stats.percentiles.p95).toBeLessThan(400);
      expect(stats.breakdown.byEndpoint).toHaveLength(3);
      expect(stats.trends.improvement).toBeGreaterThan(0);
    });

    it('should identify and track slow requests', () => {
      const slowThreshold = 1000; // 1 second

      PerformanceMonitor.trackSlowRequests.mockReturnValue({
        slowRequests: [
          {
            endpoint: '/api/v1/documents/search',
            duration: 2345,
            timestamp: Date.now() - 30000,
            userId: 'user123',
            query: 'complex vector search',
            reason: 'Large dataset scan'
          },
          {
            endpoint: '/api/v1/analytics/generate',
            duration: 1567,
            timestamp: Date.now() - 60000,
            userId: 'user456',
            reason: 'Heavy aggregation query'
          }
        ],
        count: 2,
        threshold: slowThreshold,
        timeWindow: '1h'
      });

      const slowRequests = PerformanceMonitor.trackSlowRequests(slowThreshold);

      expect(slowRequests.count).toBe(2);
      expect(slowRequests.slowRequests[0].duration).toBeGreaterThan(slowThreshold);
      expect(slowRequests.slowRequests[0].reason).toBeDefined();
    });
  });

  describe('System Resource Monitoring', () => {
    it('should track memory usage patterns', () => {
      PerformanceMonitor.trackMemoryUsage.mockReturnValue({
        current: {
          rss: 134217728, // 128MB
          heapTotal: 67108864, // 64MB
          heapUsed: 33554432, // 32MB
          external: 8388608, // 8MB
          heapUtilization: 0.5 // 50%
        },
        trends: {
          growthRate: 0.02, // 2% per hour
          peakUsage: 167772160, // 160MB
          averageUsage: 125829120 // 120MB
        },
        alerts: {
          highMemory: false,
          memoryLeak: false,
          threshold: 268435456 // 256MB
        }
      });

      const memStats = PerformanceMonitor.trackMemoryUsage();

      expect(memStats.current.heapUtilization).toBeLessThan(0.8);
      expect(memStats.alerts.highMemory).toBe(false);
      expect(memStats.trends.growthRate).toBeLessThan(0.1);
    });

    it('should monitor CPU usage and load', () => {
      PerformanceMonitor.trackCPUUsage.mockReturnValue({
        current: {
          user: 123456789,
          system: 12345678,
          usage: 0.25, // 25%
          load: [0.5, 0.7, 0.8] // 1, 5, 15 minute averages
        },
        trends: {
          averageUsage: 0.22,
          peakUsage: 0.78,
          pattern: 'normal'
        },
        alerts: {
          highCPU: false,
          sustainedLoad: false,
          threshold: 0.8
        }
      });

      const cpuStats = PerformanceMonitor.trackCPUUsage();

      expect(cpuStats.current.usage).toBeLessThan(0.5);
      expect(cpuStats.current.load[0]).toBeLessThan(1.0);
      expect(cpuStats.alerts.highCPU).toBe(false);
    });

    it('should provide comprehensive system health status', () => {
      PerformanceMonitor.getSystemHealth.mockReturnValue({
        status: 'healthy',
        score: 92, // 0-100
        components: {
          memory: { status: 'healthy', score: 95 },
          cpu: { status: 'healthy', score: 88 },
          disk: { status: 'healthy', score: 94 },
          network: { status: 'healthy', score: 91 },
          database: { status: 'warning', score: 78 }
        },
        uptime: 86400, // 24 hours
        lastCheck: new Date().toISOString(),
        recommendations: [
          'Monitor database connection pool usage',
          'Consider optimizing slow queries in analytics service'
        ]
      });

      const health = PerformanceMonitor.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(90);
      expect(health.components.database.status).toBe('warning');
      expect(health.recommendations).toHaveLength(2);
    });
  });

  describe('Database Performance Monitoring', () => {
    it('should track query execution times', () => {
      const queryData = {
        query: 'SELECT * FROM chatbot_instances WHERE user_id = $1',
        duration: 45,
        rowsReturned: 3,
        userId: 'user123'
      };

      PerformanceMonitor.trackQueryTime.mockReturnValue({
        tracked: true,
        performance: 'excellent',
        benchmark: {
          target: 100,
          actual: 45,
          category: 'fast'
        },
        optimization: {
          indexUsed: true,
          fullTableScan: false,
          recommendations: []
        }
      });

      const result = PerformanceMonitor.trackQueryTime(queryData);

      expect(result.performance).toBe('excellent');
      expect(result.optimization.indexUsed).toBe(true);
      expect(result.benchmark.actual).toBeLessThan(result.benchmark.target);
    });

    it('should identify slow database queries', () => {
      PerformanceMonitor.getSlowQueries.mockReturnValue({
        queries: [
          {
            query: 'SELECT * FROM documents WHERE content ILIKE $1',
            avgDuration: 1234,
            executions: 45,
            totalTime: 55530,
            lastExecution: Date.now() - 300000,
            recommendation: 'Add full-text search index'
          },
          {
            query: 'SELECT COUNT(*) FROM activity_logs WHERE timestamp > $1',
            avgDuration: 567,
            executions: 120,
            totalTime: 68040,
            lastExecution: Date.now() - 60000,
            recommendation: 'Partition table by timestamp'
          }
        ],
        threshold: 500, // ms
        timeWindow: '1h',
        totalSlowQueries: 165
      });

      const slowQueries = PerformanceMonitor.getSlowQueries();

      expect(slowQueries.queries).toHaveLength(2);
      expect(slowQueries.queries[0].avgDuration).toBeGreaterThan(slowQueries.threshold);
      expect(slowQueries.queries[0].recommendation).toContain('index');
    });

    it('should monitor database connection pool health', () => {
      PerformanceMonitor.trackConnectionPool.mockReturnValue({
        pool: {
          size: 20,
          active: 12,
          idle: 8,
          waiting: 0,
          utilization: 0.6 // 60%
        },
        metrics: {
          avgWaitTime: 15, // ms
          maxWaitTime: 156,
          connectionErrors: 0,
          timeouts: 0
        },
        health: {
          status: 'healthy',
          recommendations: [
            'Connection pool utilization is optimal'
          ]
        }
      });

      const poolStats = PerformanceMonitor.trackConnectionPool();

      expect(poolStats.pool.utilization).toBeLessThan(0.8);
      expect(poolStats.metrics.connectionErrors).toBe(0);
      expect(poolStats.health.status).toBe('healthy');
    });
  });

  describe('Error Tracking and Analysis', () => {
    it('should track and categorize errors', () => {
      const errorData = {
        type: 'ValidationError',
        message: 'Invalid chatbot configuration',
        stack: 'Error stack trace...',
        endpoint: '/api/v1/chatbots',
        userId: 'user123',
        timestamp: Date.now()
      };

      PerformanceMonitor.trackError.mockReturnValue({
        tracked: true,
        errorId: 'error_789',
        category: 'client_error',
        severity: 'medium',
        impact: 'low',
        similar: 3 // Similar errors in the last hour
      });

      const result = PerformanceMonitor.trackError(errorData);

      expect(result.tracked).toBe(true);
      expect(result.category).toBe('client_error');
      expect(result.severity).toBe('medium');
      expect(result.similar).toBe(3);
    });

    it('should calculate error rates and trends', () => {
      PerformanceMonitor.getErrorRate.mockReturnValue({
        current: 0.012, // 1.2%
        target: 0.01, // 1%
        trend: 'increasing',
        breakdown: {
          last1h: 0.015,
          last24h: 0.011,
          last7d: 0.009
        },
        byStatusCode: {
          '400': 0.005,
          '401': 0.002,
          '404': 0.003,
          '500': 0.002
        },
        impact: 'medium'
      });

      const errorRate = PerformanceMonitor.getErrorRate();

      expect(errorRate.current).toBeGreaterThan(errorRate.target);
      expect(errorRate.trend).toBe('increasing');
      expect(errorRate.byStatusCode['500']).toBeLessThan(0.005);
    });

    it('should provide error distribution analysis', () => {
      PerformanceMonitor.getErrorDistribution.mockReturnValue({
        byType: {
          'ValidationError': 45,
          'AuthenticationError': 23,
          'DatabaseError': 12,
          'NetworkError': 8
        },
        byEndpoint: {
          '/api/v1/chatbots': 34,
          '/api/v1/chat': 28,
          '/api/v1/auth': 26
        },
        byTimeOfDay: {
          peak: { hour: 14, errors: 15 },
          low: { hour: 3, errors: 2 },
          pattern: 'business_hours'
        },
        resolution: {
          resolved: 67,
          pending: 21,
          investigating: 12
        }
      });

      const distribution = PerformanceMonitor.getErrorDistribution();

      expect(distribution.byType['ValidationError']).toBeGreaterThan(20);
      expect(distribution.resolution.resolved).toBeGreaterThan(distribution.resolution.pending);
      expect(distribution.byTimeOfDay.pattern).toBe('business_hours');
    });
  });

  describe('Alert System', () => {
    it('should check performance thresholds and trigger alerts', () => {
      const thresholds = {
        responseTime: { warning: 200, critical: 500 },
        errorRate: { warning: 0.01, critical: 0.05 },
        memoryUsage: { warning: 0.8, critical: 0.95 },
        cpuUsage: { warning: 0.7, critical: 0.9 }
      };

      PerformanceMonitor.checkThresholds.mockReturnValue({
        alerts: [
          {
            id: 'alert_123',
            type: 'warning',
            metric: 'responseTime',
            current: 245,
            threshold: 200,
            message: 'Average response time exceeded warning threshold',
            timestamp: Date.now(),
            escalated: false
          }
        ],
        status: 'warning',
        healthy: 3,
        warning: 1,
        critical: 0
      });

      const alerts = PerformanceMonitor.checkThresholds(thresholds);

      expect(alerts.alerts).toHaveLength(1);
      expect(alerts.status).toBe('warning');
      expect(alerts.alerts[0].current).toBeGreaterThan(alerts.alerts[0].threshold);
    });

    it('should send alerts through configured channels', async () => {
      const alert = {
        id: 'alert_123',
        type: 'critical',
        metric: 'errorRate',
        message: 'Critical error rate threshold exceeded',
        channels: ['email', 'slack', 'pagerduty']
      };

      PerformanceMonitor.sendAlert.mockResolvedValue({
        sent: true,
        channels: {
          email: { sent: true, timestamp: Date.now() },
          slack: { sent: true, timestamp: Date.now() },
          pagerduty: { sent: true, incident: 'INC123456' }
        },
        escalation: {
          level: 1,
          nextEscalation: Date.now() + 900000 // 15 minutes
        }
      });

      const result = await PerformanceMonitor.sendAlert(alert);

      expect(result.sent).toBe(true);
      expect(result.channels.pagerduty.incident).toBeDefined();
      expect(result.escalation.level).toBe(1);
    });

    it('should manage alert history and status', () => {
      PerformanceMonitor.getAlerts.mockReturnValue({
        active: [
          {
            id: 'alert_123',
            type: 'warning',
            metric: 'responseTime',
            status: 'open',
            created: Date.now() - 300000,
            acknowledged: false
          }
        ],
        resolved: [
          {
            id: 'alert_122',
            type: 'warning',
            metric: 'memoryUsage',
            status: 'resolved',
            created: Date.now() - 3600000,
            resolved: Date.now() - 1800000,
            duration: 1800000 // 30 minutes
          }
        ],
        stats: {
          total: 2,
          meanTimeToResolve: 1800000, // 30 minutes
          escalationRate: 0.1
        }
      });

      const alerts = PerformanceMonitor.getAlerts();

      expect(alerts.active).toHaveLength(1);
      expect(alerts.resolved).toHaveLength(1);
      expect(alerts.stats.escalationRate).toBeLessThan(0.2);
    });
  });

  describe('Reporting and Analytics', () => {
    it('should generate comprehensive performance reports', () => {
      const reportConfig = {
        timeRange: '24h',
        includeCharts: true,
        format: 'json'
      };

      PerformanceMonitor.generateReport.mockReturnValue({
        summary: {
          totalRequests: 156789,
          averageResponseTime: 145,
          errorRate: 0.008,
          uptime: 0.999,
          period: '2024-01-15T00:00:00Z to 2024-01-16T00:00:00Z'
        },
        sections: {
          performance: {
            responseTime: { p95: 234, improvement: '+12%' },
            throughput: { rps: 108.6, peak: 245 },
            availability: { uptime: '99.9%', incidents: 0 }
          },
          resources: {
            memory: { average: '120MB', peak: '145MB' },
            cpu: { average: '23%', peak: '67%' },
            disk: { usage: '45%', iops: 1250 }
          },
          database: {
            queries: { total: 234567, slow: 23, avg: '45ms' },
            connections: { peak: 18, average: 12 }
          },
          errors: {
            total: 1256,
            distribution: { 4xx: 1089, 5xx: 167 },
            trends: 'decreasing'
          }
        },
        recommendations: [
          'Optimize slow queries in analytics service',
          'Consider increasing connection pool size during peak hours',
          'Monitor memory usage growth trend'
        ],
        charts: {
          responseTime: 'base64_chart_data',
          errorRate: 'base64_chart_data',
          throughput: 'base64_chart_data'
        }
      });

      const report = PerformanceMonitor.generateReport(reportConfig);

      expect(report.summary.errorRate).toBeLessThan(0.01);
      expect(report.sections.performance.availability.uptime).toBe('99.9%');
      expect(report.recommendations).toHaveLength(3);
      expect(report.charts.responseTime).toBeDefined();
    });

    it('should provide performance insights and recommendations', () => {
      PerformanceMonitor.getInsights.mockReturnValue({
        insights: [
          {
            type: 'performance',
            severity: 'medium',
            title: 'Response time degradation detected',
            description: 'Average response time increased by 15% over the last 2 hours',
            impact: 'User experience may be affected during peak hours',
            recommendation: 'Consider scaling up during high traffic periods',
            confidence: 0.85
          },
          {
            type: 'optimization',
            severity: 'low',
            title: 'Cache hit rate opportunity',
            description: 'Cache hit rate is 78%, potential for improvement',
            impact: 'Better caching could reduce database load by 15%',
            recommendation: 'Optimize cache TTL for frequently accessed data',
            confidence: 0.92
          }
        ],
        score: 82, // Overall performance score
        trends: {
          performance: 'stable',
          errors: 'improving',
          resources: 'concerning'
        }
      });

      const insights = PerformanceMonitor.getInsights();

      expect(insights.insights).toHaveLength(2);
      expect(insights.score).toBeGreaterThan(80);
      expect(insights.trends.errors).toBe('improving');
      expect(insights.insights[0].confidence).toBeGreaterThan(0.8);
    });
  });
});

describe('Performance Monitoring Integration', () => {
  it('should integrate with multiple monitoring systems', () => {
    const integrations = {
      prometheus: { enabled: true, endpoint: '/metrics' },
      grafana: { enabled: true, dashboard: 'chatbot-performance' },
      datadog: { enabled: false },
      newrelic: { enabled: true, appId: 'app123' }
    };

    PerformanceMonitor.exportMetrics.mockReturnValue({
      exported: true,
      formats: {
        prometheus: { metrics: 156, endpoint: '/metrics' },
        grafana: { dashboards: 3, updated: true },
        newrelic: { events: 1234, insights: 45 }
      },
      timestamp: Date.now()
    });

    const result = PerformanceMonitor.exportMetrics(integrations);

    expect(result.exported).toBe(true);
    expect(result.formats.prometheus.metrics).toBeGreaterThan(100);
    expect(result.formats.grafana.updated).toBe(true);
  });

  it('should handle monitoring failures gracefully', () => {
    PerformanceMonitor.recordMetric.mockImplementation(() => {
      throw new Error('Monitoring service unavailable');
    });

    expect(() => {
      try {
        PerformanceMonitor.recordMetric({ name: 'test', value: 1 });
      } catch (error) {
        // Should log error but not crash the application
        console.error('Monitoring error:', error.message);
      }
    }).not.toThrow();
  });
});

// Helper function for trend generation
function generateHourlyTrend(hours: number): Array<{ hour: number; avgTime: number; requests: number }> {
  const trend = [];
  const baseTime = 100; // Base response time

  for (let i = 0; i < hours; i++) {
    const hourVariation = Math.sin((i / 24) * 2 * Math.PI) * 30; // Daily pattern
    const randomVariation = (Math.random() - 0.5) * 20;
    const avgTime = Math.max(50, baseTime + hourVariation + randomVariation);

    const baseRequests = 500;
    const requestVariation = Math.sin((i / 24) * 2 * Math.PI) * 200;
    const requests = Math.max(100, baseRequests + requestVariation + (Math.random() - 0.5) * 100);

    trend.push({
      hour: i,
      avgTime: Math.round(avgTime),
      requests: Math.round(requests)
    });
  }

  return trend;
}