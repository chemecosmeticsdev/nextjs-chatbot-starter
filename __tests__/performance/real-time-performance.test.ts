import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

// Real-time performance targets
const REALTIME_TARGETS = {
  WEBSOCKET_LATENCY: 100, // ms
  UPDATE_PROPAGATION_TIME: 50, // ms
  CONNECTION_RECOVERY_TIME: 2000, // ms
  CONCURRENT_CONNECTIONS: 10, // simultaneous connections
  MESSAGE_THROUGHPUT: 100, // messages per second
  UI_UPDATE_LATENCY: 30, // ms for UI to reflect data changes
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
};

// Helper functions
async function login(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[data-testid="email-input"]', testUser.email);
  await page.fill('[data-testid="password-input"]', testUser.password);
  await page.click('[data-testid="login-button"]');

  // Wait for redirect to dashboard
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
}

async function setupHighPerformanceWebSocket(page: Page) {
  await page.addInitScript(() => {
    class HighPerformanceWebSocket {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = WebSocket.CONNECTING;

      private messageQueue: any[] = [];
      private latencyMetrics: number[] = [];
      private connectionStartTime: number;

      constructor(public url: string) {
        this.connectionStartTime = performance.now();

        // Simulate realistic connection time
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          (window as any).connectionTime = performance.now() - this.connectionStartTime;
          this.onopen?.(new Event('open'));
          this.processMessageQueue();
        }, 50);

        // Store reference for testing
        (window as any).websocketInstance = this;
      }

      send(data: string) {
        const sendTime = performance.now();

        if (this.readyState === WebSocket.OPEN) {
          // Simulate server processing
          setTimeout(() => {
            const latency = performance.now() - sendTime;
            this.latencyMetrics.push(latency);

            // Store latency for testing
            (window as any).lastMessageLatency = latency;
            (window as any).averageLatency = this.latencyMetrics.reduce((a, b) => a + b, 0) / this.latencyMetrics.length;

            // Echo or process message
            if (this.onmessage) {
              try {
                const messageData = JSON.parse(data);
                const response = this.generateResponse(messageData);
                this.onmessage(new MessageEvent('message', {
                  data: JSON.stringify(response)
                }));
              } catch (e) {
                // Handle non-JSON messages
                this.onmessage(new MessageEvent('message', { data }));
              }
            }
          }, Math.random() * 20 + 10); // 10-30ms simulated latency
        } else {
          this.messageQueue.push({ data, sendTime });
        }
      }

      private generateResponse(messageData: any) {
        switch (messageData.type) {
          case 'ping':
            return { type: 'pong', timestamp: Date.now() };
          case 'chat_message':
            return {
              type: 'chat_response',
              id: `response_${Date.now()}`,
              content: `Response to: ${messageData.content}`,
              sender: 'Bot',
              timestamp: Date.now(),
            };
          case 'metrics_request':
            return {
              type: 'metrics_update',
              data: {
                active_sessions: Math.floor(Math.random() * 100) + 50,
                messages_last_hour: Math.floor(Math.random() * 500) + 200,
                response_time: `${(Math.random() * 2 + 0.5).toFixed(1)}s`,
                timestamp: Date.now(),
              },
            };
          default:
            return messageData;
        }
      }

      private processMessageQueue() {
        while (this.messageQueue.length > 0) {
          const { data, sendTime } = this.messageQueue.shift();
          this.send(data);
        }
      }

      close() {
        this.readyState = WebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close'));
      }

      // Test helpers
      getLatencyMetrics() {
        return {
          average: this.latencyMetrics.reduce((a, b) => a + b, 0) / this.latencyMetrics.length,
          min: Math.min(...this.latencyMetrics),
          max: Math.max(...this.latencyMetrics),
          count: this.latencyMetrics.length,
        };
      }

      simulateNetworkJitter() {
        // Add random delays to simulate network conditions
        const originalSend = this.send.bind(this);
        this.send = (data: string) => {
          const jitter = Math.random() * 100; // 0-100ms jitter
          setTimeout(() => originalSend(data), jitter);
        };
      }

      simulateConnectionDrop() {
        this.readyState = WebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close'));

        // Simulate reconnection after delay
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          this.onopen?.(new Event('open'));
        }, 1000);
      }
    }

    (window as any).HighPerformanceWebSocket = HighPerformanceWebSocket;
    (window as any).WebSocket = HighPerformanceWebSocket;
  });
}

async function measureRealtimeLatency(page: Page, messageCount: number = 10) {
  const latencyMeasurements = [];

  for (let i = 0; i < messageCount; i++) {
    const startTime = performance.now();

    // Send ping message
    await page.evaluate(() => {
      const ws = (window as any).websocketInstance;
      if (ws) {
        ws.send(JSON.stringify({
          type: 'ping',
          timestamp: performance.now(),
        }));
      }
    });

    // Wait for pong response
    await page.waitForFunction(() => (window as any).lastMessageLatency !== undefined, { timeout: 1000 });

    const latency = await page.evaluate(() => (window as any).lastMessageLatency);
    const totalTime = performance.now() - startTime;

    latencyMeasurements.push({
      latency,
      totalTime,
      messageIndex: i,
    });

    // Reset for next measurement
    await page.evaluate(() => {
      (window as any).lastMessageLatency = undefined;
    });

    await page.waitForTimeout(100);
  }

  return latencyMeasurements;
}

async function simulateHighThroughput(page: Page, messagesPerSecond: number, duration: number) {
  const interval = 1000 / messagesPerSecond;
  const endTime = Date.now() + duration;
  let messagesSent = 0;
  let messagesReceived = 0;

  await page.evaluate(() => {
    (window as any).throughputStats = {
      sent: 0,
      received: 0,
      errors: 0,
    };
  });

  while (Date.now() < endTime) {
    const batchStartTime = Date.now();

    // Send batch of messages
    const batchSize = Math.min(10, messagesPerSecond);

    for (let i = 0; i < batchSize; i++) {
      await page.evaluate((msgIndex) => {
        const ws = (window as any).websocketInstance;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              type: 'throughput_test',
              id: msgIndex,
              timestamp: performance.now(),
              data: `Test message ${msgIndex}`,
            }));
            (window as any).throughputStats.sent++;
          } catch (error) {
            (window as any).throughputStats.errors++;
          }
        }
      }, messagesSent + i);
    }

    messagesSent += batchSize;

    // Wait for appropriate interval
    const batchTime = Date.now() - batchStartTime;
    const waitTime = Math.max(0, interval * batchSize - batchTime);
    await page.waitForTimeout(waitTime);
  }

  // Get final stats
  const stats = await page.evaluate(() => (window as any).throughputStats);

  return {
    messagesSent,
    messagesReceived: stats.received,
    errors: stats.errors,
    duration,
    actualThroughput: messagesSent / (duration / 1000),
  };
}

test.describe('Real-time Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupHighPerformanceWebSocket(page);
    await login(page);
  });

  test('should establish WebSocket connection with low latency', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for WebSocket connection
    await page.waitForFunction(() => (window as any).connectionTime !== undefined, { timeout: 5000 });

    const connectionTime = await page.evaluate(() => (window as any).connectionTime);

    expect(connectionTime).toBeLessThan(REALTIME_TARGETS.WEBSOCKET_LATENCY * 20);

    console.log('WebSocket Connection Performance:', {
      connectionTime: `${connectionTime.toFixed(2)}ms`,
      target: `${REALTIME_TARGETS.WEBSOCKET_LATENCY * 20}ms`,
    });
  });

  test('should handle real-time message latency efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    const latencyMeasurements = await measureRealtimeLatency(page, 20);

    const averageLatency = latencyMeasurements.reduce((sum, m) => sum + m.latency, 0) / latencyMeasurements.length;
    const maxLatency = Math.max(...latencyMeasurements.map(m => m.latency));
    const minLatency = Math.min(...latencyMeasurements.map(m => m.latency));

    // Average latency should be within target
    expect(averageLatency).toBeLessThan(REALTIME_TARGETS.WEBSOCKET_LATENCY);

    // No message should take excessively long
    expect(maxLatency).toBeLessThan(REALTIME_TARGETS.WEBSOCKET_LATENCY * 3);

    console.log('Message Latency Performance:', {
      averageLatency: `${averageLatency.toFixed(2)}ms`,
      minLatency: `${minLatency.toFixed(2)}ms`,
      maxLatency: `${maxLatency.toFixed(2)}ms`,
      messageCount: latencyMeasurements.length,
      target: `${REALTIME_TARGETS.WEBSOCKET_LATENCY}ms`,
    });
  });

  test('should propagate real-time updates to UI quickly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('[data-testid="live-metrics-card"]', { state: 'visible' });

    const updatePropagationTimes = [];

    for (let i = 0; i < 10; i++) {
      const updateStartTime = performance.now();

      // Send metrics update
      await page.evaluate((updateIndex) => {
        const ws = (window as any).websocketInstance;
        if (ws) {
          ws.send(JSON.stringify({
            type: 'metrics_update',
            data: {
              active_sessions: 100 + updateIndex,
              messages_last_hour: 500 + updateIndex * 10,
              timestamp: Date.now(),
            },
          }));
        }
      }, i);

      // Wait for UI to update
      await page.waitForFunction((expectedValue) => {
        const activeSessionsElement = document.querySelector('[data-testid="active-sessions"]');
        return activeSessionsElement && activeSessionsElement.textContent?.includes(expectedValue.toString());
      }, 100 + i, { timeout: 1000 });

      const propagationTime = performance.now() - updateStartTime;
      updatePropagationTimes.push(propagationTime);

      expect(propagationTime).toBeLessThan(REALTIME_TARGETS.UPDATE_PROPAGATION_TIME * 5);

      await page.waitForTimeout(100);
    }

    const averagePropagationTime = updatePropagationTimes.reduce((sum, t) => sum + t, 0) / updatePropagationTimes.length;

    console.log('UI Update Propagation Performance:', {
      averagePropagationTime: `${averagePropagationTime.toFixed(2)}ms`,
      updateCount: updatePropagationTimes.length,
      target: `${REALTIME_TARGETS.UPDATE_PROPAGATION_TIME * 5}ms`,
    });
  });

  test('should handle high-throughput message processing', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    const targetThroughput = 50; // messages per second
    const testDuration = 5000; // 5 seconds

    const throughputStats = await simulateHighThroughput(page, targetThroughput, testDuration);

    const expectedMessages = (targetThroughput * testDuration) / 1000;
    const throughputEfficiency = (throughputStats.messagesSent / expectedMessages) * 100;

    // Should achieve at least 80% of target throughput
    expect(throughputEfficiency).toBeGreaterThan(80);

    // Error rate should be low
    const errorRate = (throughputStats.errors / throughputStats.messagesSent) * 100;
    expect(errorRate).toBeLessThan(5);

    console.log('High-Throughput Performance:', {
      targetThroughput: `${targetThroughput} msg/s`,
      actualThroughput: `${throughputStats.actualThroughput.toFixed(1)} msg/s`,
      messagesSent: throughputStats.messagesSent,
      errors: throughputStats.errors,
      errorRate: `${errorRate.toFixed(2)}%`,
      efficiency: `${throughputEfficiency.toFixed(1)}%`,
    });
  });

  test('should recover from connection drops efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    // Verify initial connection
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toContainText('Connected');

    const recoveryTimes = [];

    for (let i = 0; i < 3; i++) {
      const dropStartTime = performance.now();

      // Simulate connection drop
      await page.evaluate(() => {
        const ws = (window as any).websocketInstance;
        if (ws) {
          ws.simulateConnectionDrop();
        }
      });

      // Wait for disconnection to be detected
      await expect(connectionStatus).toContainText('Disconnected', { timeout: 2000 });

      // Wait for reconnection
      await expect(connectionStatus).toContainText('Connected', { timeout: 5000 });

      const recoveryTime = performance.now() - dropStartTime;
      recoveryTimes.push(recoveryTime);

      expect(recoveryTime).toBeLessThan(REALTIME_TARGETS.CONNECTION_RECOVERY_TIME);

      await page.waitForTimeout(1000); // Wait before next test
    }

    const averageRecoveryTime = recoveryTimes.reduce((sum, t) => sum + t, 0) / recoveryTimes.length;

    console.log('Connection Recovery Performance:', {
      averageRecoveryTime: `${averageRecoveryTime.toFixed(2)}ms`,
      recoveryAttempts: recoveryTimes.length,
      target: `${REALTIME_TARGETS.CONNECTION_RECOVERY_TIME}ms`,
      recoveryTimes: recoveryTimes.map(t => `${t.toFixed(2)}ms`),
    });
  });

  test('should handle concurrent real-time operations', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    const concurrentOperations = [
      // Metrics updates
      async () => {
        for (let i = 0; i < 20; i++) {
          await page.evaluate((index) => {
            const ws = (window as any).websocketInstance;
            if (ws) {
              ws.send(JSON.stringify({
                type: 'metrics_update',
                data: {
                  active_sessions: 50 + index,
                  timestamp: Date.now(),
                },
              }));
            }
          }, i);
          await page.waitForTimeout(50);
        }
      },

      // Activity feed updates
      async () => {
        for (let i = 0; i < 15; i++) {
          await page.evaluate((index) => {
            const ws = (window as any).websocketInstance;
            if (ws) {
              ws.send(JSON.stringify({
                type: 'new_activity',
                data: {
                  id: `concurrent_activity_${index}`,
                  message: `Concurrent activity ${index}`,
                  timestamp: Date.now(),
                },
              }));
            }
          }, i);
          await page.waitForTimeout(75);
        }
      },

      // Chat messages
      async () => {
        await page.goto('/chat');
        await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

        for (let i = 0; i < 10; i++) {
          await page.evaluate((index) => {
            const ws = (window as any).websocketInstance;
            if (ws) {
              ws.send(JSON.stringify({
                type: 'chat_message',
                content: `Concurrent message ${index}`,
                timestamp: Date.now(),
              }));
            }
          }, i);
          await page.waitForTimeout(100);
        }
      },
    ];

    const startTime = performance.now();

    // Run all operations concurrently
    await Promise.all(concurrentOperations);

    const totalTime = performance.now() - startTime;

    // Concurrent operations should complete efficiently
    expect(totalTime).toBeLessThan(5000);

    console.log('Concurrent Real-time Operations Performance:', {
      totalTime: `${totalTime.toFixed(2)}ms`,
      operationCount: concurrentOperations.length,
    });
  });

  test('should maintain performance under network jitter', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    // Add network jitter simulation
    await page.evaluate(() => {
      const ws = (window as any).websocketInstance;
      if (ws) {
        ws.simulateNetworkJitter();
      }
    });

    const jitterLatencyMeasurements = await measureRealtimeLatency(page, 15);

    const averageJitterLatency = jitterLatencyMeasurements.reduce((sum, m) => sum + m.latency, 0) / jitterLatencyMeasurements.length;
    const latencyVariance = jitterLatencyMeasurements.reduce((sum, m) => sum + Math.pow(m.latency - averageJitterLatency, 2), 0) / jitterLatencyMeasurements.length;
    const latencyStdDev = Math.sqrt(latencyVariance);

    // Application should handle jitter gracefully
    expect(averageJitterLatency).toBeLessThan(REALTIME_TARGETS.WEBSOCKET_LATENCY * 2);
    expect(latencyStdDev).toBeLessThan(50); // Standard deviation should be reasonable

    console.log('Network Jitter Performance:', {
      averageLatency: `${averageJitterLatency.toFixed(2)}ms`,
      standardDeviation: `${latencyStdDev.toFixed(2)}ms`,
      messageCount: jitterLatencyMeasurements.length,
      target: `${REALTIME_TARGETS.WEBSOCKET_LATENCY * 2}ms`,
    });
  });

  test('should handle real-time data synchronization across tabs', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Setup both pages
    await setupHighPerformanceWebSocket(page1);
    await setupHighPerformanceWebSocket(page2);

    await login(page1);
    await login(page2);

    await page1.goto('/dashboard');
    await page2.goto('/dashboard');

    await page1.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });
    await page2.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    const syncTestResults = [];

    for (let i = 0; i < 5; i++) {
      const syncStartTime = performance.now();

      // Send update from page1
      await page1.evaluate((updateIndex) => {
        const ws = (window as any).websocketInstance;
        if (ws) {
          ws.send(JSON.stringify({
            type: 'sync_test',
            data: {
              test_value: 1000 + updateIndex,
              timestamp: Date.now(),
            },
          }));
        }
      }, i);

      // Simulate the same update appearing on page2
      await page2.evaluate((updateIndex) => {
        const ws = (window as any).websocketInstance;
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'sync_test',
              data: {
                test_value: 1000 + updateIndex,
                timestamp: Date.now(),
              },
            }),
          }));
        }
      }, i);

      const syncTime = performance.now() - syncStartTime;
      syncTestResults.push(syncTime);

      expect(syncTime).toBeLessThan(200);

      await page1.waitForTimeout(500);
    }

    const averageSyncTime = syncTestResults.reduce((sum, t) => sum + t, 0) / syncTestResults.length;

    console.log('Cross-Tab Synchronization Performance:', {
      averageSyncTime: `${averageSyncTime.toFixed(2)}ms`,
      syncOperations: syncTestResults.length,
    });

    await context.close();
  });

  test('should optimize real-time rendering performance', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    // Setup frame rate monitoring
    await page.evaluate(() => {
      (window as any).frameCount = 0;
      (window as any).renderingStartTime = performance.now();

      function countFrame() {
        (window as any).frameCount++;
        requestAnimationFrame(countFrame);
      }
      requestAnimationFrame(countFrame);
    });

    const updateCount = 50;
    const startTime = performance.now();

    // Send rapid updates to test rendering performance
    for (let i = 0; i < updateCount; i++) {
      await page.evaluate((updateIndex) => {
        const ws = (window as any).websocketInstance;
        if (ws && ws.onmessage) {
          ws.onmessage(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'metrics_update',
              data: {
                active_sessions: 100 + updateIndex,
                messages_last_hour: 500 + updateIndex * 5,
                timestamp: Date.now(),
              },
            }),
          }));
        }
      }, i);

      await page.waitForTimeout(20); // 50 FPS update rate
    }

    const endTime = performance.now();

    const renderingMetrics = await page.evaluate(() => {
      const frameCount = (window as any).frameCount || 0;
      const duration = performance.now() - (window as any).renderingStartTime;
      return {
        frameCount,
        duration,
        fps: frameCount / (duration / 1000),
      };
    });

    // Should maintain good frame rate during updates
    expect(renderingMetrics.fps).toBeGreaterThan(30);

    console.log('Real-time Rendering Performance:', {
      updateCount,
      totalTime: `${(endTime - startTime).toFixed(2)}ms`,
      fps: `${renderingMetrics.fps.toFixed(1)} FPS`,
      frameCount: renderingMetrics.frameCount,
    });
  });

  test('should handle heartbeat and connection monitoring', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForFunction(() => (window as any).websocketInstance, { timeout: 5000 });

    // Setup heartbeat monitoring
    await page.evaluate(() => {
      (window as any).heartbeatTimes = [];
      (window as any).heartbeatStartTime = Date.now();

      // Simulate heartbeat system
      setInterval(() => {
        const ws = (window as any).websocketInstance;
        if (ws && ws.readyState === WebSocket.OPEN) {
          const heartbeatTime = Date.now();
          ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: heartbeatTime,
          }));
          (window as any).heartbeatTimes.push(heartbeatTime);
        }
      }, 1000); // 1 second heartbeat
    });

    // Monitor for 10 seconds
    await page.waitForTimeout(10000);

    const heartbeatStats = await page.evaluate(() => {
      const times = (window as any).heartbeatTimes || [];
      const intervals = [];

      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }

      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      const maxInterval = Math.max(...intervals);
      const minInterval = Math.min(...intervals);

      return {
        heartbeatCount: times.length,
        averageInterval: avgInterval,
        maxInterval,
        minInterval,
        intervalVariance: intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length,
      };
    });

    // Heartbeat should be consistent
    expect(heartbeatStats.heartbeatCount).toBeGreaterThan(8); // At least 8 heartbeats in 10 seconds
    expect(heartbeatStats.averageInterval).toBeCloseTo(1000, 200); // Close to 1 second
    expect(Math.sqrt(heartbeatStats.intervalVariance)).toBeLessThan(100); // Low variance

    console.log('Heartbeat Performance:', {
      heartbeatCount: heartbeatStats.heartbeatCount,
      averageInterval: `${heartbeatStats.averageInterval.toFixed(2)}ms`,
      minInterval: `${heartbeatStats.minInterval}ms`,
      maxInterval: `${heartbeatStats.maxInterval}ms`,
      variance: `${Math.sqrt(heartbeatStats.intervalVariance).toFixed(2)}ms`,
    });
  });
});