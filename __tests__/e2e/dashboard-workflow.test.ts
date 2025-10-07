import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

const testChatbot = {
  name: 'E2E Test Bot',
  description: 'Automated testing chatbot',
  model: 'claude-3-sonnet',
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

async function navigateToDashboard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.locator('[data-testid="dashboard-title"]')).toBeVisible();
}

async function waitForMetricsToLoad(page: Page) {
  // Wait for main metrics cards to load
  await expect(page.locator('[data-testid="analytics-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="widget-stats-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="live-metrics-card"]')).toBeVisible();

  // Wait for loading spinners to disappear
  await expect(page.locator('[data-testid="analytics-loading"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="widgets-loading"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="metrics-loading"]')).not.toBeVisible();
}

test.describe('Dashboard Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load dashboard and display all metrics correctly', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Verify analytics card displays data
    const analyticsCard = page.locator('[data-testid="analytics-card"]');
    await expect(analyticsCard.locator('[data-testid="total-conversations"]')).toContainText(/\d+/);
    await expect(analyticsCard.locator('[data-testid="active-users"]')).toContainText(/\d+/);
    await expect(analyticsCard.locator('[data-testid="response-time"]')).toContainText(/\d+\.?\d*s?/);
    await expect(analyticsCard.locator('[data-testid="satisfaction-score"]')).toContainText(/\d+\.?\d*\/5/);

    // Verify widget stats card displays data
    const widgetStatsCard = page.locator('[data-testid="widget-stats-card"]');
    await expect(widgetStatsCard.locator('[data-testid="active-widgets"]')).toContainText(/\d+/);
    await expect(widgetStatsCard.locator('[data-testid="total-deployments"]')).toContainText(/\d+/);
    await expect(widgetStatsCard.locator('[data-testid="success-rate"]')).toContainText(/\d+\.?\d*%/);

    // Verify live metrics card displays real-time data
    const liveMetricsCard = page.locator('[data-testid="live-metrics-card"]');
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText(/\d+/);
    await expect(liveMetricsCard.locator('[data-testid="messages-last-hour"]')).toContainText(/\d+/);
    await expect(liveMetricsCard.locator('[data-testid="connection-status"]')).toContainText('Connected');
  });

  test('should navigate through dashboard sections using breadcrumbs', async ({ page }) => {
    await navigateToDashboard(page);

    // Verify initial breadcrumb
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Dashboard');

    // Navigate to analytics section
    await page.click('[data-testid="view-analytics-button"]');
    await expect(page).toHaveURL('/dashboard/analytics');
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Analytics');

    // Navigate back using breadcrumb
    await breadcrumbs.locator('[data-testid="breadcrumb-item"]').filter({ hasText: 'Dashboard' }).click();
    await expect(page).toHaveURL('/dashboard');

    // Navigate to chatbots section
    await page.click('[data-testid="manage-chatbots-button"]');
    await expect(page).toHaveURL('/dashboard/chatbots');
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Chatbots');
  });

  test('should use quick actions for navigation', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    const quickActionsCard = page.locator('[data-testid="quick-actions-card"]');
    await expect(quickActionsCard).toBeVisible();

    // Test "Start Chat" action
    await quickActionsCard.locator('[data-testid="start-chat-action"]').click();
    await expect(page).toHaveURL('/chat');
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

    // Navigate back to dashboard
    await page.goto('/dashboard');

    // Test "Create Chatbot" action
    await quickActionsCard.locator('[data-testid="create-chatbot-action"]').click();
    await expect(page).toHaveURL('/dashboard/chatbots/create');
    await expect(page.locator('[data-testid="chatbot-form"]')).toBeVisible();

    // Navigate back to dashboard
    await page.goto('/dashboard');

    // Test "View Analytics" action
    await quickActionsCard.locator('[data-testid="view-analytics-action"]').click();
    await expect(page).toHaveURL('/dashboard/analytics');
    await expect(page.locator('[data-testid="analytics-dashboard"]')).toBeVisible();
  });

  test('should handle real-time metric updates', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    const liveMetricsCard = page.locator('[data-testid="live-metrics-card"]');

    // Get initial active sessions count
    const initialSessions = await liveMetricsCard.locator('[data-testid="active-sessions"]').textContent();

    // Wait for real-time update (mock or actual)
    await page.waitForTimeout(2000);

    // Verify connection status remains healthy
    await expect(liveMetricsCard.locator('[data-testid="connection-status"]')).toContainText('Connected');

    // Verify metrics are updating (values should be numbers)
    await expect(liveMetricsCard.locator('[data-testid="active-sessions"]')).toContainText(/^\d+$/);
    await expect(liveMetricsCard.locator('[data-testid="messages-last-hour"]')).toContainText(/^\d+$/);
  });

  test('should refresh dashboard data manually', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Click refresh button
    await page.click('[data-testid="refresh-dashboard-button"]');

    // Verify loading states appear
    await expect(page.locator('[data-testid="dashboard-refreshing"]')).toBeVisible();

    // Wait for refresh to complete
    await expect(page.locator('[data-testid="dashboard-refreshing"]')).not.toBeVisible();

    // Verify data is still displayed
    await waitForMetricsToLoad(page);
  });

  test('should handle dashboard errors gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/analytics**', route => route.abort());

    await navigateToDashboard(page);

    // Verify error state is displayed
    await expect(page.locator('[data-testid="analytics-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="analytics-retry-button"]')).toBeVisible();

    // Restore API and retry
    await page.unroute('**/api/analytics**');
    await page.click('[data-testid="analytics-retry-button"]');

    // Verify data loads after retry
    await expect(page.locator('[data-testid="analytics-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-conversations"]')).toContainText(/\d+/);
  });

  test('should display system health information', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    const systemHealthCard = page.locator('[data-testid="system-health-card"]');
    await expect(systemHealthCard).toBeVisible();

    // Verify system status
    await expect(systemHealthCard.locator('[data-testid="system-status"]')).toContainText(/healthy|operational/i);

    // Verify individual service statuses
    await expect(systemHealthCard.locator('[data-testid="database-status"]')).toBeVisible();
    await expect(systemHealthCard.locator('[data-testid="websocket-status"]')).toBeVisible();
    await expect(systemHealthCard.locator('[data-testid="api-status"]')).toBeVisible();

    // Check uptime display
    await expect(systemHealthCard.locator('[data-testid="system-uptime"]')).toContainText(/\d+\.?\d*%/);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Test tab navigation through quick actions
    await page.keyboard.press('Tab'); // Focus first interactive element

    let focusedElement = await page.locator(':focus').getAttribute('data-testid');
    expect(focusedElement).toBeTruthy();

    // Continue tabbing through quick actions
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const currentFocus = await page.locator(':focus').getAttribute('data-testid');
      expect(currentFocus).toBeTruthy();
    }

    // Test Enter key activation
    await page.keyboard.press('Enter');

    // Should navigate somewhere (URL should change)
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl).not.toBe('/dashboard');
  });

  test('should handle responsive layout changes', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Test desktop layout
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('[data-testid="dashboard-grid"]')).toHaveClass(/grid-cols-2|grid-cols-3/);

    // Test tablet layout
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('[data-testid="dashboard-grid"]')).toHaveClass(/grid-cols-1|grid-cols-2/);

    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[data-testid="dashboard-grid"]')).toHaveClass(/grid-cols-1/);

    // Verify mobile navigation is accessible
    await expect(page.locator('[data-testid="mobile-menu-toggle"]')).toBeVisible();
  });

  test('should display activity feed and handle interactions', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    const activityFeedCard = page.locator('[data-testid="activity-feed-card"]');
    await expect(activityFeedCard).toBeVisible();

    // Verify activity items are displayed
    const activityItems = activityFeedCard.locator('[data-testid="activity-item"]');
    await expect(activityItems.first()).toBeVisible();

    // Test activity filtering
    const filterButton = activityFeedCard.locator('[data-testid="filter-activities"]');
    if (await filterButton.isVisible()) {
      await filterButton.click();

      // Select a filter option
      await page.click('[data-testid="filter-conversations"]');

      // Verify filtered results
      await expect(activityItems.first()).toBeVisible();
    }

    // Test activity search
    const searchInput = activityFeedCard.locator('[data-testid="activity-search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('conversation');
      await page.keyboard.press('Enter');

      // Verify search results
      await expect(activityItems.first()).toBeVisible();
    }
  });

  test('should export dashboard data', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Start download waiting
    const downloadPromise = page.waitForEvent('download');

    // Click export button
    await page.click('[data-testid="export-dashboard-data"]');

    // Wait for download
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/dashboard-export.*\.(csv|json|xlsx)$/);

    // Verify export feedback
    await expect(page.locator('[data-testid="export-success-message"]')).toBeVisible();
  });

  test('should maintain state during navigation and return', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Get initial metric values
    const initialConversations = await page.locator('[data-testid="total-conversations"]').textContent();
    const initialUsers = await page.locator('[data-testid="active-users"]').textContent();

    // Navigate away
    await page.goto('/chat');
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

    // Navigate back
    await page.goto('/dashboard');
    await waitForMetricsToLoad(page);

    // Verify metrics are displayed (may be cached or refreshed)
    await expect(page.locator('[data-testid="total-conversations"]')).toContainText(/\d+/);
    await expect(page.locator('[data-testid="active-users"]')).toContainText(/\d+/);
  });

  test('should handle dashboard permissions correctly', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Admin should see all sections
    await expect(page.locator('[data-testid="analytics-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="system-health-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="quick-actions-card"]')).toBeVisible();

    // Admin should see admin-only actions
    const quickActions = page.locator('[data-testid="quick-actions-card"]');
    await expect(quickActions.locator('[data-testid="create-chatbot-action"]')).toBeVisible();
    await expect(quickActions.locator('[data-testid="manage-users-action"]')).toBeVisible();
    await expect(quickActions.locator('[data-testid="system-settings-action"]')).toBeVisible();
  });

  test('should show appropriate loading states during slow connections', async ({ page }) => {
    // Throttle network to simulate slow connection
    await page.route('**/api/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      route.continue();
    });

    await navigateToDashboard(page);

    // Verify loading states are shown
    await expect(page.locator('[data-testid="analytics-skeleton"]')).toBeVisible();
    await expect(page.locator('[data-testid="widgets-skeleton"]')).toBeVisible();
    await expect(page.locator('[data-testid="metrics-skeleton"]')).toBeVisible();

    // Wait for content to load
    await waitForMetricsToLoad(page);

    // Verify loading states are gone
    await expect(page.locator('[data-testid="analytics-skeleton"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="widgets-skeleton"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="metrics-skeleton"]')).not.toBeVisible();
  });

  test('should handle concurrent dashboard operations', async ({ page }) => {
    await navigateToDashboard(page);
    await waitForMetricsToLoad(page);

    // Start multiple operations simultaneously
    const refreshPromise = page.click('[data-testid="refresh-dashboard-button"]');
    const exportPromise = page.click('[data-testid="export-dashboard-data"]');

    // Wait for operations to complete
    await Promise.all([refreshPromise, exportPromise]);

    // Verify dashboard is still functional
    await expect(page.locator('[data-testid="analytics-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-conversations"]')).toContainText(/\d+/);
  });
});