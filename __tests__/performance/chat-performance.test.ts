import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

// Performance targets
const PERFORMANCE_TARGETS = {
  MESSAGE_LATENCY: 100, // ms
  WEBSOCKET_CONNECTION_TIME: 2000, // ms
  CHAT_LOAD_TIME: 500, // ms
  MESSAGE_RENDER_TIME: 50, // ms
  TYPING_INDICATOR_DELAY: 100, // ms
  FILE_UPLOAD_PROCESSING: 1000, // ms
  SCROLL_PERFORMANCE_FPS: 50, // frames per second
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

async function setupWebSocketMocking(page: Page) {
  await page.addInitScript(() => {
    class MockWebSocket {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = WebSocket.CONNECTING;

      constructor(public url: string) {
        (window as any).websocketConnectionStart = performance.now();

        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          (window as any).websocketConnectionTime = performance.now() - (window as any).websocketConnectionStart;
          this.onopen?.(new Event('open'));
        }, 50); // Simulate connection time
      }

      send(data: string) {
        const sendTime = performance.now();
        (window as any).lastMessageSendTime = sendTime;

        // Simulate server processing and response
        setTimeout(() => {
          const responseTime = performance.now();
          (window as any).lastMessageLatency = responseTime - sendTime;

          if (this.onmessage) {
            // Echo the message back as a response
            const messageData = JSON.parse(data);
            const response = {
              ...messageData,
              id: `response_${Date.now()}`,
              content: `Response to: ${messageData.content}`,
              sender: 'Bot',
              timestamp: Date.now(),
            };

            this.onmessage(new MessageEvent('message', {
              data: JSON.stringify(response)
            }));
          }
        }, 30); // Simulate network latency
      }

      close() {
        this.readyState = WebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close'));
      }
    }

    (window as any).MockWebSocket = MockWebSocket;
    (window as any).WebSocket = MockWebSocket;
  });
}

async function measureMessagePerformance(page: Page, message: string) {
  const startTime = performance.now();

  // Send message
  const chatInput = page.locator('[data-testid="chat-input"]');
  await chatInput.fill(message);

  const sendTime = performance.now();
  await page.click('[data-testid="send-button"]');

  // Wait for message to appear in chat
  await page.waitForSelector(`[data-testid="message-content"]:has-text("${message}")`, { state: 'visible' });

  const renderTime = performance.now();

  // Wait for response
  await page.waitForSelector(`[data-testid="message-content"]:has-text("Response to: ${message}")`, { state: 'visible' });

  const responseTime = performance.now();

  return {
    totalTime: responseTime - startTime,
    sendToRenderTime: renderTime - sendTime,
    renderToResponseTime: responseTime - renderTime,
    sendTime: sendTime - startTime,
  };
}

async function measureScrollPerformance(page: Page) {
  const messagesContainer = page.locator('[data-testid="messages-container"]');

  // Generate many messages for scroll testing
  for (let i = 0; i < 20; i++) {
    await page.evaluate((index) => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          id: `perf_msg_${index}`,
          content: `Performance test message ${index}`,
          sender: index % 2 === 0 ? 'User' : 'Bot',
          timestamp: Date.now() - (20 - index) * 1000,
        })
      }));
    }, i);

    await page.waitForTimeout(50);
  }

  // Measure scroll performance
  const scrollStartTime = performance.now();
  let frameCount = 0;

  // Start frame counting
  await page.evaluate(() => {
    (window as any).frameCount = 0;
    (window as any).scrollStartTime = performance.now();

    function countFrame() {
      (window as any).frameCount++;
      requestAnimationFrame(countFrame);
    }
    requestAnimationFrame(countFrame);
  });

  // Perform scroll operation
  await messagesContainer.evaluate(element => {
    element.scrollTop = 0; // Scroll to top
  });

  await page.waitForTimeout(100);

  await messagesContainer.evaluate(element => {
    element.scrollTop = element.scrollHeight; // Scroll to bottom
  });

  await page.waitForTimeout(100);

  const scrollEndTime = performance.now();

  const scrollMetrics = await page.evaluate(() => {
    const frameCount = (window as any).frameCount || 0;
    const duration = performance.now() - (window as any).scrollStartTime;
    return {
      frameCount,
      duration,
      fps: frameCount / (duration / 1000),
    };
  });

  return {
    totalScrollTime: scrollEndTime - scrollStartTime,
    ...scrollMetrics,
  };
}

test.describe('Chat Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupWebSocketMocking(page);
    await login(page);
  });

  test('should load chat interface within performance targets', async ({ page }) => {
    const startTime = performance.now();

    await page.goto('/chat');

    // Wait for chat interface to be fully loaded
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });
    await page.waitForSelector('[data-testid="chat-input"]', { state: 'visible' });

    const loadTime = performance.now() - startTime;

    // Chat should load within target time
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.CHAT_LOAD_TIME);

    console.log('Chat Load Performance:', {
      loadTime: `${loadTime.toFixed(2)}ms`,
    });
  });

  test('should establish WebSocket connection within target time', async ({ page }) => {
    await page.goto('/chat');

    // Wait for WebSocket connection
    await page.waitForFunction(() => (window as any).websocketConnectionTime !== undefined, { timeout: 5000 });

    const connectionTime = await page.evaluate(() => (window as any).websocketConnectionTime);

    expect(connectionTime).toBeLessThan(PERFORMANCE_TARGETS.WEBSOCKET_CONNECTION_TIME);

    console.log('WebSocket Connection Performance:', {
      connectionTime: `${connectionTime.toFixed(2)}ms`,
    });
  });

  test('should handle message sending and receiving with low latency', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const testMessages = [
      'Hello, this is a test message',
      'How are you doing today?',
      'Can you help me with a technical question?',
      'What is the weather like?',
      'Thank you for your assistance!',
    ];

    const messageMetrics = [];

    for (const message of testMessages) {
      const metrics = await measureMessagePerformance(page, message);
      messageMetrics.push(metrics);

      // Each message should meet performance targets
      expect(metrics.sendToRenderTime).toBeLessThan(PERFORMANCE_TARGETS.MESSAGE_RENDER_TIME);

      await page.waitForTimeout(100); // Small delay between messages
    }

    // Calculate average performance
    const avgTotalTime = messageMetrics.reduce((sum, m) => sum + m.totalTime, 0) / messageMetrics.length;
    const avgRenderTime = messageMetrics.reduce((sum, m) => sum + m.sendToRenderTime, 0) / messageMetrics.length;

    console.log('Message Performance Metrics:', {
      averageTotalTime: `${avgTotalTime.toFixed(2)}ms`,
      averageRenderTime: `${avgRenderTime.toFixed(2)}ms`,
      messageCount: messageMetrics.length,
    });

    // Get WebSocket latency from mock
    const latency = await page.evaluate(() => (window as any).lastMessageLatency);
    if (latency) {
      expect(latency).toBeLessThan(PERFORMANCE_TARGETS.MESSAGE_LATENCY);
    }
  });

  test('should handle typing indicators efficiently', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const chatInput = page.locator('[data-testid="chat-input"]');

    // Measure typing indicator performance
    const startTime = performance.now();

    // Start typing
    await chatInput.focus();
    await chatInput.type('T');

    // Simulate typing indicator from other user
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'typing_indicator',
          user: 'Other User',
          is_typing: true,
        })
      }));
    });

    // Wait for typing indicator to appear
    await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'visible' });

    const indicatorTime = performance.now() - startTime;

    expect(indicatorTime).toBeLessThan(PERFORMANCE_TARGETS.TYPING_INDICATOR_DELAY);

    // Test stopping typing
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'typing_indicator',
          user: 'Other User',
          is_typing: false,
        })
      }));
    });

    await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'hidden' });

    console.log('Typing Indicator Performance:', {
      indicatorTime: `${indicatorTime.toFixed(2)}ms`,
    });
  });

  test('should maintain performance with high message volume', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const messageCount = 100;
    const startTime = performance.now();

    // Send many messages rapidly
    for (let i = 0; i < messageCount; i++) {
      await page.evaluate((index) => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.onmessage?.(new MessageEvent('message', {
          data: JSON.stringify({
            id: `bulk_msg_${index}`,
            content: `Bulk test message ${index}`,
            sender: index % 2 === 0 ? 'User' : 'Bot',
            timestamp: Date.now() - (messageCount - index) * 100,
          })
        }));
      }, i);

      // Small delay to simulate realistic message flow
      if (i % 10 === 0) {
        await page.waitForTimeout(10);
      }
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // Verify messages are rendered
    const renderedMessages = await page.locator('[data-testid="message"]').count();
    expect(renderedMessages).toBeGreaterThan(0);

    // Performance should remain reasonable even with high volume
    const timePerMessage = totalTime / messageCount;
    expect(timePerMessage).toBeLessThan(10); // Less than 10ms per message

    console.log('High Volume Message Performance:', {
      totalTime: `${totalTime.toFixed(2)}ms`,
      messageCount,
      timePerMessage: `${timePerMessage.toFixed(2)}ms`,
      renderedMessages,
    });
  });

  test('should handle smooth scrolling performance', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const scrollMetrics = await measureScrollPerformance(page);

    // Scroll should maintain good frame rate
    expect(scrollMetrics.fps).toBeGreaterThan(PERFORMANCE_TARGETS.SCROLL_PERFORMANCE_FPS);

    console.log('Scroll Performance Metrics:', {
      totalScrollTime: `${scrollMetrics.totalScrollTime.toFixed(2)}ms`,
      frameCount: scrollMetrics.frameCount,
      fps: `${scrollMetrics.fps.toFixed(1)} FPS`,
      duration: `${scrollMetrics.duration.toFixed(2)}ms`,
    });
  });

  test('should handle file upload processing efficiently', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    // Mock file upload
    const fileInput = page.locator('[data-testid="file-input"]');

    if (await fileInput.isVisible()) {
      const startTime = performance.now();

      // Simulate file selection
      await fileInput.setInputFiles({
        name: 'test-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('This is a test file content for performance testing'),
      });

      // Wait for upload processing
      await page.waitForSelector('[data-testid="file-upload-progress"]', { state: 'visible' });
      await page.waitForSelector('[data-testid="file-upload-complete"]', { state: 'visible' });

      const uploadTime = performance.now() - startTime;

      expect(uploadTime).toBeLessThan(PERFORMANCE_TARGETS.FILE_UPLOAD_PROCESSING);

      console.log('File Upload Performance:', {
        uploadTime: `${uploadTime.toFixed(2)}ms`,
      });
    }
  });

  test('should maintain performance with concurrent chat operations', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const startTime = performance.now();

    // Perform multiple concurrent operations
    const operations = [
      // Send messages
      measureMessagePerformance(page, 'Concurrent message 1'),
      measureMessagePerformance(page, 'Concurrent message 2'),

      // Simulate incoming messages
      page.evaluate(() => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            ws.onmessage?.(new MessageEvent('message', {
              data: JSON.stringify({
                id: `concurrent_${i}`,
                content: `Concurrent incoming message ${i}`,
                sender: 'Bot',
                timestamp: Date.now(),
              })
            }));
          }, i * 100);
        }
      }),

      // Simulate typing indicators
      page.evaluate(() => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        setTimeout(() => {
          ws.onmessage?.(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'typing_indicator',
              user: 'Concurrent User',
              is_typing: true,
            })
          }));
        }, 200);
      }),
    ];

    await Promise.all(operations);

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // Concurrent operations should complete efficiently
    expect(totalTime).toBeLessThan(2000);

    console.log('Concurrent Operations Performance:', {
      totalTime: `${totalTime.toFixed(2)}ms`,
    });
  });

  test('should optimize memory usage during extended chat sessions', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
      } : null;
    });

    if (initialMemory) {
      // Simulate extended chat session
      for (let i = 0; i < 50; i++) {
        await page.evaluate((index) => {
          const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
          ws.onmessage?.(new MessageEvent('message', {
            data: JSON.stringify({
              id: `memory_test_${index}`,
              content: `Memory test message ${index} with some longer content to test memory usage patterns`,
              sender: index % 2 === 0 ? 'User' : 'Bot',
              timestamp: Date.now(),
            })
          }));
        }, i);

        if (i % 10 === 0) {
          await page.waitForTimeout(100);
        }
      }

      // Get final memory usage
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        } : null;
      });

      if (finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;

        // Memory increase should be reasonable
        expect(memoryIncreasePercent).toBeLessThan(100);

        console.log('Chat Memory Usage:', {
          initialMemory: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          finalMemory: `${(finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          increase: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
          increasePercent: `${memoryIncreasePercent.toFixed(1)}%`,
        });
      }
    }
  });

  test('should handle WebSocket reconnection performance', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    // Simulate connection loss
    const disconnectTime = performance.now();

    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.readyState = WebSocket.CLOSED;
      ws.onclose?.(new CloseEvent('close'));
    });

    // Wait for reconnection attempt
    await page.waitForSelector('[data-testid="reconnecting-indicator"]', { state: 'visible' });

    // Simulate reconnection
    await page.evaluate(() => {
      (window as any).reconnectionStart = performance.now();
      const ws = new (window as any).MockWebSocket('ws://localhost:3001');
      (window as any).websocket = ws;
      setTimeout(() => {
        ws.readyState = WebSocket.OPEN;
        (window as any).reconnectionTime = performance.now() - (window as any).reconnectionStart;
        ws.onopen?.(new Event('open'));
      }, 100);
    });

    // Wait for reconnection to complete
    await page.waitForSelector('[data-testid="connection-status"]:has-text("Connected")', { state: 'visible' });

    const reconnectionTime = await page.evaluate(() => (window as any).reconnectionTime);
    const totalReconnectTime = performance.now() - disconnectTime;

    expect(reconnectionTime).toBeLessThan(1000);
    expect(totalReconnectTime).toBeLessThan(2000);

    console.log('WebSocket Reconnection Performance:', {
      reconnectionTime: `${reconnectionTime.toFixed(2)}ms`,
      totalReconnectTime: `${totalReconnectTime.toFixed(2)}ms`,
    });
  });

  test('should maintain performance under network throttling', async ({ page }) => {
    // Simulate slow network
    await page.route('**/*', route => {
      setTimeout(() => {
        route.continue();
      }, 50); // Add 50ms delay to all requests
    });

    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const metrics = await measureMessagePerformance(page, 'Throttled network test message');

    // Under throttled conditions, local operations should still be fast
    expect(metrics.sendToRenderTime).toBeLessThan(PERFORMANCE_TARGETS.MESSAGE_RENDER_TIME * 2);

    console.log('Throttled Network Performance:', {
      sendToRenderTime: `${metrics.sendToRenderTime.toFixed(2)}ms`,
      totalTime: `${metrics.totalTime.toFixed(2)}ms`,
    });
  });
});