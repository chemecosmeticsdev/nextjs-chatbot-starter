import { test, expect, Page } from '@playwright/test';

// Helper function to login (assuming basic auth is set up)
async function loginUser(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'testpassword');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

// Helper function to wait for API responses
async function waitForApiResponse(page: Page, endpoint: string) {
  return page.waitForResponse(response =>
    response.url().includes(endpoint) && response.status() === 200
  );
}

test.describe('Chatbot Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route('**/api/v1/chatbots', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              chatbots: [],
              pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
            }
          })
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'new-chatbot-id',
              name: 'Test Chatbot',
              description: 'A test chatbot for E2E testing',
              status: 'active',
              apiKeyHint: 'cb_test_***',
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
      }
    });

    await page.route('**/api/v1/chatbots/new-chatbot-id', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'new-chatbot-id',
              name: 'Test Chatbot',
              description: 'A test chatbot for E2E testing',
              status: 'active',
              systemPrompt: 'You are a helpful assistant.',
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
      }
    });

    await loginUser(page);
  });

  test('complete chatbot creation and configuration flow', async ({ page }) => {
    // Navigate to chatbots page
    await page.goto('/dashboard/chatbots');
    await page.waitForLoadState('networkidle');

    // Verify we're on the chatbots page
    await expect(page.getByText('Chatbots')).toBeVisible();
    await expect(page.getByText('Manage your AI chatbots')).toBeVisible();

    // Should show empty state initially
    await expect(page.getByText('No chatbots found')).toBeVisible();
    await expect(page.getByText('Create your first chatbot to get started')).toBeVisible();

    // Click create new chatbot button
    await page.click('text=Create New Chatbot');
    await page.waitForURL('**/chatbots/create');

    // Fill in chatbot creation form
    await page.fill('[data-testid="chatbot-name"]', 'Test Chatbot');
    await page.fill('[data-testid="chatbot-description"]', 'A test chatbot for E2E testing');

    // Select model
    await page.click('[data-testid="model-select"]');
    await page.click('text=Nova Micro');

    // Set temperature
    await page.fill('[data-testid="temperature-input"]', '0.7');

    // Set max tokens
    await page.fill('[data-testid="max-tokens-input"]', '1000');

    // Submit form
    const createApiPromise = waitForApiResponse(page, '/api/v1/chatbots');
    await page.click('[data-testid="create-chatbot-button"]');
    await createApiPromise;

    // Should redirect to new chatbot page
    await page.waitForURL('**/chatbots/new-chatbot-id');

    // Verify chatbot was created successfully
    await expect(page.getByText('Test Chatbot')).toBeVisible();
    await expect(page.getByText('A test chatbot for E2E testing')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();

    // Navigate to configuration page
    await page.click('text=Configure');
    await page.waitForURL('**/chatbots/new-chatbot-id/configure');

    // Verify configuration page loads
    await expect(page.getByText('Configuration')).toBeVisible();
    await expect(page.getByText('Configure your chatbot settings')).toBeVisible();

    // Test tab navigation
    await expect(page.getByText('General')).toBeVisible();
    await expect(page.getByText('AI Model')).toBeVisible();
    await expect(page.getByText('Behavior')).toBeVisible();
    await expect(page.getByText('Security')).toBeVisible();

    // Test AI Model tab
    await page.click('text=AI Model');
    await expect(page.getByText('Model')).toBeVisible();
    await expect(page.getByText('Temperature')).toBeVisible();
    await expect(page.getByText('Max Tokens')).toBeVisible();

    // Adjust temperature using slider
    const temperatureSlider = page.locator('[data-testid="temperature-slider"]');
    await temperatureSlider.fill('0.9');

    // Test Behavior tab
    await page.click('text=Behavior');
    await expect(page.getByText('Response Timeout')).toBeVisible();
    await expect(page.getByText('Language')).toBeVisible();

    // Test Security tab
    await page.click('text=Security');
    await expect(page.getByText('Rate Limiting')).toBeVisible();
    await expect(page.getByText('Profanity Filter')).toBeVisible();

    // Enable rate limiting
    const rateLimitToggle = page.locator('[data-testid="rate-limit-toggle"]');
    await rateLimitToggle.click();

    // Save configuration changes
    await page.click('text=Save Changes');

    // Wait for save success message
    await expect(page.getByText('Configuration saved successfully')).toBeVisible();

    // Test playground functionality
    await page.click('text=Playground');
    await page.waitForURL('**/chatbots/new-chatbot-id/playground');

    // Verify playground interface
    await expect(page.getByText('Playground')).toBeVisible();
    await expect(page.getByText('Test and interact with your chatbot')).toBeVisible();
    await expect(page.getByPlaceholder('Type your message...')).toBeVisible();

    // Test configuration override panel
    await expect(page.getByText('Configuration Override')).toBeVisible();
    await expect(page.getByText('Performance Metrics')).toBeVisible();

    // Navigate back to chatbots list
    await page.goto('/dashboard/chatbots');

    // Mock updated chatbots list with the new chatbot
    await page.route('**/api/v1/chatbots', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            chatbots: [{
              id: 'new-chatbot-id',
              name: 'Test Chatbot',
              description: 'A test chatbot for E2E testing',
              status: 'active',
              apiKeyHint: 'cb_test_***',
              configuration: {
                model: 'nova-micro',
                temperature: 0.9,
                maxTokens: 1000,
                language: 'en',
                responseTimeout: 30000
              },
              conversationCount: 0,
              userCount: 0,
              lastActivity: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
          }
        })
      });
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify chatbot appears in the list
    await expect(page.getByText('Test Chatbot')).toBeVisible();
    await expect(page.getByText('A test chatbot for E2E testing')).toBeVisible();
    await expect(page.locator('.bg-green-100').getByText('Active')).toBeVisible();
  });

  test('chatbot search and filtering functionality', async ({ page }) => {
    // Mock chatbots list with multiple items
    await page.route('**/api/v1/chatbots', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            chatbots: [
              {
                id: 'chatbot-1',
                name: 'Customer Support Bot',
                description: 'Handles customer inquiries',
                status: 'active',
                apiKeyHint: 'cb_cs_***',
                configuration: { model: 'nova-micro', temperature: 0.7, maxTokens: 1000, language: 'en', responseTimeout: 30000 },
                conversationCount: 150,
                userCount: 45,
                lastActivity: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              },
              {
                id: 'chatbot-2',
                name: 'Sales Assistant',
                description: 'Helps with sales inquiries',
                status: 'inactive',
                apiKeyHint: 'cb_sa_***',
                configuration: { model: 'claude-3-haiku', temperature: 0.5, maxTokens: 2000, language: 'en', responseTimeout: 45000 },
                conversationCount: 75,
                userCount: 23,
                lastActivity: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ],
            pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
          }
        })
      });
    });

    await page.goto('/dashboard/chatbots');
    await page.waitForLoadState('networkidle');

    // Verify both chatbots are visible
    await expect(page.getByText('Customer Support Bot')).toBeVisible();
    await expect(page.getByText('Sales Assistant')).toBeVisible();

    // Test search functionality
    const searchInput = page.getByPlaceholder('Search chatbots...');
    await searchInput.fill('Customer');

    // Should show only matching chatbot
    await expect(page.getByText('Customer Support Bot')).toBeVisible();
    await expect(page.getByText('Sales Assistant')).not.toBeVisible();

    // Clear search
    await searchInput.clear();
    await expect(page.getByText('Sales Assistant')).toBeVisible();

    // Test status filtering
    await page.click('[data-testid="status-filter"]');
    await page.click('text=Active');

    // Should show only active chatbot
    await expect(page.getByText('Customer Support Bot')).toBeVisible();
    await expect(page.getByText('Sales Assistant')).not.toBeVisible();

    // Reset filter
    await page.click('[data-testid="status-filter"]');
    await page.click('text=All Status');
    await expect(page.getByText('Sales Assistant')).toBeVisible();
  });

  test('bulk operations on chatbots', async ({ page }) => {
    // Mock chatbots list for bulk operations
    await page.route('**/api/v1/chatbots', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            chatbots: [
              {
                id: 'chatbot-1',
                name: 'Bot 1',
                description: 'Test bot 1',
                status: 'active',
                apiKeyHint: 'cb_1_***',
                configuration: { model: 'nova-micro', temperature: 0.7, maxTokens: 1000, language: 'en', responseTimeout: 30000 },
                conversationCount: 10,
                userCount: 5,
                lastActivity: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              },
              {
                id: 'chatbot-2',
                name: 'Bot 2',
                description: 'Test bot 2',
                status: 'inactive',
                apiKeyHint: 'cb_2_***',
                configuration: { model: 'nova-micro', temperature: 0.7, maxTokens: 1000, language: 'en', responseTimeout: 30000 },
                conversationCount: 5,
                userCount: 2,
                lastActivity: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ],
            pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
          }
        })
      });
    });

    await page.goto('/dashboard/chatbots');
    await page.waitForLoadState('networkidle');

    // Select all chatbots
    const selectAllCheckbox = page.locator('[data-testid="select-all-checkbox"]');
    await selectAllCheckbox.click();

    // Verify selection state
    await expect(page.getByText('2 selected')).toBeVisible();

    // Verify bulk actions toolbar appears
    await expect(page.getByText('Bulk Actions')).toBeVisible();
    await expect(page.getByText('Activate Selected')).toBeVisible();
    await expect(page.getByText('Deactivate Selected')).toBeVisible();

    // Test individual selection
    await selectAllCheckbox.click(); // Unselect all

    const firstChatbotCheckbox = page.locator('[data-testid="chatbot-checkbox-chatbot-1"]');
    await firstChatbotCheckbox.click();

    await expect(page.getByText('1 selected')).toBeVisible();
  });
});