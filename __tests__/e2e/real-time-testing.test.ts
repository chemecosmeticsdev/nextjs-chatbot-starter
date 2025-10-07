import { test, expect, Page, Browser } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

const testUser2 = {
  email: 'user@example.com',
  password: 'testpassword123',
  name: 'Test User',
};

// Helper functions
async function login(page: Page, user = testUser) {
  await page.goto('/auth/login');
  await page.fill('[data-testid="email-input"]', user.email);
  await page.fill('[data-testid="password-input"]', user.password);
  await page.click('[data-testid="login-button"]');

  // Wait for redirect to dashboard
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
}

async function waitForWebSocketConnection(page: Page) {
  // Wait for WebSocket connection to be established
  await page.waitForFunction(() => {
    return (window as any).websocketReady === true;
  }, { timeout: 10000 });
}

async function mockWebSocketMessages(page: Page) {
  // Mock WebSocket for testing real-time updates
  await page.addInitScript(() => {
    class MockWebSocket {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = WebSocket.CONNECTING;

      constructor(public url: string) {
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          this.onopen?.(new Event('open'));
          (window as any).websocketReady = true;
        }, 100);
      }

      send(data: string) {
        // Echo messages back for testing
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage(new MessageEvent('message', { data }));
          }
        }, 50);
      }

      close() {
        this.readyState = WebSocket.CLOSED;
        this.onclose?.(new CloseEvent('close'));
      }

      // Simulate incoming real-time updates
      simulateUpdate(data: any) {
        if (this.onmessage) {
          this.onmessage(new MessageEvent('message', {
            data: JSON.stringify(data)
          }));
        }
      }
    }

    (window as any).MockWebSocket = MockWebSocket;
    (window as any).WebSocket = MockWebSocket;
  });
}

test.describe('Real-time Updates E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocketMessages(page);
    await login(page);
  });

  test('should display real-time metrics updates in dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    const liveMetricsCard = page.locator('[data-testid="live-metrics-card"]');
    await expect(liveMetricsCard).toBeVisible();

    // Get initial metrics values
    const initialSessions = await liveMetricsCard.locator('[data-testid="active-sessions"]').textContent();
    const initialMessages = await liveMetricsCard.locator('[data-testid="messages-last-hour"]').textContent();

    // Simulate real-time metric updates
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'metrics_update',
        data: {
          active_sessions: 45,
          messages_last_hour: 234,
          connection_status: 'healthy',
          timestamp: Date.now()
        }
      });
    });

    // Wait for UI to update
    await page.waitForTimeout(1000);

    // Verify metrics have updated
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText('45');
    await expect(liveMetricsCard.locator('[data-testid="messages-last-hour"]')).toContainText('234');
    await expect(liveMetricsCard.locator('[data-testid="connection-status"]')).toContainText('Connected');

    // Test multiple rapid updates
    for (let i = 0; i < 5; i++) {
      await page.evaluate((iteration) => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.simulateUpdate({
          type: 'metrics_update',
          data: {
            active_sessions: 50 + iteration,
            messages_last_hour: 240 + iteration * 10,
            connection_status: 'healthy'
          }
        });
      }, i);

      await page.waitForTimeout(200);
    }

    // Verify final values
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText('54');
    await expect(liveMetricsCard.locator('[data-testid="messages-last-hour"]')).toContainText('280');
  });

  test('should handle real-time chat messages across multiple users', async ({ browser }) => {
    // Create two browser contexts for two different users
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Setup WebSocket mocking for both pages
    await mockWebSocketMessages(page1);
    await mockWebSocketMessages(page2);

    // Login different users
    await login(page1, testUser);
    await login(page2, testUser2);

    // Navigate both to chat
    await page1.goto('/chat');
    await page2.goto('/chat');

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // User 1 sends a message
    const chatInput1 = page1.locator('[data-testid="chat-input"]');
    const sendButton1 = page1.locator('[data-testid="send-button"]');

    await chatInput1.fill('Hello from User 1!');
    await sendButton1.click();

    // Simulate message appearing in User 2's chat
    await page2.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'new_message',
        data: {
          id: 'msg_1',
          content: 'Hello from User 1!',
          sender: 'Test Admin',
          timestamp: Date.now(),
          conversation_id: 'conv_123'
        }
      });
    });

    // Verify message appears in User 2's chat
    await expect(page2.locator('[data-testid="message-content"]').last()).toContainText('Hello from User 1!');

    // User 2 responds
    const chatInput2 = page2.locator('[data-testid="chat-input"]');
    const sendButton2 = page2.locator('[data-testid="send-button"]');

    await chatInput2.fill('Hi there from User 2!');
    await sendButton2.click();

    // Simulate response in User 1's chat
    await page1.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'new_message',
        data: {
          id: 'msg_2',
          content: 'Hi there from User 2!',
          sender: 'Test User',
          timestamp: Date.now(),
          conversation_id: 'conv_123'
        }
      });
    });

    // Verify response appears in User 1's chat
    await expect(page1.locator('[data-testid="message-content"]').last()).toContainText('Hi there from User 2!');

    // Test typing indicators
    await page1.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'typing_indicator',
        data: {
          user: 'Test User',
          is_typing: true,
          conversation_id: 'conv_123'
        }
      });
    });

    await expect(page1.locator('[data-testid="typing-indicator"]')).toContainText('Test User is typing');

    // Stop typing
    await page1.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'typing_indicator',
        data: {
          user: 'Test User',
          is_typing: false,
          conversation_id: 'conv_123'
        }
      });
    });

    await expect(page1.locator('[data-testid="typing-indicator"]')).not.toBeVisible();

    await context1.close();
    await context2.close();
  });

  test('should show real-time activity feed updates', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    const activityFeed = page.locator('[data-testid="activity-feed-card"]');
    await expect(activityFeed).toBeVisible();

    const initialActivityCount = await activityFeed.locator('[data-testid="activity-item"]').count();

    // Simulate new activity
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'new_activity',
        data: {
          id: 'activity_1',
          type: 'conversation_started',
          message: 'New conversation started with ChatBot Alpha',
          timestamp: Date.now(),
          user: 'Test User',
          metadata: {
            chatbot_id: 'bot_123',
            conversation_id: 'conv_456'
          }
        }
      });
    });

    await page.waitForTimeout(1000);

    // Verify new activity appears
    const newActivityCount = await activityFeed.locator('[data-testid="activity-item"]').count();
    expect(newActivityCount).toBeGreaterThan(initialActivityCount);

    const latestActivity = activityFeed.locator('[data-testid="activity-item"]').first();
    await expect(latestActivity).toContainText('New conversation started with ChatBot Alpha');

    // Test multiple activity updates
    const activities = [
      { type: 'message_sent', message: 'Message sent to support bot' },
      { type: 'bot_created', message: 'New chatbot "Sales Assistant" created' },
      { type: 'user_joined', message: 'New user registered: jane@example.com' },
    ];

    for (const activity of activities) {
      await page.evaluate((activityData) => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.simulateUpdate({
          type: 'new_activity',
          data: {
            id: `activity_${Date.now()}`,
            type: activityData.type,
            message: activityData.message,
            timestamp: Date.now(),
            user: 'Test User'
          }
        });
      }, activity);

      await page.waitForTimeout(500);
    }

    // Verify all activities appear
    for (const activity of activities) {
      await expect(activityFeed.locator('[data-testid="activity-item"]')).toContainText(activity.message);
    }
  });

  test('should handle WebSocket connection loss and recovery', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toContainText('Connected');

    // Simulate connection loss
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.readyState = WebSocket.CLOSED;
      ws.onclose?.(new CloseEvent('close'));
    });

    // Verify disconnection is shown
    await expect(connectionStatus).toContainText('Disconnected', { timeout: 5000 });

    // Verify reconnection indicator
    const reconnectingIndicator = page.locator('[data-testid="reconnecting-indicator"]');
    await expect(reconnectingIndicator).toBeVisible();

    // Simulate reconnection
    await page.evaluate(() => {
      const ws = new (window as any).MockWebSocket('ws://localhost:3001');
      (window as any).websocket = ws;
      setTimeout(() => {
        ws.readyState = WebSocket.OPEN;
        ws.onopen?.(new Event('open'));
      }, 1000);
    });

    // Verify reconnection
    await expect(connectionStatus).toContainText('Connected', { timeout: 10000 });
    await expect(reconnectingIndicator).not.toBeVisible();

    // Verify data loads after reconnection
    await page.evaluate(() => {
      const ws = (window as any).websocket;
      if (ws) {
        ws.simulateUpdate({
          type: 'metrics_update',
          data: {
            active_sessions: 25,
            messages_last_hour: 150,
            connection_status: 'healthy'
          }
        });
      }
    });

    const liveMetricsCard = page.locator('[data-testid="live-metrics-card"]');
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText('25');
  });

  test('should sync real-time data across multiple dashboard tabs', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await mockWebSocketMessages(page1);
    await mockWebSocketMessages(page2);

    await login(page1);
    await login(page2);

    // Both tabs navigate to dashboard
    await page1.goto('/dashboard');
    await page2.goto('/dashboard');

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Update metrics in one tab
    await page1.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'metrics_update',
        data: {
          active_sessions: 75,
          messages_last_hour: 456,
          connection_status: 'healthy'
        }
      });
    });

    // Simulate the same update in the second tab (as if from server)
    await page2.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'metrics_update',
        data: {
          active_sessions: 75,
          messages_last_hour: 456,
          connection_status: 'healthy'
        }
      });
    });

    // Verify both tabs show the same data
    const metrics1 = page1.locator('[data-testid="live-metrics-card"]');
    const metrics2 = page2.locator('[data-testid="live-metrics-card"]');

    await expect(metrics1.locator('[data-testid="active-sessions"]')).toContainText('75');
    await expect(metrics2.locator('[data-testid="active-sessions"]')).toContainText('75');

    await expect(metrics1.locator('[data-testid="messages-last-hour"]')).toContainText('456');
    await expect(metrics2.locator('[data-testid="messages-last-hour"]')).toContainText('456');

    await context.close();
  });

  test('should handle high-frequency real-time updates without performance issues', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    const startTime = Date.now();

    // Send 50 rapid updates
    for (let i = 0; i < 50; i++) {
      await page.evaluate((iteration) => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.simulateUpdate({
          type: 'metrics_update',
          data: {
            active_sessions: 100 + iteration,
            messages_last_hour: 500 + iteration * 2,
            connection_status: 'healthy',
            timestamp: Date.now()
          }
        });
      }, i);

      // Small delay to simulate rapid but not instant updates
      await page.waitForTimeout(10);
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // All updates should complete within a reasonable time (2 seconds)
    expect(totalTime).toBeLessThan(2000);

    // Verify final state is correct
    const liveMetricsCard = page.locator('[data-testid="live-metrics-card"]');
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText('149');
    await expect(liveMetricsCard.locator('[data-testid="messages-last-hour"]')).toContainText('598');

    // Check that the page is still responsive
    await page.click('[data-testid="refresh-dashboard-button"]');
    await expect(page.locator('[data-testid="dashboard-refreshing"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-refreshing"]')).not.toBeVisible();
  });

  test('should show real-time chatbot status updates', async ({ page }) => {
    await page.goto('/dashboard/chatbots');
    await waitForWebSocketConnection(page);

    const chatbotsList = page.locator('[data-testid="chatbots-list"]');
    await expect(chatbotsList).toBeVisible();

    // Simulate chatbot status change
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'chatbot_status_update',
        data: {
          chatbot_id: 'bot_123',
          status: 'active',
          last_activity: Date.now(),
          active_conversations: 5,
          response_time: '1.2s'
        }
      });
    });

    // Verify status update appears
    const chatbotItem = page.locator('[data-testid="chatbot-item-bot_123"]');
    if (await chatbotItem.isVisible()) {
      await expect(chatbotItem.locator('[data-testid="status-indicator"]')).toContainText('Active');
      await expect(chatbotItem.locator('[data-testid="active-conversations"]')).toContainText('5');
    }

    // Test multiple chatbot updates
    const bots = ['bot_123', 'bot_456', 'bot_789'];
    for (let i = 0; i < bots.length; i++) {
      await page.evaluate((botData) => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.simulateUpdate({
          type: 'chatbot_status_update',
          data: {
            chatbot_id: botData.id,
            status: botData.status,
            active_conversations: botData.conversations,
            response_time: botData.responseTime
          }
        });
      }, {
        id: bots[i],
        status: i % 2 === 0 ? 'active' : 'idle',
        conversations: i + 1,
        responseTime: `${(i + 1) * 0.5}s`
      });

      await page.waitForTimeout(200);
    }
  });

  test('should handle real-time notification updates', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    const notificationBell = page.locator('[data-testid="notification-bell"]');
    await expect(notificationBell).toBeVisible();

    // Simulate new notification
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'new_notification',
        data: {
          id: 'notif_1',
          title: 'System Alert',
          message: 'High CPU usage detected on server',
          type: 'warning',
          timestamp: Date.now(),
          read: false
        }
      });
    });

    // Verify notification indicator updates
    const notificationBadge = page.locator('[data-testid="notification-badge"]');
    await expect(notificationBadge).toBeVisible();
    await expect(notificationBadge).toContainText('1');

    // Click to open notifications
    await notificationBell.click();
    const notificationPanel = page.locator('[data-testid="notification-panel"]');
    await expect(notificationPanel).toBeVisible();

    // Verify notification appears in panel
    await expect(notificationPanel.locator('[data-testid="notification-item"]')).toContainText('System Alert');

    // Simulate multiple notifications
    for (let i = 2; i <= 5; i++) {
      await page.evaluate((notifId) => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.simulateUpdate({
          type: 'new_notification',
          data: {
            id: `notif_${notifId}`,
            title: `Alert ${notifId}`,
            message: `Test notification ${notifId}`,
            type: 'info',
            timestamp: Date.now(),
            read: false
          }
        });
      }, i);

      await page.waitForTimeout(300);
    }

    // Verify badge count updates
    await expect(notificationBadge).toContainText('5');

    // Verify all notifications appear
    const notificationItems = notificationPanel.locator('[data-testid="notification-item"]');
    await expect(notificationItems).toHaveCount(5);
  });

  test('should maintain real-time functionality during page navigation', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    // Start on dashboard, verify connection
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toContainText('Connected');

    // Navigate to chat
    await page.goto('/chat');
    await waitForWebSocketConnection(page);

    // Send a test message
    const chatInput = page.locator('[data-testid="chat-input"]');
    if (await chatInput.isVisible()) {
      await chatInput.fill('Test message during navigation');
      await page.click('[data-testid="send-button"]');

      // Simulate message response
      await page.evaluate(() => {
        const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
        ws.simulateUpdate({
          type: 'new_message',
          data: {
            id: 'msg_nav_test',
            content: 'Response to navigation test',
            sender: 'Bot',
            timestamp: Date.now(),
            conversation_id: 'conv_nav'
          }
        });
      });

      await expect(page.locator('[data-testid="message-content"]').last()).toContainText('Response to navigation test');
    }

    // Navigate back to dashboard
    await page.goto('/dashboard');
    await waitForWebSocketConnection(page);

    // Verify real-time updates still work
    await page.evaluate(() => {
      const ws = (window as any).websocket || new (window as any).MockWebSocket('ws://localhost:3001');
      ws.simulateUpdate({
        type: 'metrics_update',
        data: {
          active_sessions: 42,
          messages_last_hour: 200,
          connection_status: 'healthy'
        }
      });
    });

    const liveMetricsCard = page.locator('[data-testid="live-metrics-card"]');
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText('42');
  });
});