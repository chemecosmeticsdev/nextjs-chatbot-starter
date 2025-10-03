import { connectionManager } from './connection-manager';
import {
  createHeartbeatPing,
  createWebSocketMessage,
  WebSocketMessageType,
  createErrorNotification
} from './message-types';

export interface HeartbeatConfig {
  pingInterval: number; // How often to send pings (ms)
  pongTimeout: number;  // How long to wait for pong before considering connection dead (ms)
  maxMissedPings: number; // Maximum consecutive missed pongs before disconnection
}

export class HeartbeatManager {
  private config: HeartbeatConfig;
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionHealth = new Map<string, {
    lastPingAt: number;
    lastPongAt: number;
    missedPings: number;
    latency: number;
    isHealthy: boolean;
  }>();

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = {
      pingInterval: config.pingInterval || 30000, // 30 seconds
      pongTimeout: config.pongTimeout || 60000,   // 60 seconds
      maxMissedPings: config.maxMissedPings || 3
    };
  }

  /**
   * Start heartbeat monitoring
   */
  start(): void {
    if (this.pingInterval) {
      console.log('Heartbeat manager already running');
      return;
    }

    console.log(`Starting heartbeat manager (ping every ${this.config.pingInterval}ms)`);

    this.pingInterval = setInterval(() => {
      this.sendPingToAllConnections();
      this.checkConnectionHealth();
    }, this.config.pingInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      console.log('Heartbeat manager stopped');
    }

    this.connectionHealth.clear();
  }

  /**
   * Register a new connection for health monitoring
   */
  registerConnection(connectionId: string): void {
    const now = Date.now();
    this.connectionHealth.set(connectionId, {
      lastPingAt: now,
      lastPongAt: now,
      missedPings: 0,
      latency: 0,
      isHealthy: true
    });
  }

  /**
   * Unregister a connection from health monitoring
   */
  unregisterConnection(connectionId: string): void {
    this.connectionHealth.delete(connectionId);
  }

  /**
   * Handle pong response from a connection
   */
  handlePong(connectionId: string, pongTimestamp?: number): void {
    const health = this.connectionHealth.get(connectionId);
    if (!health) {
      return;
    }

    const now = Date.now();
    health.lastPongAt = now;
    health.missedPings = 0;
    health.isHealthy = true;

    // Calculate latency if ping timestamp is provided
    if (pongTimestamp) {
      health.latency = now - pongTimestamp;
    }

    this.connectionHealth.set(connectionId, health);
  }

  /**
   * Send ping to all active connections
   */
  private sendPingToAllConnections(): void {
    const connections = connectionManager.getStats();
    const pingMessage = createHeartbeatPing();

    let sentCount = 0;
    let failedCount = 0;

    // Update ping times for all connections
    this.connectionHealth.forEach((health, connectionId) => {
      health.lastPingAt = Date.now();

      const sent = connectionManager.sendToConnection(connectionId, pingMessage);
      if (sent) {
        sentCount++;
      } else {
        failedCount++;
        // Connection might be dead, mark it
        health.missedPings++;
      }
    });

    console.debug(`Heartbeat ping sent to ${sentCount} connections, ${failedCount} failed`);
  }

  /**
   * Check health of all connections and cleanup unhealthy ones
   */
  private checkConnectionHealth(): void {
    const now = Date.now();
    const unhealthyConnections: string[] = [];

    this.connectionHealth.forEach((health, connectionId) => {
      // Check if connection hasn't ponged in the timeout period
      const timeSinceLastPong = now - health.lastPongAt;

      if (timeSinceLastPong > this.config.pongTimeout) {
        health.missedPings++;
        health.isHealthy = false;

        // If too many pings missed, mark for removal
        if (health.missedPings >= this.config.maxMissedPings) {
          unhealthyConnections.push(connectionId);
        }
      }
    });

    // Remove unhealthy connections
    unhealthyConnections.forEach(connectionId => {
      console.log(`Removing unhealthy connection: ${connectionId}`);

      // Send error notification before closing
      const errorMessage = createErrorNotification(
        'low',
        'Connection timeout - no heartbeat response'
      );
      connectionManager.sendToConnection(connectionId, errorMessage);

      // Remove the connection
      connectionManager.removeConnection(connectionId);
      this.unregisterConnection(connectionId);
    });

    if (unhealthyConnections.length > 0) {
      console.log(`Cleaned up ${unhealthyConnections.length} unhealthy connections`);
    }
  }

  /**
   * Get health statistics for all connections
   */
  getHealthStats(): {
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
    averageLatency: number;
    connectionDetails: Array<{
      connectionId: string;
      isHealthy: boolean;
      latency: number;
      missedPings: number;
      lastPongAge: number;
    }>;
  } {
    const now = Date.now();
    let totalLatency = 0;
    let healthyCount = 0;
    let unhealthyCount = 0;
    const connectionDetails: Array<{
      connectionId: string;
      isHealthy: boolean;
      latency: number;
      missedPings: number;
      lastPongAge: number;
    }> = [];

    this.connectionHealth.forEach((health, connectionId) => {
      const lastPongAge = now - health.lastPongAt;

      connectionDetails.push({
        connectionId,
        isHealthy: health.isHealthy,
        latency: health.latency,
        missedPings: health.missedPings,
        lastPongAge
      });

      if (health.isHealthy) {
        healthyCount++;
        totalLatency += health.latency;
      } else {
        unhealthyCount++;
      }
    });

    return {
      totalConnections: this.connectionHealth.size,
      healthyConnections: healthyCount,
      unhealthyConnections: unhealthyCount,
      averageLatency: healthyCount > 0 ? totalLatency / healthyCount : 0,
      connectionDetails
    };
  }

  /**
   * Get health status for a specific connection
   */
  getConnectionHealth(connectionId: string): {
    isHealthy: boolean;
    latency: number;
    missedPings: number;
    lastPongAge: number;
  } | null {
    const health = this.connectionHealth.get(connectionId);
    if (!health) {
      return null;
    }

    return {
      isHealthy: health.isHealthy,
      latency: health.latency,
      missedPings: health.missedPings,
      lastPongAge: Date.now() - health.lastPongAt
    };
  }

  /**
   * Force health check for all connections
   */
  forceHealthCheck(): void {
    this.checkConnectionHealth();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Heartbeat configuration updated:', this.config);
  }
}

// Global heartbeat manager instance
export const heartbeatManager = new HeartbeatManager();

// Auto-start heartbeat when module is loaded
heartbeatManager.start();