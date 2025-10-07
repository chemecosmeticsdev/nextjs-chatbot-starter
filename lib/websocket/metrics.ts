import { connectionManager } from './connection-manager';
import { messageBroker } from './message-broker';
import { heartbeatManager } from './heartbeat';
import { webSocketRateLimiter } from './rate-limiter';

export interface WebSocketMetrics {
  connections: {
    total: number;
    healthy: number;
    unhealthy: number;
    byRole: Record<string, number>;
    averageLatency: number;
  };
  rooms: {
    total: number;
    byType: Record<string, number>;
    averageSize: number;
  };
  messages: {
    totalSent: number;
    totalReceived: number;
    messagesPerSecond: number;
    averageProcessingTime: number;
    errorRate: number;
  };
  rateLimiting: {
    totalLimits: number;
    activeLimits: number;
    blockedConnections: number;
    limitsByType: Record<string, number>;
  };
  performance: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage?: NodeJS.CpuUsage;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    recentErrors: Array<{
      timestamp: number;
      type: string;
      message: string;
      connectionId?: string;
    }>;
  };
}

export class WebSocketMetricsCollector {
  private messageStats = {
    totalSent: 0,
    totalReceived: 0,
    totalProcessingTime: 0,
    totalErrors: 0,
    recentMessages: [] as Array<{ timestamp: number; processingTime: number }>
  };

  private errorStats = {
    total: 0,
    byType: new Map<string, number>(),
    recentErrors: [] as Array<{
      timestamp: number;
      type: string;
      message: string;
      connectionId?: string;
    }>
  };

  private performanceStats = {
    startTime: Date.now(),
    lastCpuUsage: process.cpuUsage()
  };

  constructor() {
    this.startMetricsCollection();
  }

  /**
   * Record a sent message
   */
  recordMessageSent(processingTime: number = 0): void {
    this.messageStats.totalSent++;
    this.messageStats.totalProcessingTime += processingTime;
    this.messageStats.recentMessages.push({
      timestamp: Date.now(),
      processingTime
    });

    // Keep only recent messages (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 300000;
    this.messageStats.recentMessages = this.messageStats.recentMessages.filter(
      msg => msg.timestamp > fiveMinutesAgo
    );
  }

  /**
   * Record a received message
   */
  recordMessageReceived(): void {
    this.messageStats.totalReceived++;
  }

  /**
   * Record an error
   */
  recordError(type: string, message: string, connectionId?: string): void {
    this.errorStats.total++;
    this.errorStats.byType.set(type, (this.errorStats.byType.get(type) || 0) + 1);
    this.errorStats.recentErrors.push({
      timestamp: Date.now(),
      type,
      message,
      connectionId
    });

    // Keep only recent errors (last hour)
    const oneHourAgo = Date.now() - 3600000;
    this.errorStats.recentErrors = this.errorStats.recentErrors.filter(
      error => error.timestamp > oneHourAgo
    );

    // Limit to 100 most recent errors
    if (this.errorStats.recentErrors.length > 100) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(-100);
    }
  }

  /**
   * Get comprehensive WebSocket metrics
   */
  getMetrics(): WebSocketMetrics {
    const connectionStats = connectionManager.getStats();
    const healthStats = heartbeatManager.getHealthStats();
    const rateLimitStats = webSocketRateLimiter.getStats();
    const brokerStats = messageBroker.getStats();

    // Calculate messages per second (based on last 5 minutes)
    const fiveMinutesAgo = Date.now() - 300000;
    const recentMessages = this.messageStats.recentMessages.filter(
      msg => msg.timestamp > fiveMinutesAgo
    );
    const messagesPerSecond = recentMessages.length / 300; // 5 minutes = 300 seconds

    // Calculate average processing time
    const averageProcessingTime = recentMessages.length > 0
      ? recentMessages.reduce((sum, msg) => sum + msg.processingTime, 0) / recentMessages.length
      : 0;

    // Calculate error rate
    const totalRecentMessages = this.messageStats.totalSent + this.messageStats.totalReceived;
    const errorRate = totalRecentMessages > 0 ? this.errorStats.total / totalRecentMessages : 0;

    // Get connection breakdown by role
    const connectionsByRole: Record<string, number> = {};
    // This would need to be implemented in connection manager to track roles

    // Get room breakdown by type
    const roomsByType: Record<string, number> = {};
    connectionStats.roomStats.forEach(room => {
      roomsByType[room.type] = (roomsByType[room.type] || 0) + 1;
    });

    // Calculate average room size
    const averageRoomSize = connectionStats.totalRooms > 0
      ? connectionStats.roomStats.reduce((sum, room) => sum + room.connections, 0) / connectionStats.totalRooms
      : 0;

    // Convert rate limit stats
    const limitsByType: Record<string, number> = {};
    rateLimitStats.limitsByType.forEach((count, type) => {
      limitsByType[type] = count;
    });

    // Convert error stats
    const errorsByType: Record<string, number> = {};
    this.errorStats.byType.forEach((count, type) => {
      errorsByType[type] = count;
    });

    return {
      connections: {
        total: connectionStats.totalConnections,
        healthy: healthStats.healthyConnections,
        unhealthy: healthStats.unhealthyConnections,
        byRole: connectionsByRole,
        averageLatency: healthStats.averageLatency
      },
      rooms: {
        total: connectionStats.totalRooms,
        byType: roomsByType,
        averageSize: averageRoomSize
      },
      messages: {
        totalSent: this.messageStats.totalSent,
        totalReceived: this.messageStats.totalReceived,
        messagesPerSecond,
        averageProcessingTime,
        errorRate
      },
      rateLimiting: {
        totalLimits: rateLimitStats.totalTrackedLimits,
        activeLimits: rateLimitStats.activeLimits,
        blockedConnections: rateLimitStats.blockedLimits,
        limitsByType
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        uptime: Date.now() - this.performanceStats.startTime,
        cpuUsage: process.cpuUsage(this.performanceStats.lastCpuUsage)
      },
      errors: {
        total: this.errorStats.total,
        byType: errorsByType,
        recentErrors: this.errorStats.recentErrors.slice(-20) // Last 20 errors
      }
    };
  }

  /**
   * Get metrics summary for health checks
   */
  getHealthSummary(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: number; // 0-100
    issues: string[];
  } {
    const metrics = this.getMetrics();
    const issues: string[] = [];
    let score = 100;

    // Check connection health
    if (metrics.connections.total > 0) {
      const healthyRatio = metrics.connections.healthy / metrics.connections.total;
      if (healthyRatio < 0.8) {
        issues.push(`Low connection health ratio: ${(healthyRatio * 100).toFixed(1)}%`);
        score -= 20;
      }
    }

    // Check error rate
    if (metrics.messages.errorRate > 0.05) { // More than 5% error rate
      issues.push(`High error rate: ${(metrics.messages.errorRate * 100).toFixed(1)}%`);
      score -= 15;
    }

    // Check memory usage
    const memoryUsageMB = metrics.performance.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 512) { // More than 512MB
      issues.push(`High memory usage: ${memoryUsageMB.toFixed(1)}MB`);
      score -= 10;
    }

    // Check blocked connections
    if (metrics.rateLimiting.blockedConnections > 0) {
      issues.push(`${metrics.rateLimiting.blockedConnections} blocked connections`);
      score -= 5;
    }

    // Check average latency
    if (metrics.connections.averageLatency > 1000) { // More than 1 second
      issues.push(`High average latency: ${metrics.connections.averageLatency}ms`);
      score -= 10;
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (score >= 90) {
      status = 'healthy';
    } else if (score >= 70) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      score: Math.max(0, score),
      issues
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.messageStats = {
      totalSent: 0,
      totalReceived: 0,
      totalProcessingTime: 0,
      totalErrors: 0,
      recentMessages: []
    };

    this.errorStats = {
      total: 0,
      byType: new Map(),
      recentErrors: []
    };

    this.performanceStats = {
      startTime: Date.now(),
      lastCpuUsage: process.cpuUsage()
    };
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Update CPU usage tracking every 10 seconds
    setInterval(() => {
      this.performanceStats.lastCpuUsage = process.cpuUsage(this.performanceStats.lastCpuUsage);
    }, 10000);

    // Log metrics summary every minute
    setInterval(() => {
      const healthSummary = this.getHealthSummary();
      console.log(`WebSocket Health: ${healthSummary.status} (score: ${healthSummary.score})`);
      if (healthSummary.issues.length > 0) {
        console.log('Issues:', healthSummary.issues);
      }
    }, 60000);
  }

  /**
   * Export metrics in Prometheus format (for monitoring integration)
   */
  exportPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Connection metrics
    lines.push(`websocket_connections_total ${metrics.connections.total}`);
    lines.push(`websocket_connections_healthy ${metrics.connections.healthy}`);
    lines.push(`websocket_connections_unhealthy ${metrics.connections.unhealthy}`);
    lines.push(`websocket_connections_average_latency_ms ${metrics.connections.averageLatency}`);

    // Message metrics
    lines.push(`websocket_messages_sent_total ${metrics.messages.totalSent}`);
    lines.push(`websocket_messages_received_total ${metrics.messages.totalReceived}`);
    lines.push(`websocket_messages_per_second ${metrics.messages.messagesPerSecond}`);
    lines.push(`websocket_messages_average_processing_time_ms ${metrics.messages.averageProcessingTime}`);
    lines.push(`websocket_messages_error_rate ${metrics.messages.errorRate}`);

    // Room metrics
    lines.push(`websocket_rooms_total ${metrics.rooms.total}`);
    lines.push(`websocket_rooms_average_size ${metrics.rooms.averageSize}`);

    // Performance metrics
    lines.push(`websocket_memory_heap_used_bytes ${metrics.performance.memoryUsage.heapUsed}`);
    lines.push(`websocket_memory_heap_total_bytes ${metrics.performance.memoryUsage.heapTotal}`);
    lines.push(`websocket_uptime_ms ${metrics.performance.uptime}`);

    // Error metrics
    lines.push(`websocket_errors_total ${metrics.errors.total}`);

    return lines.join('\n') + '\n';
  }
}

// Global metrics collector instance
export const webSocketMetrics = new WebSocketMetricsCollector();