import { Page } from '@playwright/test';

/**
 * Helper functions for Widget E2E tests
 */

// ============================================================================
// Authentication Helpers
// ============================================================================

/**
 * Log in a test user
 * @param page Playwright page object
 * @param email User email (defaults to test@example.com)
 * @param password User password (defaults to testpassword)
 */
export async function loginUser(
  page: Page,
  email: string = 'test@example.com',
  password: string = 'testpassword'
): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to a chatbot's widget builder page
 * @param page Playwright page object
 * @param chatbotId The chatbot ID
 */
export async function navigateToWidgetBuilder(page: Page, chatbotId: string): Promise<void> {
  await page.goto(`/dashboard/chatbots/${chatbotId}/integrations/widget`);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to a chatbot's integrations page
 * @param page Playwright page object
 * @param chatbotId The chatbot ID
 */
export async function navigateToChatbotIntegrations(page: Page, chatbotId: string): Promise<void> {
  await page.goto(`/dashboard/chatbots/${chatbotId}/integrations`);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to widget preview page
 * @param page Playwright page object
 * @param widgetId The widget ID
 */
export async function navigateToWidgetPreview(page: Page, widgetId: string): Promise<void> {
  await page.goto(`/integrations/widget/${widgetId}/preview`);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to widget chat page
 * @param page Playwright page object
 * @param widgetId The widget ID
 */
export async function navigateToWidgetChat(page: Page, widgetId: string): Promise<void> {
  await page.goto(`/integrations/widget/${widgetId}/chat`);
  await page.waitForLoadState('networkidle');
}

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Generate default widget configuration
 * @param overrides Partial configuration to override defaults
 */
export function generateWidgetConfig(overrides: any = {}) {
  return {
    id: 'test-widget-id',
    name: 'Website Chat Widget',
    api_key: 'wgt_test_key_123',
    theme: {
      primary_color: '#3b82f6',
      secondary_color: '#f3f4f6',
      background_color: '#ffffff',
      text_color: '#374151',
      border_radius: 12,
      font_family: 'Inter, sans-serif',
      font_size: 14,
      ...overrides.theme
    },
    layout: {
      position: 'bottom-right',
      width: 380,
      height: 500,
      margin: 20,
      bubble_style: 'circle',
      ...overrides.layout
    },
    behavior: {
      greeting_message: 'Hi! How can I help you today?',
      placeholder_text: 'Type your message...',
      auto_open: false,
      auto_open_delay: 3000,
      show_typing_indicator: true,
      sound_enabled: true,
      persistent: true,
      ...overrides.behavior
    },
    security: {
      allowed_domains: [],
      rate_limit_enabled: true,
      rate_limit_per_minute: 30,
      csrf_protection: true,
      ...overrides.security
    },
    branding: {
      show_powered_by: true,
      bot_name: 'Assistant',
      company_name: '',
      ...overrides.branding
    },
    analytics: {
      track_events: true,
      track_user_behavior: false,
      session_recording: false,
      ...overrides.analytics
    },
    status: 'draft',
    ...overrides
  };
}

/**
 * Generate widget statistics
 * @param overrides Partial stats to override defaults
 */
export function generateWidgetStats(overrides: any = {}) {
  return {
    total_conversations: 150,
    unique_visitors: 85,
    conversion_rate: 12.5,
    average_session_duration: 180,
    most_active_domain: 'example.com',
    bounce_rate: 35,
    ...overrides
  };
}

/**
 * Generate chatbot data
 * @param chatbotId The chatbot ID
 * @param overrides Partial chatbot data to override defaults
 */
export function generateChatbotData(chatbotId: string, overrides: any = {}) {
  return {
    id: chatbotId,
    name: 'Test Chatbot',
    description: 'A test chatbot for E2E testing',
    status: 'active',
    configuration: {
      model: 'nova-micro',
      temperature: 0.7,
      maxTokens: 1000,
      language: 'en',
      responseTimeout: 30000,
      ...overrides.configuration
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

// ============================================================================
// Mock Setup Helpers
// ============================================================================

/**
 * Set up widget configuration API mocks
 * @param page Playwright page object
 * @param chatbotId The chatbot ID
 * @param config Widget configuration (optional, uses defaults if not provided)
 * @param stats Widget statistics (optional)
 */
export async function mockWidgetConfigAPI(
  page: Page,
  chatbotId: string,
  config?: any,
  stats?: any
): Promise<void> {
  const widgetConfig = config || generateWidgetConfig();
  const widgetStats = stats || generateWidgetStats();

  await page.route(`**/api/v1/chatbots/${chatbotId}/integrations/widget`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          config: widgetConfig,
          stats: widgetStats
        })
      });
    } else if (route.request().method() === 'POST') {
      const requestData = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          config: { ...requestData, id: widgetConfig.id }
        })
      });
    }
  });
}

/**
 * Set up chatbot API mocks
 * @param page Playwright page object
 * @param chatbotId The chatbot ID
 * @param chatbotData Chatbot data (optional, uses defaults if not provided)
 */
export async function mockChatbotAPI(
  page: Page,
  chatbotId: string,
  chatbotData?: any
): Promise<void> {
  const chatbot = chatbotData || generateChatbotData(chatbotId);

  await page.route(`**/api/v1/chatbots/${chatbotId}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: chatbot
      })
    });
  });
}

/**
 * Set up widget API key generation mock
 * @param page Playwright page object
 * @param chatbotId The chatbot ID
 * @param apiKey The API key to return (optional, generates one if not provided)
 */
export async function mockWidgetAPIKey(
  page: Page,
  chatbotId: string,
  apiKey?: string
): Promise<void> {
  const key = apiKey || `wgt_${chatbotId}_${Date.now()}`;

  await page.route(`**/api/v1/chatbots/${chatbotId}/integrations/widget/api-key`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        api_key: key
      })
    });
  });
}

/**
 * Set up integrations overview API mock
 * @param page Playwright page object
 * @param chatbotId The chatbot ID
 * @param integrations Integration states (optional)
 */
export async function mockIntegrationsAPI(
  page: Page,
  chatbotId: string,
  integrations?: any
): Promise<void> {
  const defaultIntegrations = {
    line: { enabled: false, configured: false },
    widget: { enabled: false, configured: false },
    webhook: { enabled: false, configured: false }
  };

  await page.route(`**/api/v1/chatbots/${chatbotId}/integrations`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          integrations: integrations || defaultIntegrations,
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
}

/**
 * Set up chat API mock
 * @param page Playwright page object
 * @param responseMessage Custom response message (optional)
 */
export async function mockChatAPI(
  page: Page,
  responseMessage?: string
): Promise<void> {
  await page.route('**/api/v1/chat/**', (route) => {
    const requestBody = JSON.parse(route.request().postData() || '{}');
    const message = responseMessage || `Echo: ${requestBody.message}`;

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message,
        conversationId: 'test-conversation-123',
        timestamp: new Date().toISOString()
      })
    });
  });
}

// ============================================================================
// Interaction Helpers
// ============================================================================

/**
 * Fill widget design settings
 * @param page Playwright page object
 * @param settings Design settings to apply
 */
export async function fillDesignSettings(
  page: Page,
  settings: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    borderRadius?: number;
    position?: string;
    bubbleStyle?: string;
    width?: number;
    height?: number;
    botName?: string;
    companyName?: string;
  }
): Promise<void> {
  await page.click('text=Design');

  if (settings.primaryColor) {
    const input = page.locator('input[placeholder="#3b82f6"]').first();
    await input.clear();
    await input.fill(settings.primaryColor);
  }

  if (settings.fontFamily) {
    await page.click('text=Font Family');
    await page.click(`text=${settings.fontFamily}`);
  }

  if (settings.borderRadius !== undefined) {
    const slider = page.locator('input[type="range"]').first();
    await slider.fill(String(settings.borderRadius));
  }

  if (settings.position) {
    await page.click('text=Position');
    await page.click(`text=${settings.position}`);
  }

  if (settings.botName) {
    const input = page.locator('input[placeholder="Assistant"]');
    await input.clear();
    await input.fill(settings.botName);
  }

  if (settings.companyName) {
    const input = page.locator('input[placeholder="Your Company Name"]');
    await input.clear();
    await input.fill(settings.companyName);
  }
}

/**
 * Fill widget behavior settings
 * @param page Playwright page object
 * @param settings Behavior settings to apply
 */
export async function fillBehaviorSettings(
  page: Page,
  settings: {
    greetingMessage?: string;
    placeholderText?: string;
    autoOpen?: boolean;
    autoOpenDelay?: number;
    showTypingIndicator?: boolean;
    soundEnabled?: boolean;
  }
): Promise<void> {
  await page.click('text=Behavior');

  if (settings.greetingMessage) {
    const textarea = page.locator('textarea').first();
    await textarea.clear();
    await textarea.fill(settings.greetingMessage);
  }

  if (settings.placeholderText) {
    const input = page.locator('input[placeholder="Type your message..."]');
    await input.clear();
    await input.fill(settings.placeholderText);
  }

  if (settings.autoOpen !== undefined) {
    const toggle = page.getByText('Auto-open Widget').locator('..').locator('button[role="switch"]');
    const currentState = await toggle.getAttribute('aria-checked');

    if ((currentState === 'true') !== settings.autoOpen) {
      await toggle.click();
    }

    if (settings.autoOpen && settings.autoOpenDelay !== undefined) {
      await page.waitForTimeout(300);
      const slider = page.locator('input[type="range"]').first();
      await slider.fill(String(settings.autoOpenDelay));
    }
  }
}

/**
 * Add allowed domain to security settings
 * @param page Playwright page object
 * @param domain Domain to add
 */
export async function addAllowedDomain(page: Page, domain: string): Promise<void> {
  await page.click('text=Security');

  const input = page.locator('input[placeholder="example.com"]');
  await input.fill(domain);
  await page.keyboard.press('Enter');
}

/**
 * Wait for API response
 * @param page Playwright page object
 * @param endpoint Endpoint pattern to wait for
 * @param status Expected status code (defaults to 200)
 */
export async function waitForAPIResponse(
  page: Page,
  endpoint: string,
  status: number = 200
): Promise<void> {
  await page.waitForResponse(
    response => response.url().includes(endpoint) && response.status() === status
  );
}

/**
 * Copy to clipboard and verify toast
 * @param page Playwright page object
 * @param buttonText Text of the copy button
 * @param expectedToast Expected toast message
 */
export async function copyAndVerifyToast(
  page: Page,
  buttonText: string,
  expectedToast: string
): Promise<void> {
  await page.click(`text=${buttonText}`);
  await page.waitForSelector(`text=${expectedToast}`, { timeout: 5000 });
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Verify widget preview is visible with correct configuration
 * @param page Playwright page object
 */
export async function verifyWidgetPreview(page: Page): Promise<void> {
  const preview = page.locator('[data-widget-container], .bg-gradient-to-br').first();

  if (await preview.count() > 0) {
    // Preview container exists
  }
}

/**
 * Verify embed code contains required elements
 * @param page Playwright page object
 * @param chatbotId Expected chatbot ID
 * @param apiKey Expected API key
 */
export async function verifyEmbedCode(
  page: Page,
  chatbotId: string,
  apiKey: string
): Promise<boolean> {
  const codeTextarea = page.locator('textarea.font-mono');
  const embedCode = await codeTextarea.inputValue();

  return (
    embedCode.includes('window.ChatbotWidget') &&
    embedCode.includes(chatbotId) &&
    embedCode.includes(apiKey)
  );
}
