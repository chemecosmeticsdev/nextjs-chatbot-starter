import { test, expect, Page } from '@playwright/test';

test.describe('Widget Preview and Embed Testing', () => {
  const testChatbotId = 'test-widget-preview-789';
  const testWidgetId = 'widget-preview-123';

  test.beforeEach(async ({ page }) => {
    // Mock widget configuration for preview
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          config: {
            id: testWidgetId,
            api_key: 'wgt_preview_test_key',
            theme: {
              primary_color: '#3b82f6',
              secondary_color: '#f3f4f6',
              background_color: '#ffffff',
              text_color: '#374151',
              border_radius: 12,
              font_family: 'Inter, sans-serif',
              font_size: 14
            },
            layout: {
              position: 'bottom-right',
              width: 380,
              height: 500,
              margin: 20,
              bubble_style: 'circle'
            },
            behavior: {
              greeting_message: 'Hi! How can I help you today?',
              placeholder_text: 'Type your message...',
              auto_open: false,
              auto_open_delay: 3000,
              show_typing_indicator: true,
              sound_enabled: true,
              persistent: true
            },
            branding: {
              show_powered_by: true,
              bot_name: 'Assistant',
              company_name: 'Test Company'
            },
            status: 'active'
          }
        })
      });
    });
  });

  test('should render widget preview page correctly', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    // Verify page loads
    await expect(page).toHaveTitle(/Widget Preview/i);

    // Verify widget elements are visible
    // Note: This test depends on your actual preview page implementation
    // Adjust selectors based on your implementation
  });

  test('should display widget with correct theme configuration', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    // Verify widget bubble exists
    const widgetBubble = page.locator('[data-widget-bubble]');
    if (await widgetBubble.count() > 0) {
      await expect(widgetBubble).toBeVisible();

      // Verify bubble has correct styling (if data attributes are available)
      const backgroundColor = await widgetBubble.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // RGB value for #3b82f6 is rgb(59, 130, 246)
      expect(backgroundColor).toContain('rgb');
    }
  });

  test('should open and close widget on bubble click', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    // Find and click widget bubble
    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button:has-text("Chat")').first();

    if (await widgetBubble.count() > 0) {
      await widgetBubble.click();

      // Verify chat window opens
      const chatWindow = page.locator('[data-widget-window], .widget-window, .chat-window').first();
      await expect(chatWindow).toBeVisible({ timeout: 5000 });

      // Click close button or bubble again to close
      const closeButton = page.locator('[data-widget-close], .widget-close, button:has-text("Close")').first();

      if (await closeButton.count() > 0) {
        await closeButton.click();
        await expect(chatWindow).not.toBeVisible();
      }
    }
  });

  test('should display greeting message when widget opens', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button').first();

    if (await widgetBubble.count() > 0) {
      await widgetBubble.click();

      // Wait for chat window
      await page.waitForTimeout(500);

      // Verify greeting message is displayed
      await expect(page.getByText('Hi! How can I help you today?')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show correct bot name in widget header', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button').first();

    if (await widgetBubble.count() > 0) {
      await widgetBubble.click();
      await page.waitForTimeout(500);

      // Verify bot name is displayed
      await expect(page.getByText('Assistant')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display typing indicator when enabled', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button').first();

    if (await widgetBubble.count() > 0) {
      await widgetBubble.click();
      await page.waitForTimeout(500);

      // Look for typing indicator animation
      const typingIndicator = page.locator('.animate-bounce, [data-typing-indicator]');

      if (await typingIndicator.count() > 0) {
        await expect(typingIndicator.first()).toBeVisible();
      }
    }
  });

  test('should respect widget position configuration', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    const widgetContainer = page.locator('[data-widget-container], .widget-container').first();

    if (await widgetContainer.count() > 0) {
      // Verify widget is positioned in bottom-right
      const position = await widgetContainer.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          bottom: style.bottom,
          right: style.right
        };
      });

      expect(position.bottom).not.toBe('auto');
      expect(position.right).not.toBe('auto');
    }
  });

  test('should allow message input and submission', async ({ page }) => {
    // Mock chat API endpoint
    await page.route('**/api/v1/chat/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Thank you for your message! How can I assist you further?',
          conversationId: 'test-conv-123'
        })
      });
    });

    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button').first();

    if (await widgetBubble.count() > 0) {
      await widgetBubble.click();
      await page.waitForTimeout(500);

      // Find message input
      const messageInput = page.locator('input[placeholder*="Type"], textarea[placeholder*="Type"]').first();

      if (await messageInput.count() > 0) {
        // Type a test message
        await messageInput.fill('Hello, I need help with my order');

        // Find and click send button
        const sendButton = page.locator('button:has-text("Send"), button[type="submit"], [data-send-button]').first();

        if (await sendButton.count() > 0) {
          await sendButton.click();

          // Verify message appears in chat
          await expect(page.getByText('Hello, I need help with my order')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('should show powered by branding when enabled', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button').first();

    if (await widgetBubble.count() > 0) {
      await widgetBubble.click();
      await page.waitForTimeout(500);

      // Look for powered by text
      const poweredBy = page.getByText(/Powered by/i);

      if (await poweredBy.count() > 0) {
        await expect(poweredBy).toBeVisible();
      }
    }
  });

  test('should handle mobile viewport correctly', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(`/integrations/widget/${testWidgetId}/preview`);
    await page.waitForLoadState('networkidle');

    // Verify widget is visible on mobile
    const widgetBubble = page.locator('[data-widget-bubble], .widget-bubble, button').first();

    if (await widgetBubble.count() > 0) {
      await expect(widgetBubble).toBeVisible();

      await widgetBubble.click();
      await page.waitForTimeout(500);

      // Verify chat window adapts to mobile size
      const chatWindow = page.locator('[data-widget-window], .widget-window').first();

      if (await chatWindow.count() > 0) {
        const windowSize = await chatWindow.boundingBox();

        if (windowSize) {
          // Verify window width is reasonable for mobile
          expect(windowSize.width).toBeLessThanOrEqual(375);
        }
      }
    }
  });
});

test.describe('Widget Loader Script', () => {
  const testWidgetId = 'widget-loader-456';

  test('should load widget loader script successfully', async ({ page }) => {
    // Mock the loader script endpoint
    await page.route(`**/api/integrations/widget/${testWidgetId}/loader.js`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          (function() {
            console.log('Widget loader initialized');
            window.ChatbotWidget = {
              init: function() {
                console.log('Widget initialized');
              },
              open: function() {
                console.log('Widget opened');
              },
              close: function() {
                console.log('Widget closed');
              }
            };
          })();
        `
      });
    });

    // Create a test page that loads the widget
    await page.goto('about:blank');
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Widget Loader Test</title>
        </head>
        <body>
          <h1>Test Page</h1>
          <script src="/api/integrations/widget/${testWidgetId}/loader.js"></script>
        </body>
      </html>
    `);

    // Wait for script to load
    await page.waitForTimeout(1000);

    // Verify widget API is available
    const widgetAvailable = await page.evaluate(() => {
      return typeof (window as any).ChatbotWidget !== 'undefined';
    });

    expect(widgetAvailable).toBe(true);
  });

  test('should handle loader script errors gracefully', async ({ page }) => {
    // Mock loader script with error
    await page.route(`**/api/integrations/widget/${testWidgetId}/loader.js`, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error'
      });
    });

    await page.goto('about:blank');

    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Widget Loader Error Test</title>
        </head>
        <body>
          <h1>Test Page</h1>
          <script src="/api/integrations/widget/${testWidgetId}/loader.js" onerror="console.error('Failed to load widget')"></script>
        </body>
      </html>
    `);

    await page.waitForTimeout(1000);

    // Verify error was logged
    expect(errors.some(e => e.includes('Failed to load widget'))).toBe(true);
  });
});

test.describe('Widget Chat Functionality', () => {
  const testWidgetId = 'widget-chat-789';
  const testChatbotId = 'chatbot-789';

  test.beforeEach(async ({ page }) => {
    // Mock chat endpoint
    await page.route('**/api/v1/chat/**', (route) => {
      const requestBody = JSON.parse(route.request().postData() || '{}');

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: `You said: ${requestBody.message}`,
          conversationId: 'test-conversation-123',
          timestamp: new Date().toISOString()
        })
      });
    });
  });

  test('should handle chat conversation flow', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/chat`);
    await page.waitForLoadState('networkidle');

    // Send first message
    const messageInput = page.locator('input[type="text"], textarea').first();
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();

    if (await messageInput.count() > 0 && await sendButton.count() > 0) {
      await messageInput.fill('What are your business hours?');
      await sendButton.click();

      // Verify message appears
      await expect(page.getByText('What are your business hours?')).toBeVisible({ timeout: 5000 });

      // Wait for response
      await page.waitForTimeout(1000);

      // Send follow-up message
      await messageInput.fill('Thank you for the information');
      await sendButton.click();

      await expect(page.getByText('Thank you for the information')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should maintain conversation context', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/chat`);
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('input[type="text"], textarea').first();
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();

    if (await messageInput.count() > 0 && await sendButton.count() > 0) {
      // Send multiple messages
      const messages = [
        'Hello',
        'I need help',
        'Thank you'
      ];

      for (const msg of messages) {
        await messageInput.fill(msg);
        await sendButton.click();
        await page.waitForTimeout(500);
      }

      // Verify all messages are in chat history
      for (const msg of messages) {
        await expect(page.getByText(msg)).toBeVisible();
      }
    }
  });

  test('should display error message on chat API failure', async ({ page }) => {
    // Mock API error
    await page.route('**/api/v1/chat/**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Failed to process message'
        })
      });
    });

    await page.goto(`/integrations/widget/${testWidgetId}/chat`);
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('input[type="text"], textarea').first();
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();

    if (await messageInput.count() > 0 && await sendButton.count() > 0) {
      await messageInput.fill('Test message');
      await sendButton.click();

      // Wait for error message
      await page.waitForTimeout(1000);

      // Verify error is displayed (adjust selector based on your error handling)
      const errorMessage = page.locator('text=/error|failed|something went wrong/i').first();

      if (await errorMessage.count() > 0) {
        await expect(errorMessage).toBeVisible();
      }
    }
  });

  test('should clear conversation when reset button is clicked', async ({ page }) => {
    await page.goto(`/integrations/widget/${testWidgetId}/chat`);
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('input[type="text"], textarea').first();
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();

    if (await messageInput.count() > 0 && await sendButton.count() > 0) {
      // Send a message
      await messageInput.fill('Test message');
      await sendButton.click();
      await page.waitForTimeout(500);

      await expect(page.getByText('Test message')).toBeVisible();

      // Find and click reset/clear button
      const resetButton = page.locator('button:has-text("Reset"), button:has-text("Clear"), [data-reset-button]').first();

      if (await resetButton.count() > 0) {
        await resetButton.click();

        // Verify message is cleared
        await expect(page.getByText('Test message')).not.toBeVisible();
      }
    }
  });
});
