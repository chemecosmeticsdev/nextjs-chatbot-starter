import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
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

async function waitForPageLoad(page: Page) {
  // Wait for main content to load
  await expect(page.locator('[role="main"]')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

test.describe('Navigation Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate through all major sections using breadcrumbs', async ({ page }) => {
    // Start at dashboard
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Dashboard');

    // Navigate to Analytics
    await page.click('[data-testid="view-analytics-button"]');
    await expect(page).toHaveURL('/dashboard/analytics');
    await waitForPageLoad(page);
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Analytics');

    // Test breadcrumb navigation back to dashboard
    await breadcrumbs.locator('[data-testid="breadcrumb-item"]').filter({ hasText: 'Dashboard' }).click();
    await expect(page).toHaveURL('/dashboard');
    await waitForPageLoad(page);

    // Navigate to Chatbots
    await page.click('[data-testid="manage-chatbots-button"]');
    await expect(page).toHaveURL('/dashboard/chatbots');
    await waitForPageLoad(page);
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Chatbots');

    // Navigate to Chat
    await page.click('[data-testid="start-chat-action"]');
    await expect(page).toHaveURL('/chat');
    await waitForPageLoad(page);
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Chat');

    // Test deep navigation with nested breadcrumbs
    await page.goto('/dashboard/chatbots/123/settings');
    await waitForPageLoad(page);

    const breadcrumbItems = breadcrumbs.locator('[data-testid="breadcrumb-item"]');
    await expect(breadcrumbItems).toHaveCount(4); // Dashboard > Chatbots > [Bot Name] > Settings
    await expect(breadcrumbItems.nth(0)).toContainText('Dashboard');
    await expect(breadcrumbItems.nth(1)).toContainText('Chatbots');
    await expect(breadcrumbItems.nth(3)).toContainText('Settings');
  });

  test('should handle keyboard navigation throughout the application', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Test Tab navigation through interactive elements
    await page.keyboard.press('Tab');
    let focusedElement = await page.locator(':focus').getAttribute('data-testid');
    expect(focusedElement).toBeTruthy();

    // Navigate through multiple tab stops
    const tabStops = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const currentFocus = await page.locator(':focus').getAttribute('data-testid');
      if (currentFocus) {
        tabStops.push(currentFocus);
      }
    }

    // Verify we can navigate through at least 5 interactive elements
    expect(tabStops.length).toBeGreaterThanOrEqual(5);

    // Test keyboard shortcuts
    await page.keyboard.press('Alt+D'); // Dashboard shortcut
    await expect(page).toHaveURL('/dashboard');

    await page.keyboard.press('Alt+C'); // Chat shortcut
    await expect(page).toHaveURL('/chat');

    await page.keyboard.press('Alt+A'); // Analytics shortcut
    await expect(page).toHaveURL('/dashboard/analytics');

    // Test Escape key to close modals/dropdowns
    await page.click('[data-testid="user-menu-trigger"]');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible();
  });

  test('should maintain navigation state across page reloads', async ({ page }) => {
    // Navigate to a specific page
    await page.goto('/dashboard/analytics');
    await waitForPageLoad(page);

    // Verify breadcrumbs are correct
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Analytics');

    // Reload the page
    await page.reload();
    await waitForPageLoad(page);

    // Verify navigation state is preserved
    await expect(page).toHaveURL('/dashboard/analytics');
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Analytics');

    // Test with query parameters
    await page.goto('/dashboard/chatbots?filter=active&sort=name');
    await waitForPageLoad(page);

    await page.reload();
    await waitForPageLoad(page);

    // Verify URL and state preservation
    expect(page.url()).toContain('filter=active');
    expect(page.url()).toContain('sort=name');
  });

  test('should handle navigation with browser back/forward buttons', async ({ page }) => {
    const navigationHistory = [
      '/dashboard',
      '/dashboard/analytics',
      '/dashboard/chatbots',
      '/chat',
      '/dashboard/settings'
    ];

    // Navigate through pages
    for (const url of navigationHistory) {
      await page.goto(url);
      await waitForPageLoad(page);
    }

    // Test browser back navigation
    await page.goBack();
    await expect(page).toHaveURL('/chat');
    await waitForPageLoad(page);

    await page.goBack();
    await expect(page).toHaveURL('/dashboard/chatbots');
    await waitForPageLoad(page);

    // Test browser forward navigation
    await page.goForward();
    await expect(page).toHaveURL('/chat');
    await waitForPageLoad(page);

    // Verify breadcrumbs update correctly with browser navigation
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toContainText('Chat');
  });

  test('should provide accessible navigation for screen readers', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Test ARIA landmarks
    await expect(page.locator('[role="navigation"]')).toBeVisible();
    await expect(page.locator('[role="main"]')).toBeVisible();

    // Test breadcrumb accessibility
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    await expect(breadcrumbs).toHaveAttribute('aria-label', /breadcrumb/i);

    // Test navigation menu accessibility
    const navMenu = page.locator('[role="navigation"]');
    const navItems = navMenu.locator('[role="menuitem"], a');

    for (let i = 0; i < Math.min(5, await navItems.count()); i++) {
      const item = navItems.nth(i);
      const ariaLabel = await item.getAttribute('aria-label');
      const textContent = await item.textContent();

      // Each nav item should have either aria-label or text content
      expect(ariaLabel || textContent).toBeTruthy();
    }

    // Test skip navigation link
    await page.keyboard.press('Tab');
    const skipLink = page.locator('[data-testid="skip-to-content"]');
    if (await skipLink.isVisible()) {
      await expect(skipLink).toHaveAttribute('href', '#main-content');
    }
  });

  test('should handle navigation analytics and tracking', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Mock analytics tracking
    let analyticsEvents: any[] = [];
    await page.addInitScript(() => {
      (window as any).__analytics_events = [];
      (window as any).gtag = (...args: any[]) => {
        (window as any).__analytics_events.push(args);
      };
    });

    // Navigate to different sections
    await page.click('[data-testid="view-analytics-button"]');
    await waitForPageLoad(page);

    await page.click('[data-testid="manage-chatbots-button"]');
    await waitForPageLoad(page);

    // Check if navigation events were tracked
    const events = await page.evaluate(() => (window as any).__analytics_events || []);

    // Should have at least some navigation events
    expect(events.length).toBeGreaterThan(0);
  });

  test('should handle navigation with different user roles', async ({ page }) => {
    // Test admin navigation
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Admin should see all navigation options
    await expect(page.locator('[data-testid="admin-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="system-settings-nav"]')).toBeVisible();

    // Test restricted access
    await page.goto('/admin/system-settings');

    // Should either load the page (if admin) or redirect with proper error handling
    const currentUrl = page.url();
    if (currentUrl.includes('/admin/system-settings')) {
      await expect(page.locator('[data-testid="admin-panel"]')).toBeVisible();
    } else {
      // Should redirect to appropriate page with error message
      await expect(page.locator('[data-testid="access-denied-message"]')).toBeVisible();
    }
  });

  test('should handle navigation errors gracefully', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Test navigation to non-existent page
    await page.goto('/dashboard/non-existent-page');

    // Should show 404 page or redirect
    const is404 = await page.locator('[data-testid="404-page"]').isVisible();
    const isRedirected = !page.url().includes('non-existent-page');

    expect(is404 || isRedirected).toBeTruthy();

    // Test navigation during network issues
    await page.route('**/api/**', route => route.abort());

    await page.goto('/dashboard/analytics');

    // Should handle API failures gracefully
    await expect(page.locator('[data-testid="error-boundary"], [data-testid="network-error"]')).toBeVisible();

    // Restore network and test recovery
    await page.unroute('**/api/**');
    await page.click('[data-testid="retry-button"]');

    // Should recover and load content
    await waitForPageLoad(page);
    await expect(page.locator('[data-testid="analytics-dashboard"]')).toBeVisible();
  });

  test('should support mobile navigation patterns', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Test mobile menu toggle
    const mobileMenuToggle = page.locator('[data-testid="mobile-menu-toggle"]');
    await expect(mobileMenuToggle).toBeVisible();

    await mobileMenuToggle.click();
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();

    // Test swipe navigation (if implemented)
    const mainContent = page.locator('[role="main"]');

    // Simulate swipe gesture
    await mainContent.hover();
    await page.mouse.down();
    await page.mouse.move(100, 0); // Swipe right
    await page.mouse.up();

    // Test touch-friendly navigation
    const navItems = page.locator('[data-testid="nav-item"]');
    for (let i = 0; i < Math.min(3, await navItems.count()); i++) {
      const item = navItems.nth(i);
      const boundingBox = await item.boundingBox();

      if (boundingBox) {
        // Touch targets should be at least 44px (iOS) or 48px (Android) in size
        expect(boundingBox.height).toBeGreaterThanOrEqual(44);
        expect(boundingBox.width).toBeGreaterThanOrEqual(44);
      }
    }

    // Test mobile breadcrumb behavior
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    if (await breadcrumbs.isVisible()) {
      // Mobile breadcrumbs might be collapsed or scrollable
      const breadcrumbContainer = breadcrumbs.locator('..');
      const isScrollable = await breadcrumbContainer.evaluate(el =>
        el.scrollWidth > el.clientWidth
      );

      if (isScrollable) {
        // Test horizontal scrolling on mobile
        await breadcrumbContainer.evaluate(el => el.scrollLeft = el.scrollWidth);
        await expect(breadcrumbs.locator('[data-testid="breadcrumb-item"]').last()).toBeVisible();
      }
    }
  });

  test('should handle deep linking and URL parameters correctly', async ({ page }) => {
    // Test deep linking with parameters
    await page.goto('/dashboard/chatbots/123?tab=settings&section=advanced');
    await waitForPageLoad(page);

    // Verify URL parameters are preserved
    expect(page.url()).toContain('tab=settings');
    expect(page.url()).toContain('section=advanced');

    // Verify UI reflects URL state
    const settingsTab = page.locator('[data-testid="settings-tab"]');
    const advancedSection = page.locator('[data-testid="advanced-section"]');

    if (await settingsTab.isVisible()) {
      await expect(settingsTab).toHaveAttribute('aria-selected', 'true');
    }

    // Test navigation preserves parameters
    await page.click('[data-testid="breadcrumb-chatbots"]');
    await expect(page).toHaveURL('/dashboard/chatbots');

    // Navigate back and verify parameters are restored
    await page.goBack();
    expect(page.url()).toContain('tab=settings');
    expect(page.url()).toContain('section=advanced');

    // Test invalid parameters
    await page.goto('/dashboard/chatbots/123?invalid=parameter&tab=nonexistent');
    await waitForPageLoad(page);

    // Should handle invalid parameters gracefully
    const errorMessage = page.locator('[data-testid="invalid-parameter-warning"]');
    const defaultTab = page.locator('[data-testid="default-tab"]');

    // Either show error or fallback to default state
    const hasError = await errorMessage.isVisible();
    const hasDefault = await defaultTab.isVisible();
    expect(hasError || hasDefault).toBeTruthy();
  });
});