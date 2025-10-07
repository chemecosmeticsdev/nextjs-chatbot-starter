import { test, expect, Page } from '@playwright/test';

// Helper function to login
async function loginUser(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'testpassword');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

// Helper function to navigate to a chatbot's integrations page
async function navigateToChatbotIntegrations(page: Page, chatbotId: string) {
  await page.goto(`/dashboard/chatbots/${chatbotId}/integrations`);
  await page.waitForLoadState('networkidle');
}

test.describe('Integration Setup Flow', () => {
  const testChatbotId = 'test-chatbot-123';

  test.beforeEach(async ({ page }) => {
    // Mock chatbot data
    await page.route(`**/api/v1/chatbots/${testChatbotId}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: testChatbotId,
            name: 'Test Integration Bot',
            description: 'Chatbot for testing integrations',
            status: 'active',
            configuration: {
              model: 'nova-micro',
              temperature: 0.7,
              maxTokens: 1000,
              language: 'en',
              responseTimeout: 30000
            }
          }
        })
      });
    });

    // Mock integrations API
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            integrations: {
              line: { enabled: false, configured: false },
              widget: { enabled: false, configured: false },
              webhook: { enabled: false, configured: false }
            },
            stats: {
              totalIntegrations: 0,
              activeIntegrations: 0,
              totalRequests: 0,
              successRate: 0
            }
          }
        })
      });
    });

    await loginUser(page);
  });

  test('complete Line OA integration setup workflow', async ({ page }) => {
    await navigateToChatbotIntegrations(page, testChatbotId);

    // Verify integrations page loads
    await expect(page.getByText('Integrations')).toBeVisible();
    await expect(page.getByText('Connect your chatbot to external platforms')).toBeVisible();

    // Check integration overview
    await expect(page.getByText('Line OA')).toBeVisible();
    await expect(page.getByText('Connect to Line Official Account')).toBeVisible();

    // Click setup Line OA integration
    await page.click('text=Setup Line OA');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations/line`);

    // Verify Line OA setup page
    await expect(page.getByText('Line OA Integration')).toBeVisible();
    await expect(page.getByText('Connect your chatbot to Line Official Account')).toBeVisible();

    // Check setup wizard steps
    await expect(page.getByText('Step 1')).toBeVisible();
    await expect(page.getByText('Channel Configuration')).toBeVisible();

    // Fill in Line channel information
    await page.fill('[data-testid="line-channel-id"]', '1234567890');
    await page.fill('[data-testid="line-channel-secret"]', 'test-channel-secret-123');
    await page.fill('[data-testid="line-access-token"]', 'test-access-token-456');

    // Move to step 2
    await page.click('[data-testid="next-step-button"]');

    await expect(page.getByText('Step 2')).toBeVisible();
    await expect(page.getByText('Webhook Configuration')).toBeVisible();

    // Verify webhook URL is generated and displayed
    const webhookUrl = `https://your-domain.com/api/v1/webhooks/line/${testChatbotId}`;
    await expect(page.getByText(webhookUrl)).toBeVisible();

    // Test copy webhook URL functionality
    await page.click('[data-testid="copy-webhook-url"]');
    await expect(page.getByText('Webhook URL copied to clipboard')).toBeVisible();

    // Move to step 3
    await page.click('[data-testid="next-step-button"]');

    await expect(page.getByText('Step 3')).toBeVisible();
    await expect(page.getByText('QR Code & Testing')).toBeVisible();

    // Verify QR code is displayed
    await expect(page.locator('[data-testid="line-qr-code"]')).toBeVisible();

    // Test webhook verification
    await page.click('[data-testid="test-webhook-button"]');
    await expect(page.getByText('Testing webhook connection...')).toBeVisible();

    // Mock successful webhook test
    await page.route('**/api/v1/integrations/line/test-webhook', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Webhook connection successful'
        })
      });
    });

    await expect(page.getByText('Webhook connection successful')).toBeVisible();

    // Move to step 4
    await page.click('[data-testid="next-step-button"]');

    await expect(page.getByText('Step 4')).toBeVisible();
    await expect(page.getByText('Finalize Setup')).toBeVisible();

    // Configure event subscriptions
    const messageEventsCheckbox = page.locator('[data-testid="event-message"]');
    const followEventsCheckbox = page.locator('[data-testid="event-follow"]');

    await messageEventsCheckbox.check();
    await followEventsCheckbox.check();

    // Complete setup
    await page.click('[data-testid="complete-setup-button"]');

    // Mock successful setup completion
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/line`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Line OA integration setup completed successfully'
        })
      });
    });

    await expect(page.getByText('Line OA integration setup completed successfully')).toBeVisible();

    // Should navigate back to integrations overview
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations`);

    // Verify integration is now shown as configured
    await expect(page.getByText('Configured')).toBeVisible();
    await expect(page.locator('.bg-green-100')).toBeVisible(); // Success status indicator
  });

  test('widget builder integration setup', async ({ page }) => {
    await navigateToChatbotIntegrations(page, testChatbotId);

    // Navigate to widget builder
    await page.click('text=Setup Widget');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations/widget`);

    // Verify widget builder page
    await expect(page.getByText('Widget Builder')).toBeVisible();
    await expect(page.getByText('Create embeddable chat widget')).toBeVisible();

    // Check widget builder tabs
    await expect(page.getByText('Design')).toBeVisible();
    await expect(page.getByText('Behavior')).toBeVisible();
    await expect(page.getByText('Security')).toBeVisible();
    await expect(page.getByText('Code')).toBeVisible();

    // Test Design tab
    await page.click('text=Design');

    // Customize widget appearance
    await page.click('[data-testid="theme-light"]');
    await page.fill('[data-testid="primary-color"]', '#3b82f6');

    // Configure widget position
    await page.click('[data-testid="position-bottom-right"]');

    // Test Behavior tab
    await page.click('text=Behavior');

    // Configure chat behavior
    const greetingInput = page.locator('[data-testid="greeting-message"]');
    await greetingInput.fill('Hello! How can I help you today?');

    const showTypingToggle = page.locator('[data-testid="show-typing-indicator"]');
    await showTypingToggle.check();

    const allowFileUploadToggle = page.locator('[data-testid="allow-file-upload"]');
    await allowFileUploadToggle.check();

    // Test Security tab
    await page.click('text=Security');

    // Configure security settings
    const allowedDomainsInput = page.locator('[data-testid="allowed-domains"]');
    await allowedDomainsInput.fill('example.com, test.com');

    const rateLimitInput = page.locator('[data-testid="rate-limit"]');
    await rateLimitInput.fill('20');

    // Test Code tab
    await page.click('text=Code');

    // Verify widget code is generated
    await expect(page.getByText('Widget Integration Code')).toBeVisible();
    await expect(page.locator('[data-testid="widget-code"]')).toBeVisible();

    // Test copy code functionality
    await page.click('[data-testid="copy-widget-code"]');
    await expect(page.getByText('Widget code copied to clipboard')).toBeVisible();

    // Test live preview
    await expect(page.getByText('Live Preview')).toBeVisible();
    await expect(page.locator('[data-testid="widget-preview"]')).toBeVisible();

    // Test mobile preview
    await page.click('[data-testid="mobile-preview-toggle"]');
    await expect(page.locator('[data-testid="mobile-preview"]')).toBeVisible();

    // Save widget configuration
    await page.click('[data-testid="save-widget-button"]');

    // Mock successful save
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Widget configuration saved successfully',
          data: {
            widgetId: 'widget-123',
            embedCode: '<script src="https://cdn.example.com/widget.js"></script>'
          }
        })
      });
    });

    await expect(page.getByText('Widget configuration saved successfully')).toBeVisible();

    // Test widget deployment
    await page.click('[data-testid="deploy-widget-button"]');
    await expect(page.getByText('Widget deployed successfully')).toBeVisible();
  });

  test('webhook integration setup', async ({ page }) => {
    await navigateToChatbotIntegrations(page, testChatbotId);

    // Navigate to webhook setup (assuming it's in the integrations overview)
    await page.click('text=Setup Webhook');

    // Verify webhook setup interface
    await expect(page.getByText('Webhook Configuration')).toBeVisible();
    await expect(page.getByText('Configure webhook endpoints for external integrations')).toBeVisible();

    // Add webhook endpoint
    await page.fill('[data-testid="webhook-url"]', 'https://external-system.com/webhook');
    await page.fill('[data-testid="webhook-secret"]', 'webhook-secret-123');

    // Select events to subscribe to
    const messageEventCheckbox = page.locator('[data-testid="webhook-event-message"]');
    const sessionEventCheckbox = page.locator('[data-testid="webhook-event-session"]');

    await messageEventCheckbox.check();
    await sessionEventCheckbox.check();

    // Configure retry policy
    await page.fill('[data-testid="retry-attempts"]', '3');
    await page.fill('[data-testid="retry-delay"]', '5');

    // Test webhook endpoint
    await page.click('[data-testid="test-webhook-button"]');

    // Mock webhook test
    await page.route('**/api/v1/integrations/webhook/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Webhook endpoint is reachable',
          responseTime: 250
        })
      });
    });

    await expect(page.getByText('Webhook endpoint is reachable')).toBeVisible();
    await expect(page.getByText('Response time: 250ms')).toBeVisible();

    // Save webhook configuration
    await page.click('[data-testid="save-webhook-button"]');

    await expect(page.getByText('Webhook configuration saved successfully')).toBeVisible();
  });

  test('integration status monitoring and management', async ({ page }) => {
    // Mock integrations with some configured
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            integrations: {
              line: {
                enabled: true,
                configured: true,
                status: 'active',
                lastActivity: new Date().toISOString(),
                totalRequests: 450,
                successRate: 98.5
              },
              widget: {
                enabled: true,
                configured: true,
                status: 'active',
                lastActivity: new Date().toISOString(),
                totalRequests: 1250,
                successRate: 99.2
              },
              webhook: {
                enabled: false,
                configured: false,
                status: 'inactive'
              }
            },
            stats: {
              totalIntegrations: 3,
              activeIntegrations: 2,
              totalRequests: 1700,
              successRate: 98.9
            }
          }
        })
      });
    });

    await navigateToChatbotIntegrations(page, testChatbotId);

    // Verify integration statistics
    await expect(page.getByText('Total Integrations')).toBeVisible();
    await expect(page.getByText('3')).toBeVisible();

    await expect(page.getByText('Active Integrations')).toBeVisible();
    await expect(page.getByText('2')).toBeVisible();

    await expect(page.getByText('Success Rate')).toBeVisible();
    await expect(page.getByText('98.9%')).toBeVisible();

    // Verify individual integration status
    await expect(page.locator('[data-testid="line-integration-card"]')).toContainText('Active');
    await expect(page.locator('[data-testid="line-integration-card"]')).toContainText('450 requests');
    await expect(page.locator('[data-testid="line-integration-card"]')).toContainText('98.5%');

    await expect(page.locator('[data-testid="widget-integration-card"]')).toContainText('Active');
    await expect(page.locator('[data-testid="widget-integration-card"]')).toContainText('1,250 requests');
    await expect(page.locator('[data-testid="widget-integration-card"]')).toContainText('99.2%');

    await expect(page.locator('[data-testid="webhook-integration-card"]')).toContainText('Inactive');

    // Test integration toggle
    const lineToggle = page.locator('[data-testid="line-integration-toggle"]');
    await lineToggle.click();

    // Should show confirmation dialog
    await expect(page.getByText('Disable Line OA Integration?')).toBeVisible();
    await page.click('[data-testid="confirm-disable"]');

    // Mock disable response
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/line/disable`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Line OA integration disabled successfully'
        })
      });
    });

    await expect(page.getByText('Line OA integration disabled successfully')).toBeVisible();
  });
});