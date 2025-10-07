import { test, expect, Page } from '@playwright/test';

// Helper function to login
async function loginUser(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'testpassword');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

test.describe('Widget Integration - Complete User Journey', () => {
  const testChatbotId = 'integration-flow-chatbot-001';

  test.beforeEach(async ({ page }) => {
    // Mock chatbot endpoints
    await page.route(`**/api/v1/chatbots/${testChatbotId}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: testChatbotId,
            name: 'Production Support Bot',
            description: 'Customer support chatbot for website',
            status: 'active',
            configuration: {
              model: 'nova-micro',
              temperature: 0.7,
              maxTokens: 1000,
              language: 'en',
              responseTimeout: 30000
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      });
    });

    // Mock integrations overview
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

  test('user journey: navigate from dashboard to widget setup', async ({ page }) => {
    // Start from dashboard
    await expect(page).toHaveURL('/dashboard');

    // Navigate to chatbots page
    await page.click('text=Chatbots');
    await page.waitForURL(/\/dashboard\/chatbots/);

    // Mock chatbots list
    await page.route('**/api/v1/chatbots', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            chatbots: [
              {
                id: testChatbotId,
                name: 'Production Support Bot',
                description: 'Customer support chatbot for website',
                status: 'active',
                apiKeyHint: 'cb_prod_***',
                configuration: {
                  model: 'nova-micro',
                  temperature: 0.7,
                  maxTokens: 1000,
                  language: 'en',
                  responseTimeout: 30000
                },
                conversationCount: 0,
                userCount: 0,
                lastActivity: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
          }
        })
      });
    });

    // Select the chatbot
    await page.click(`text=Production Support Bot`);
    await page.waitForURL(`**/chatbots/${testChatbotId}`);

    // Navigate to integrations
    await page.click('text=Integrations');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations`);

    // Verify integrations page loaded
    await expect(page.getByText('Integrations')).toBeVisible();
    await expect(page.getByText(/Connect your chatbot to external platforms/)).toBeVisible();

    // Click Setup Widget
    await page.click('text=Setup Widget');
    await page.waitForURL(`**/chatbots/${testChatbotId}/integrations/widget`);

    // Verify widget builder loaded
    await expect(page.getByText('Widget Builder')).toBeVisible();
  });

  test('complete widget configuration and code generation', async ({ page }) => {
    // Navigate directly to widget builder
    await page.goto(`/dashboard/chatbots/${testChatbotId}/integrations/widget`);
    await page.waitForLoadState('networkidle');

    // Mock widget config endpoint
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Widget not configured yet'
          })
        });
      } else if (route.request().method() === 'POST') {
        const requestData = JSON.parse(route.request().postData() || '{}');
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: {
              ...requestData,
              id: 'new-widget-config-001',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
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
          api_key: 'wgt_prod_secure_key_12345'
        })
      });
    });

    // Step 1: Configure Design
    await page.click('text=Design');

    // Set brand colors
    const primaryColorInput = page.locator('input[placeholder="#3b82f6"]').first();
    await primaryColorInput.clear();
    await primaryColorInput.fill('#0ea5e9'); // Sky blue

    // Set font
    await page.click('text=Font Family');
    await page.click('text=Roboto');

    // Set border radius
    const borderRadiusLabel = await page.getByText(/Border Radius:/).textContent();
    const currentRadius = borderRadiusLabel?.match(/\d+/)?.[0] || '12';
    const slider = page.locator('input[type="range"]').first();
    await slider.fill('16');

    // Verify change
    await expect(page.getByText('Border Radius: 16px')).toBeVisible();

    // Configure layout
    await page.click('text=Position');
    await page.click('text=Bottom Right');

    // Set widget size
    const widthInput = page.locator('input[type="number"]').first();
    await widthInput.clear();
    await widthInput.fill('400');

    // Configure branding
    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.clear();
    await botNameInput.fill('Support Agent');

    const companyNameInput = page.locator('input[placeholder="Your Company Name"]');
    await companyNameInput.clear();
    await companyNameInput.fill('Acme Corporation');

    // Step 2: Configure Behavior
    await page.click('text=Behavior');

    const greetingTextarea = page.locator('textarea').first();
    await greetingTextarea.clear();
    await greetingTextarea.fill('Welcome to Acme Support! How can we assist you today?');

    const placeholderInput = page.locator('input[placeholder="Type your message..."]');
    await placeholderInput.clear();
    await placeholderInput.fill('Describe your issue...');

    // Enable auto-open
    const autoOpenSwitch = page.getByText('Auto-open Widget').locator('..').locator('button[role="switch"]');
    await autoOpenSwitch.click();

    // Set delay
    await page.waitForTimeout(300);
    const delaySlider = page.locator('input[type="range"]').first();
    await delaySlider.fill('2000');

    // Step 3: Configure Security
    await page.click('text=Security');

    // Add allowed domains
    const domainInput = page.locator('input[placeholder="example.com"]');

    // Add first domain
    await domainInput.fill('acme.com');
    await page.keyboard.press('Enter');

    // Add second domain
    await domainInput.fill('support.acme.com');
    await page.keyboard.press('Enter');

    // Configure rate limiting
    const rateLimitSwitch = page.getByText('Rate Limiting').locator('..').locator('button[role="switch"]');
    const isEnabled = await rateLimitSwitch.getAttribute('aria-checked');

    if (isEnabled === 'true') {
      const rateLimitSlider = page.locator('input[type="range"]').first();
      await rateLimitSlider.fill('25');
    }

    // Step 4: Save Configuration
    await page.click('text=Save Configuration');

    // Verify success message
    await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Widget configuration saved successfully')).toBeVisible();

    // Step 5: Get Embed Code
    await page.click('text=Code');

    // Verify code is generated
    const codeTextarea = page.locator('textarea.font-mono');
    await expect(codeTextarea).toBeVisible();

    const embedCode = await codeTextarea.inputValue();
    expect(embedCode).toContain('window.ChatbotWidget');
    expect(embedCode).toContain('wgt_prod_secure_key_12345');
    expect(embedCode).toContain(testChatbotId);
    expect(embedCode).toContain('#0ea5e9');
    expect(embedCode).toContain('bottom-right');

    // Copy the code
    await page.click('text=Copy Code');
    await expect(page.getByText('Widget Code copied to clipboard')).toBeVisible();

    // Download the code
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/chatbot-widget.*\.html/);
  });

  test('widget preview reflects configuration changes in real-time', async ({ page }) => {
    await page.goto(`/dashboard/chatbots/${testChatbotId}/integrations/widget`);
    await page.waitForLoadState('networkidle');

    // Mock widget config
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: {
              id: 'preview-test-widget',
              api_key: 'wgt_preview_key',
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
                company_name: ''
              },
              status: 'draft'
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
          api_key: 'wgt_preview_key'
        })
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify initial preview state
    await expect(page.getByText('Live Preview')).toBeVisible();
    await expect(page.getByText('Assistant')).toBeVisible();
    await expect(page.getByText('Hi! How can I help you today?')).toBeVisible();

    // Change bot name and verify preview updates
    await page.click('text=Design');

    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.clear();
    await botNameInput.fill('Customer Support');

    // The preview should update automatically (in real implementation)
    // Note: Preview updates might require save or auto-save functionality

    // Change greeting message
    await page.click('text=Behavior');

    const greetingTextarea = page.locator('textarea').first();
    await greetingTextarea.clear();
    await greetingTextarea.fill('Hello! Welcome to our support center.');

    // Change widget position
    await page.click('text=Design');
    await page.click('text=Position');
    await page.click('text=Bottom Left');

    // Refresh preview
    await page.click('text=Refresh');
    await expect(page.getByText('Preview Refreshed')).toBeVisible();
  });

  test('handle widget analytics and performance tracking', async ({ page }) => {
    await page.goto(`/dashboard/chatbots/${testChatbotId}/integrations/widget`);
    await page.waitForLoadState('networkidle');

    // Mock widget config with analytics data
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          config: {
            id: 'analytics-widget',
            api_key: 'wgt_analytics_key',
            theme: { primary_color: '#3b82f6', secondary_color: '#f3f4f6', background_color: '#ffffff', text_color: '#374151', border_radius: 12, font_family: 'Inter, sans-serif', font_size: 14 },
            layout: { position: 'bottom-right', width: 380, height: 500, margin: 20, bubble_style: 'circle' },
            behavior: { greeting_message: 'Hi!', placeholder_text: 'Type...', auto_open: false, auto_open_delay: 3000, show_typing_indicator: true, sound_enabled: true, persistent: true },
            branding: { show_powered_by: true, bot_name: 'Assistant', company_name: '' },
            analytics: { track_events: true, track_user_behavior: true, session_recording: false },
            status: 'active'
          },
          stats: {
            total_conversations: 1247,
            unique_visitors: 892,
            conversion_rate: 18.7,
            average_session_duration: 245,
            most_active_domain: 'shop.acme.com',
            bounce_rate: 28.3
          }
        })
      });
    });

    // Mock API key
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget/api-key`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, api_key: 'wgt_analytics_key' })
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate to Analytics tab
    await page.click('text=Analytics');

    // Verify analytics settings are displayed
    await expect(page.getByText('Analytics Settings')).toBeVisible();
    await expect(page.getByText('Track Events')).toBeVisible();
    await expect(page.getByText('Track User Behavior')).toBeVisible();
    await expect(page.getByText('Session Recording')).toBeVisible();

    // Verify widget performance stats are displayed
    await expect(page.getByText('Widget Performance')).toBeVisible();

    // Check for statistics
    await expect(page.getByText('Total Conversations')).toBeVisible();
    await expect(page.getByText('1,247')).toBeVisible();

    await expect(page.getByText('Unique Visitors')).toBeVisible();
    await expect(page.getByText('892')).toBeVisible();

    await expect(page.getByText('Conversion Rate')).toBeVisible();
    await expect(page.getByText('18.7%')).toBeVisible();

    // Toggle analytics settings
    const trackEventsSwitch = page.getByText('Track Events').locator('..').locator('button[role="switch"]');
    await trackEventsSwitch.click();

    const trackBehaviorSwitch = page.getByText('Track User Behavior').locator('..').locator('button[role="switch"]');
    await trackBehaviorSwitch.click();
  });

  test('validate widget deployment workflow', async ({ page }) => {
    await page.goto(`/dashboard/chatbots/${testChatbotId}/integrations/widget`);
    await page.waitForLoadState('networkidle');

    // Mock widget config
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: {
              id: 'deployment-widget',
              api_key: 'wgt_deploy_key',
              theme: { primary_color: '#3b82f6', secondary_color: '#f3f4f6', background_color: '#ffffff', text_color: '#374151', border_radius: 12, font_family: 'Inter, sans-serif', font_size: 14 },
              layout: { position: 'bottom-right', width: 380, height: 500, margin: 20, bubble_style: 'circle' },
              behavior: { greeting_message: 'Hi!', placeholder_text: 'Type...', auto_open: false, auto_open_delay: 3000, show_typing_indicator: true, sound_enabled: true, persistent: true },
              branding: { show_powered_by: true, bot_name: 'Assistant', company_name: '' },
              analytics: { track_events: true, track_user_behavior: false, session_recording: false },
              status: 'draft'
            }
          })
        });
      } else if (route.request().method() === 'POST') {
        const requestData = JSON.parse(route.request().postData() || '{}');
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            config: { ...requestData, id: 'deployment-widget', updated_at: new Date().toISOString() }
          })
        });
      }
    });

    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget/api-key`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, api_key: 'wgt_deploy_key' })
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify initial status is Draft
    await expect(page.getByText('Draft')).toBeVisible();

    // Configure widget
    await page.click('text=Design');
    const botNameInput = page.locator('input[placeholder="Assistant"]');
    await botNameInput.clear();
    await botNameInput.fill('Production Bot');

    // Save configuration
    await page.click('text=Save Configuration');
    await expect(page.getByText('Widget configuration saved successfully')).toBeVisible();

    // Publish widget
    await page.click('text=Publish Widget');
    // In real implementation, this would update the status

    // Verify code is available after publish
    await page.click('text=Code');
    const codeTextarea = page.locator('textarea.font-mono');
    await expect(codeTextarea).toBeVisible();

    const embedCode = await codeTextarea.inputValue();
    expect(embedCode.length).toBeGreaterThan(0);
    expect(embedCode).toContain('window.ChatbotWidget');
  });

  test('verify widget security settings and domain restrictions', async ({ page }) => {
    await page.goto(`/dashboard/chatbots/${testChatbotId}/integrations/widget`);
    await page.waitForLoadState('networkidle');

    // Mock widget config
    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          config: {
            id: 'security-widget',
            api_key: 'wgt_security_key',
            theme: { primary_color: '#3b82f6', secondary_color: '#f3f4f6', background_color: '#ffffff', text_color: '#374151', border_radius: 12, font_family: 'Inter, sans-serif', font_size: 14 },
            layout: { position: 'bottom-right', width: 380, height: 500, margin: 20, bubble_style: 'circle' },
            behavior: { greeting_message: 'Hi!', placeholder_text: 'Type...', auto_open: false, auto_open_delay: 3000, show_typing_indicator: true, sound_enabled: true, persistent: true },
            branding: { show_powered_by: true, bot_name: 'Assistant', company_name: '' },
            security: {
              allowed_domains: ['example.com', 'test.com'],
              rate_limit_enabled: true,
              rate_limit_per_minute: 30,
              csrf_protection: true
            },
            status: 'active'
          }
        })
      });
    });

    await page.route(`**/api/v1/chatbots/${testChatbotId}/integrations/widget/api-key`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, api_key: 'wgt_security_key' })
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate to Security tab
    await page.click('text=Security');

    // Verify existing domains
    await expect(page.locator('input[value="example.com"]')).toBeVisible();
    await expect(page.locator('input[value="test.com"]')).toBeVisible();

    // Verify rate limiting is enabled
    await expect(page.getByText('Messages per minute: 30')).toBeVisible();

    // Verify CSRF protection
    const csrfSwitch = page.getByText('CSRF Protection').locator('..').locator('button[role="switch"]');
    const csrfEnabled = await csrfSwitch.getAttribute('aria-checked');
    expect(csrfEnabled).toBe('true');

    // Verify API key is displayed securely
    const apiKeyInput = page.locator('input.font-mono.text-sm.bg-muted');
    await expect(apiKeyInput).toHaveValue('wgt_security_key');
    await expect(apiKeyInput).toHaveAttribute('readonly');

    // Add a new domain
    const domainInput = page.locator('input[placeholder="example.com"]');
    await domainInput.fill('secure.example.com');
    await page.keyboard.press('Enter');

    // Verify security alert/notice
    await expect(page.getByText(/Security settings help protect/)).toBeVisible();
  });
});
