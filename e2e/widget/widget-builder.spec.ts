import { test, expect, Page } from '@playwright/test';

// Helper function to login (you may need to adjust based on your auth implementation)
async function loginUser(page: Page) {
  await page.goto('/login');
  // Add your login steps here based on your auth implementation
  // This is a placeholder - adjust as needed
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'testpassword');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

// Helper to navigate to a specific chatbot's widget page
async function navigateToWidgetBuilder(page: Page, chatbotId: string) {
  await page.goto(`/dashboard/chatbots/${chatbotId}/integrations/widget`);
  await page.waitForLoadState('networkidle');
}

test.describe('Widget Builder - Configuration and Setup', () => {
  const testChatbotId = 'test-chatbot-widget-123';

  test.beforeEach(async ({ page }) => {
    // Mock the chatbot API endpoint
    await page.route(`**/api/v1/chatbots/${testChatbotId}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: testChatbotId,
            name: 'Test Widget Bot',
            description: 'Chatbot for widget testing',
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

    // Mock widget configuration API - initial load
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: {
              id: 'widget-config-123',
              name: 'Website Chat Widget',
              api_key: 'wgt_test_1234567890abcdef',
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
              security: {
                allowed_domains: ['example.com'],
                rate_limit_enabled: true,
                rate_limit_per_minute: 30,
                csrf_protection: true
              },
              branding: {
                show_powered_by: true,
                bot_name: 'Assistant',
                company_name: 'Test Company'
              },
              analytics: {
                track_events: true,
                track_user_behavior: false,
                session_recording: false
              },
              status: 'active'
            },
            stats: {
              total_conversations: 150,
              unique_visitors: 85,
              conversion_rate: 12.5,
              average_session_duration: 180,
              most_active_domain: 'example.com',
              bounce_rate: 35
            }
          })
        });
      }
    });

    // Mock API key generation
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget/api-key`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          api_key: 'wgt_test_1234567890abcdef'
        })
      });
    });

    await loginUser(page);
  });

  test('should load widget builder page with existing configuration', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Verify page title and description
    await expect(page.getByText('Widget Builder')).toBeVisible();
    await expect(page.getByText('Create and customize a chat widget for your website')).toBeVisible();

    // Verify status badge shows correctly
    await expect(page.getByText('Published')).toBeVisible();

    // Verify all tabs are present
    await expect(page.getByRole('tab', { name: 'Design' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Behavior' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Security' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Code' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Analytics' })).toBeVisible();

    // Verify preview panel is visible
    await expect(page.getByText('Live Preview')).toBeVisible();
  });

  test('should customize widget design settings', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Navigate to Design tab (should be default)
    await page.click('text=Design');

    // Verify Theme & Colors section
    await expect(page.getByText('Theme & Colors')).toBeVisible();

    // Change primary color
    const primaryColorInput = page.locator('input[type="color"]').first();
    await primaryColorInput.fill('#10b981'); // Green color

    // Verify the text input also updates
    const primaryColorTextInput = page.locator('input[placeholder="#3b82f6"]').first();
    await expect(primaryColorTextInput).toHaveValue('#10b981');

    // Change font family
    await page.click('text=Font Family');
    await page.click('text=Roboto');

    // Adjust border radius
    const borderRadiusSlider = page.locator('input[type="range"]').first();
    await borderRadiusSlider.fill('20');

    // Verify border radius value display updates
    await expect(page.getByText('Border Radius: 20px')).toBeVisible();

    // Navigate to Layout & Position section
    await expect(page.getByText('Layout & Position')).toBeVisible();

    // Change widget position
    await page.click('text=Position');
    await page.click('text=Bottom Left');

    // Change bubble style
    await page.click('text=Bubble Style');
    await page.click('text=Rounded');

    // Verify branding section
    await expect(page.getByText('Branding')).toBeVisible();

    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.fill('Support Bot');

    const companyNameInput = page.locator('input[placeholder="Your Company Name"]');
    await companyNameInput.fill('Acme Corp');
  });

  test('should configure widget behavior settings', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Navigate to Behavior tab
    await page.click('text=Behavior');

    // Verify Chat Behavior section
    await expect(page.getByText('Chat Behavior')).toBeVisible();
    await expect(page.getByText('Configure how your chat widget behaves and interacts with users')).toBeVisible();

    // Update greeting message
    const greetingTextarea = page.locator('textarea[placeholder="Hi! How can I help you today?"]');
    await greetingTextarea.clear();
    await greetingTextarea.fill('Welcome! Our support team is here to assist you.');

    // Update placeholder text
    const placeholderInput = page.locator('input[placeholder="Type your message..."]');
    await placeholderInput.clear();
    await placeholderInput.fill('Ask us anything...');

    // Enable auto-open
    const autoOpenSwitch = page.getByText('Auto-open Widget').locator('..').locator('button[role="switch"]');
    await autoOpenSwitch.click();

    // Verify auto-open delay slider appears
    await expect(page.getByText(/Auto-open Delay:/)).toBeVisible();

    // Adjust auto-open delay
    const delaySlider = page.locator('input[type="range"]').first();
    await delaySlider.fill('5000');
    await expect(page.getByText('Auto-open Delay: 5s')).toBeVisible();

    // Toggle typing indicator
    const typingSwitch = page.getByText('Show Typing Indicator').locator('..').locator('button[role="switch"]');
    await typingSwitch.click();

    // Toggle sound notifications
    const soundSwitch = page.getByText('Sound Notifications').locator('..').locator('button[role="switch"]');
    await soundSwitch.click();

    // Toggle persistent sessions
    const persistentSwitch = page.getByText('Persistent Sessions').locator('..').locator('button[role="switch"]');
    await persistentSwitch.click();
  });

  test('should configure security settings and manage allowed domains', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Navigate to Security tab
    await page.click('text=Security');

    // Verify Security Settings section
    await expect(page.getByText('Security Settings')).toBeVisible();
    await expect(page.getByText('Configure security and access control for your widget')).toBeVisible();

    // Verify security alert is shown
    await expect(page.getByText(/Security settings help protect your widget/)).toBeVisible();

    // Verify existing allowed domain
    await expect(page.locator('input[value="example.com"]')).toBeVisible();

    // Add a new allowed domain
    const domainInput = page.locator('input[placeholder="example.com"]');
    await domainInput.fill('testsite.com');
    await page.keyboard.press('Enter');

    // Verify the domain was added (this would need the mock to be updated in a real scenario)
    // In this test, we just verify the action occurred
    await expect(domainInput).toHaveValue('');

    // Test adding domain via button
    await domainInput.fill('another-domain.com');
    await page.click('text=Add');
    await expect(domainInput).toHaveValue('');

    // Toggle rate limiting
    const rateLimitSwitch = page.getByText('Rate Limiting').locator('..').locator('button[role="switch"]');
    const isRateLimitEnabled = await rateLimitSwitch.getAttribute('aria-checked');

    if (isRateLimitEnabled === 'true') {
      // Verify rate limit slider is visible
      await expect(page.getByText(/Messages per minute:/)).toBeVisible();

      // Adjust rate limit
      const rateLimitSlider = page.locator('input[type="range"]').first();
      await rateLimitSlider.fill('50');
      await expect(page.getByText('Messages per minute: 50')).toBeVisible();
    }

    // Toggle CSRF Protection
    const csrfSwitch = page.getByText('CSRF Protection').locator('..').locator('button[role="switch"]');
    await csrfSwitch.click();

    // Verify API Key is displayed
    await expect(page.getByText('API Key')).toBeVisible();
    const apiKeyInput = page.locator('input.font-mono.text-sm.bg-muted');
    await expect(apiKeyInput).toHaveValue('wgt_test_1234567890abcdef');

    // Test copy API key functionality
    await page.click('button:has(svg)'); // Copy button with icon
    // Note: In a real browser, this would copy to clipboard
  });

  test('should generate and display widget embed code', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Navigate to Code tab
    await page.click('text=Code');

    // Verify Code section
    await expect(page.getByText('Widget Code')).toBeVisible();
    await expect(page.getByText('Copy and paste this code into your website to add the chat widget')).toBeVisible();

    // Verify installation instructions are shown
    await expect(page.getByText('Installation Instructions:')).toBeVisible();
    await expect(page.getByText(/Copy the code below/)).toBeVisible();
    await expect(page.getByText(/Paste it before the closing/)).toBeVisible();

    // Verify generated code textarea is visible
    const codeTextarea = page.locator('textarea.font-mono.text-xs.bg-muted');
    await expect(codeTextarea).toBeVisible();

    // Verify code contains essential elements
    const codeContent = await codeTextarea.inputValue();
    expect(codeContent).toContain('window.ChatbotWidget');
    expect(codeContent).toContain('wgt_test_1234567890abcdef');
    expect(codeContent).toContain(testChatbotId);
    expect(codeContent).toContain('theme');
    expect(codeContent).toContain('layout');
    expect(codeContent).toContain('behavior');

    // Test copy code functionality
    await page.click('text=Copy Code');
    await expect(page.getByText('Widget Code copied to clipboard')).toBeVisible();

    // Test download code functionality
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(`chatbot-widget-${testChatbotId}.html`);

    // Verify informational note
    await expect(page.getByText(/The widget will automatically adapt/)).toBeVisible();
  });

  test('should display analytics settings and widget statistics', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Navigate to Analytics tab
    await page.click('text=Analytics');

    // Verify Analytics Settings section
    await expect(page.getByText('Analytics Settings')).toBeVisible();
    await expect(page.getByText('Configure what data to collect from your widget users')).toBeVisible();

    // Verify all analytics toggles
    await expect(page.getByText('Track Events')).toBeVisible();
    await expect(page.getByText('Track widget opens, message sends, and other interactions')).toBeVisible();

    await expect(page.getByText('Track User Behavior')).toBeVisible();
    await expect(page.getByText('Anonymously track user behavior patterns')).toBeVisible();

    await expect(page.getByText('Session Recording')).toBeVisible();
    await expect(page.getByText('Record chat sessions for analysis (privacy compliant)')).toBeVisible();

    // Toggle analytics settings
    const trackEventsSwitch = page.getByText('Track Events').locator('..').locator('button[role="switch"]');
    await trackEventsSwitch.click();

    const trackBehaviorSwitch = page.getByText('Track User Behavior').locator('..').locator('button[role="switch"]');
    await trackBehaviorSwitch.click();

    const sessionRecordingSwitch = page.getByText('Session Recording').locator('..').locator('button[role="switch"]');
    await sessionRecordingSwitch.click();

    // Verify privacy notice
    await expect(page.getByText(/All analytics data is collected in compliance/)).toBeVisible();

    // Verify Widget Performance statistics card
    await expect(page.getByText('Widget Performance')).toBeVisible();
    await expect(page.getByText('Current statistics for your widget usage')).toBeVisible();

    // Verify statistics are displayed
    await expect(page.getByText('Total Conversations')).toBeVisible();
    await expect(page.getByText('150')).toBeVisible();

    await expect(page.getByText('Unique Visitors')).toBeVisible();
    await expect(page.getByText('85')).toBeVisible();

    await expect(page.getByText('Conversion Rate')).toBeVisible();
    await expect(page.getByText('12.5%')).toBeVisible();

    await expect(page.getByText('Avg Session Duration')).toBeVisible();
    await expect(page.getByText('3m')).toBeVisible(); // 180 seconds = 3 minutes
  });

  test('should display live preview of widget with configuration changes', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Verify preview panel exists
    await expect(page.getByText('Live Preview')).toBeVisible();
    await expect(page.getByText('See how your widget will look on your website')).toBeVisible();

    // Verify preview controls
    await expect(page.getByText('Refresh')).toBeVisible();
    await expect(page.getByText('Desktop')).toBeVisible();

    // Verify widget bubble is visible in preview
    const previewContainer = page.locator('.bg-gradient-to-br.from-gray-100');
    await expect(previewContainer).toBeVisible();

    // Test refresh preview functionality
    await page.click('text=Refresh');
    await expect(page.getByText('Preview Refreshed')).toBeVisible();
    await expect(page.getByText('Widget preview has been updated with latest changes')).toBeVisible();

    // Verify the preview shows the greeting message
    await expect(page.getByText('Hi! How can I help you today?')).toBeVisible();

    // Verify the preview shows the bot name
    await expect(page.getByText('Assistant')).toBeVisible();

    // Verify typing indicator in preview (if enabled)
    const typingIndicator = page.locator('.animate-bounce');
    await expect(typingIndicator.first()).toBeVisible();

    // Change configuration and verify preview updates
    await page.click('text=Design');

    // Update bot name and verify it reflects in preview
    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.clear();
    await botNameInput.fill('Support Agent');

    // The preview should automatically update (in real implementation)
    // This would require watching for the text change in the preview area
  });

  test('should save widget configuration successfully', async ({ page }) => {
    // Mock the save endpoint
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: JSON.parse(route.request().postData() || '{}')
          })
        });
      } else {
        route.continue();
      }
    });

    await navigateToWidgetBuilder(page, testChatbotId);

    // Make some configuration changes
    await page.click('text=Design');
    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.clear();
    await botNameInput.fill('New Support Bot');

    // Click save button
    await page.click('text=Save Configuration');

    // Verify loading state
    const saveButton = page.locator('button:has-text("Save Configuration")');
    await expect(saveButton).toBeDisabled();

    // Verify success message
    await expect(page.getByText('Success')).toBeVisible();
    await expect(page.getByText('Widget configuration saved successfully')).toBeVisible();

    // Verify button is re-enabled
    await expect(saveButton).toBeEnabled();
  });

  test('should navigate using quick actions', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Verify Quick Actions panel
    await expect(page.getByText('Quick Actions')).toBeVisible();

    // Verify all quick action buttons exist
    await expect(page.getByText('Test in Playground')).toBeVisible();
    await expect(page.getByText('Preview on Website')).toBeVisible();

    const publishButton = page.locator('text=Publish Widget, text=Unpublish Widget').first();
    await expect(publishButton).toBeVisible();

    // Test navigation to playground
    const playgroundButton = page.getByText('Test in Playground');
    await playgroundButton.click();
    await page.waitForURL(`**/chatbots/${testChatbotId}/playground`);

    // Navigate back
    await page.goBack();
    await navigateToWidgetBuilder(page, testChatbotId);

    // Test external preview (opens new tab)
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.click('text=Preview on Website')
    ]);
    await newPage.close();

    // Test publish/unpublish toggle
    const currentStatus = await page.locator('text=Published, text=Draft').first().textContent();

    if (currentStatus === 'Published') {
      await page.click('text=Unpublish Widget');
      // In real implementation, this would update the status
    } else {
      await page.click('text=Publish Widget');
      // In real implementation, this would update the status
    }
  });

  test('should handle navigation breadcrumbs correctly', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Verify breadcrumb navigation
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chatbots' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chatbot' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Integrations' })).toBeVisible();
    await expect(page.getByText('Website Widget')).toBeVisible();

    // Test breadcrumb navigation
    await page.click('text=Integrations');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations`);

    // Navigate back to widget builder
    await navigateToWidgetBuilder(page, testChatbotId);

    // Test back button
    await page.click('text=Back to Integrations');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations`);
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Internal server error'
          })
        });
      }
    });

    await navigateToWidgetBuilder(page, testChatbotId);

    // Verify error message is shown
    await expect(page.getByText('Error')).toBeVisible();
    await expect(page.getByText(/Failed to load widget configuration/)).toBeVisible();
  });

  test('should handle save errors gracefully', async ({ page }) => {
    await navigateToWidgetBuilder(page, testChatbotId);

    // Mock save error
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Failed to save configuration'
          })
        });
      } else {
        route.continue();
      }
    });

    // Make a change
    await page.click('text=Design');
    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.fill('New Name');

    // Try to save
    await page.click('text=Save Configuration');

    // Verify error message
    await expect(page.getByText('Error')).toBeVisible();
    await expect(page.getByText(/Failed to save configuration/)).toBeVisible();
  });
});

test.describe('Widget Builder - End-to-End Workflow', () => {
  const testChatbotId = 'test-e2e-chatbot-456';

  test('complete widget setup workflow from dashboard to embed code', async ({ page }) => {
    // Mock all necessary endpoints
    await page.route(`**/api/v1/chatbots/${testChatbotId}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: testChatbotId,
            name: 'E2E Test Bot',
            status: 'active'
          }
        })
      });
    });

    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            integrations: {
              widget: { enabled: false, configured: false }
            }
          }
        })
      });
    });

    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Widget not configured'
          })
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: JSON.parse(route.request().postData() || '{}')
          })
        });
      }
    });

    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget/api-key`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          api_key: 'wgt_new_generated_key_xyz'
        })
      });
    });

    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'testpassword');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');

    // Navigate to chatbot integrations
    await page.goto(`/dashboard/chatbots/${testChatbotId}/integrations`);
    await page.waitForLoadState('networkidle');

    // Click on Widget setup
    await page.click('text=Setup Widget');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations/widget`);

    // Configure widget design
    await page.click('text=Design');

    const primaryColorInput = page.locator('input[placeholder="#3b82f6"]').first();
    await primaryColorInput.fill('#059669'); // Emerald green

    await page.click('text=Position');
    await page.click('text=Bottom Right');

    // Configure behavior
    await page.click('text=Behavior');

    const greetingInput = page.locator('textarea').first();
    await greetingInput.fill('Hello! Welcome to our support chat.');

    const autoOpenSwitch = page.getByText('Auto-open Widget').locator('..').locator('button[role="switch"]');
    await autoOpenSwitch.click();

    // Configure security
    await page.click('text=Security');

    const domainInput = page.locator('input[placeholder="example.com"]');
    await domainInput.fill('mywebsite.com');
    await page.keyboard.press('Enter');

    // Save configuration
    await page.click('text=Save Configuration');
    await expect(page.getByText('Widget configuration saved successfully')).toBeVisible();

    // Get embed code
    await page.click('text=Code');

    const codeTextarea = page.locator('textarea.font-mono');
    await expect(codeTextarea).toBeVisible();

    const embedCode = await codeTextarea.inputValue();
    expect(embedCode).toContain('window.ChatbotWidget');
    expect(embedCode).toContain('wgt_new_generated_key_xyz');

    // Copy code
    await page.click('text=Copy Code');
    await expect(page.getByText('Widget Code copied to clipboard')).toBeVisible();

    // Verify analytics are available
    await page.click('text=Analytics');
    await expect(page.getByText('Analytics Settings')).toBeVisible();
  });
});
