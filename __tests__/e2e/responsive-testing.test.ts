import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

// Device configurations for testing
const devices = {
  mobile: { width: 375, height: 667, name: 'Mobile (iPhone SE)' },
  tablet: { width: 768, height: 1024, name: 'Tablet (iPad)' },
  desktop: { width: 1920, height: 1080, name: 'Desktop (Full HD)' },
  ultrawide: { width: 2560, height: 1440, name: 'Ultrawide Desktop' },
  small: { width: 320, height: 568, name: 'Small Mobile (iPhone 5)' },
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

async function setViewportAndWait(page: Page, device: any) {
  await page.setViewportSize({ width: device.width, height: device.height });
  await page.waitForTimeout(500); // Allow layout to settle
}

async function testResponsiveLayout(page: Page, device: any, expectations: any) {
  await setViewportAndWait(page, device);

  for (const [selector, expected] of Object.entries(expectations)) {
    const element = page.locator(selector);

    if (expected === 'visible') {
      await expect(element).toBeVisible();
    } else if (expected === 'hidden') {
      await expect(element).not.toBeVisible();
    } else if (typeof expected === 'object' && expected.css) {
      await expect(element).toHaveCSS(expected.css.property, expected.css.value);
    } else if (typeof expected === 'object' && expected.count) {
      await expect(element).toHaveCount(expected.count);
    }
  }
}

test.describe('Responsive Design E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should adapt dashboard layout across all device sizes', async ({ page }) => {
    await page.goto('/dashboard');

    // Test mobile layout
    await testResponsiveLayout(page, devices.mobile, {
      '[data-testid="mobile-menu-toggle"]': 'visible',
      '[data-testid="desktop-sidebar"]': 'hidden',
      '[data-testid="dashboard-grid"]': { css: { property: 'grid-template-columns', value: /repeat\(1,/ } },
      '[data-testid="analytics-card"]': 'visible',
      '[data-testid="breadcrumbs"]': 'visible',
    });

    // Test tablet layout
    await testResponsiveLayout(page, devices.tablet, {
      '[data-testid="mobile-menu-toggle"]': 'hidden',
      '[data-testid="desktop-sidebar"]': 'visible',
      '[data-testid="dashboard-grid"]': { css: { property: 'grid-template-columns', value: /repeat\(2,/ } },
      '[data-testid="analytics-card"]': 'visible',
    });

    // Test desktop layout
    await testResponsiveLayout(page, devices.desktop, {
      '[data-testid="mobile-menu-toggle"]': 'hidden',
      '[data-testid="desktop-sidebar"]': 'visible',
      '[data-testid="dashboard-grid"]': { css: { property: 'grid-template-columns', value: /repeat\(3,/ } },
      '[data-testid="analytics-card"]': 'visible',
    });

    // Test ultrawide layout
    await testResponsiveLayout(page, devices.ultrawide, {
      '[data-testid="dashboard-grid"]': { css: { property: 'grid-template-columns', value: /repeat\(4,/ } },
      '[data-testid="analytics-card"]': 'visible',
    });
  });

  test('should handle mobile navigation interactions', async ({ page }) => {
    await setViewportAndWait(page, devices.mobile);
    await page.goto('/dashboard');

    // Test mobile menu toggle
    const mobileMenuToggle = page.locator('[data-testid="mobile-menu-toggle"]');
    const mobileMenu = page.locator('[data-testid="mobile-menu"]');

    await expect(mobileMenuToggle).toBeVisible();
    await expect(mobileMenu).not.toBeVisible();

    // Open mobile menu
    await mobileMenuToggle.click();
    await expect(mobileMenu).toBeVisible();

    // Test navigation through mobile menu
    await mobileMenu.locator('[data-testid="nav-analytics"]').click();
    await expect(page).toHaveURL('/dashboard/analytics');
    await expect(mobileMenu).not.toBeVisible(); // Should close after navigation

    // Test swipe gestures (if implemented)
    const mainContent = page.locator('[role="main"]');
    await mainContent.hover();

    // Simulate swipe from left edge to open menu
    await page.mouse.move(10, 300);
    await page.mouse.down();
    await page.mouse.move(200, 300);
    await page.mouse.up();

    await page.waitForTimeout(500);
    // Menu might open with swipe gesture
  });

  test('should adapt chat interface for different screen sizes', async ({ page }) => {
    await page.goto('/chat');

    // Mobile chat layout
    await setViewportAndWait(page, devices.mobile);

    const chatSidebar = page.locator('[data-testid="chat-sidebar"]');
    const chatInterface = page.locator('[data-testid="chat-interface"]');
    const conversationList = page.locator('[data-testid="conversation-list"]');

    // On mobile, sidebar might be hidden or collapsed
    if (await chatSidebar.isVisible()) {
      // Test sidebar toggle on mobile
      const sidebarToggle = page.locator('[data-testid="sidebar-toggle"]');
      if (await sidebarToggle.isVisible()) {
        await sidebarToggle.click();
        await expect(chatSidebar).toHaveClass(/collapsed|hidden/);
      }
    }

    // Chat input should be full width on mobile
    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible();

    // Test message bubbles on mobile
    const messageContainer = page.locator('[data-testid="message-container"]');
    if (await messageContainer.isVisible()) {
      const messages = messageContainer.locator('[data-testid="message"]');
      const messageCount = await messages.count();

      for (let i = 0; i < Math.min(3, messageCount); i++) {
        const message = messages.nth(i);
        const boundingBox = await message.boundingBox();

        if (boundingBox) {
          // Messages should not exceed screen width
          expect(boundingBox.width).toBeLessThanOrEqual(devices.mobile.width);
        }
      }
    }

    // Tablet chat layout
    await setViewportAndWait(page, devices.tablet);
    await expect(chatSidebar).toBeVisible();
    await expect(chatInterface).toBeVisible();

    // Desktop chat layout
    await setViewportAndWait(page, devices.desktop);
    await expect(chatSidebar).toBeVisible();
    await expect(chatInterface).toBeVisible();

    // Both sidebar and chat should be visible side by side
    const sidebarBox = await chatSidebar.boundingBox();
    const interfaceBox = await chatInterface.boundingBox();

    if (sidebarBox && interfaceBox) {
      expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(interfaceBox.x);
    }
  });

  test('should handle touch interactions on mobile devices', async ({ page }) => {
    await setViewportAndWait(page, devices.mobile);
    await page.goto('/dashboard');

    // Test touch-friendly button sizes
    const touchTargets = [
      '[data-testid="mobile-menu-toggle"]',
      '[data-testid="user-avatar"]',
      '[data-testid="quick-action-button"]',
      '[data-testid="refresh-button"]',
    ];

    for (const selector of touchTargets) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        const boundingBox = await element.boundingBox();

        if (boundingBox) {
          // Touch targets should be at least 44px (iOS guidelines)
          expect(boundingBox.height).toBeGreaterThanOrEqual(44);
          expect(boundingBox.width).toBeGreaterThanOrEqual(44);
        }
      }
    }

    // Test touch scrolling
    const scrollableContainer = page.locator('[data-testid="dashboard-content"]');
    if (await scrollableContainer.isVisible()) {
      // Simulate touch scroll
      await scrollableContainer.hover();
      await page.mouse.down();
      await page.mouse.move(0, -200); // Scroll up
      await page.mouse.up();

      await page.waitForTimeout(500);
      // Content should have scrolled
    }

    // Test pull-to-refresh (if implemented)
    const mainContent = page.locator('[role="main"]');
    await mainContent.hover();
    await page.mouse.move(devices.mobile.width / 2, 100);
    await page.mouse.down();
    await page.mouse.move(devices.mobile.width / 2, 200); // Pull down
    await page.mouse.up();

    // Check for refresh indicator
    const refreshIndicator = page.locator('[data-testid="pull-refresh-indicator"]');
    if (await refreshIndicator.isVisible({ timeout: 1000 })) {
      await expect(refreshIndicator).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('should adapt typography and spacing for readability', async ({ page }) => {
    await page.goto('/dashboard');

    // Test mobile typography
    await setViewportAndWait(page, devices.mobile);

    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const paragraphs = page.locator('p');

    // Check heading sizes on mobile
    for (let i = 0; i < Math.min(3, await headings.count()); i++) {
      const heading = headings.nth(i);
      const fontSize = await heading.evaluate(el =>
        window.getComputedStyle(el).fontSize
      );

      // Headings should be readable on mobile (at least 18px)
      const fontSizeNum = parseInt(fontSize);
      expect(fontSizeNum).toBeGreaterThanOrEqual(18);
    }

    // Check paragraph line height for readability
    for (let i = 0; i < Math.min(3, await paragraphs.count()); i++) {
      const paragraph = paragraphs.nth(i);
      const lineHeight = await paragraph.evaluate(el =>
        window.getComputedStyle(el).lineHeight
      );

      // Line height should be at least 1.4 for readability
      if (lineHeight !== 'normal') {
        const lineHeightNum = parseFloat(lineHeight);
        expect(lineHeightNum).toBeGreaterThanOrEqual(1.4);
      }
    }

    // Test desktop typography
    await setViewportAndWait(page, devices.desktop);

    // Verify spacing between elements
    const cards = page.locator('[data-testid$="-card"]');
    for (let i = 0; i < Math.min(2, await cards.count() - 1); i++) {
      const card1 = cards.nth(i);
      const card2 = cards.nth(i + 1);

      const box1 = await card1.boundingBox();
      const box2 = await card2.boundingBox();

      if (box1 && box2) {
        // Cards should have proper spacing between them
        const gap = Math.abs(box2.y - (box1.y + box1.height));
        expect(gap).toBeGreaterThanOrEqual(16); // At least 16px gap
      }
    }
  });

  test('should handle orientation changes on mobile devices', async ({ page }) => {
    await page.goto('/dashboard');

    // Portrait orientation
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    const dashboardGrid = page.locator('[data-testid="dashboard-grid"]');
    await expect(dashboardGrid).toBeVisible();

    // Get initial layout
    const portraitCols = await dashboardGrid.evaluate(el =>
      window.getComputedStyle(el).gridTemplateColumns
    );

    // Landscape orientation
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(500);

    const landscapeCols = await dashboardGrid.evaluate(el =>
      window.getComputedStyle(el).gridTemplateColumns
    );

    // Layout should adapt to landscape (might have more columns)
    expect(landscapeCols).toBeDefined();

    // Test chat interface in landscape
    await page.goto('/chat');
    await page.waitForTimeout(500);

    const chatSidebar = page.locator('[data-testid="chat-sidebar"]');
    const chatInterface = page.locator('[data-testid="chat-interface"]');

    // In landscape, both sidebar and chat should be visible
    await expect(chatSidebar).toBeVisible();
    await expect(chatInterface).toBeVisible();
  });

  test('should adapt form layouts for different screen sizes', async ({ page }) => {
    await page.goto('/dashboard/chatbots/create');

    // Mobile form layout
    await setViewportAndWait(page, devices.mobile);

    const form = page.locator('[data-testid="chatbot-form"]');
    if (await form.isVisible()) {
      const formFields = form.locator('input, textarea, select');

      for (let i = 0; i < Math.min(5, await formFields.count()); i++) {
        const field = formFields.nth(i);
        const fieldBox = await field.boundingBox();

        if (fieldBox) {
          // Form fields should be full width on mobile
          expect(fieldBox.width).toBeGreaterThan(devices.mobile.width * 0.8);
        }
      }

      // Test form buttons on mobile
      const submitButton = form.locator('[type="submit"]');
      if (await submitButton.isVisible()) {
        const buttonBox = await submitButton.boundingBox();

        if (buttonBox) {
          // Submit button should be full width or prominently sized
          expect(buttonBox.height).toBeGreaterThanOrEqual(44);
        }
      }
    }

    // Desktop form layout
    await setViewportAndWait(page, devices.desktop);

    if (await form.isVisible()) {
      // Form might have multi-column layout on desktop
      const formContainer = form.locator('> div').first();
      const containerStyle = await formContainer.evaluate(el =>
        window.getComputedStyle(el).display
      );

      // Form might use grid or flex layout on desktop
      expect(['grid', 'flex', 'block']).toContain(containerStyle);
    }
  });

  test('should handle responsive images and media', async ({ page }) => {
    await page.goto('/dashboard');

    const devices_to_test = [devices.mobile, devices.tablet, devices.desktop];

    for (const device of devices_to_test) {
      await setViewportAndWait(page, device);

      // Test responsive images
      const images = page.locator('img');
      for (let i = 0; i < Math.min(3, await images.count()); i++) {
        const img = images.nth(i);
        const imgBox = await img.boundingBox();

        if (imgBox) {
          // Images should not overflow container
          expect(imgBox.width).toBeLessThanOrEqual(device.width);
        }

        // Check if image has responsive attributes
        const srcset = await img.getAttribute('srcset');
        const sizes = await img.getAttribute('sizes');

        // Responsive images should have srcset or sizes attributes
        expect(srcset || sizes).toBeTruthy();
      }

      // Test responsive charts/graphs
      const charts = page.locator('[data-testid$="-chart"], [data-testid$="-graph"]');
      for (let i = 0; i < Math.min(2, await charts.count()); i++) {
        const chart = charts.nth(i);
        if (await chart.isVisible()) {
          const chartBox = await chart.boundingBox();

          if (chartBox) {
            // Charts should adapt to container width
            expect(chartBox.width).toBeLessThanOrEqual(device.width - 32); // Account for padding
          }
        }
      }
    }
  });

  test('should maintain accessibility across different viewport sizes', async ({ page }) => {
    const pagesToTest = ['/dashboard', '/chat', '/dashboard/analytics'];

    for (const pageUrl of pagesToTest) {
      await page.goto(pageUrl);

      for (const device of Object.values(devices)) {
        await setViewportAndWait(page, device);

        // Test focus visibility
        await page.keyboard.press('Tab');
        const focusedElement = page.locator(':focus');

        if (await focusedElement.isVisible()) {
          // Focused element should have visible focus indicator
          const outline = await focusedElement.evaluate(el =>
            window.getComputedStyle(el).outline
          );
          const boxShadow = await focusedElement.evaluate(el =>
            window.getComputedStyle(el).boxShadow
          );

          expect(outline !== 'none' || boxShadow !== 'none').toBeTruthy();
        }

        // Test ARIA landmarks
        const landmarks = page.locator('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"]');
        await expect(landmarks).toHaveCount({ min: 1 });

        // Test heading hierarchy
        const headings = page.locator('h1, h2, h3, h4, h5, h6');
        if (await headings.count() > 0) {
          const firstHeading = headings.first();
          const tagName = await firstHeading.evaluate(el => el.tagName);
          expect(tagName).toBe('H1'); // Page should start with h1
        }

        // Test skip links
        const skipLink = page.locator('[data-testid="skip-to-content"]');
        if (await skipLink.isVisible()) {
          await expect(skipLink).toHaveAttribute('href', '#main-content');
        }
      }
    }
  });

  test('should handle responsive data tables', async ({ page }) => {
    await page.goto('/dashboard/analytics');

    // Check if there are any data tables
    const tables = page.locator('table, [role="table"]');

    if (await tables.count() > 0) {
      const table = tables.first();

      // Mobile table layout
      await setViewportAndWait(page, devices.mobile);

      const tableContainer = table.locator('..').first();
      const containerStyle = await tableContainer.evaluate(el =>
        window.getComputedStyle(el).overflowX
      );

      // Table should be scrollable on mobile
      expect(['auto', 'scroll']).toContain(containerStyle);

      // Test horizontal scrolling
      await table.hover();
      await page.mouse.down();
      await page.mouse.move(-100, 0); // Scroll left
      await page.mouse.up();

      // Desktop table layout
      await setViewportAndWait(page, devices.desktop);

      const tableBox = await table.boundingBox();
      if (tableBox) {
        // Table should fit within desktop viewport
        expect(tableBox.width).toBeLessThanOrEqual(devices.desktop.width);
      }
    }
  });

  test('should handle responsive modals and overlays', async ({ page }) => {
    await page.goto('/dashboard');

    // Try to open a modal
    const modalTrigger = page.locator('[data-testid="settings-button"], [data-testid="user-menu-trigger"]');

    if (await modalTrigger.isVisible()) {
      await modalTrigger.click();

      const modal = page.locator('[role="dialog"], [data-testid="modal"]');

      if (await modal.isVisible()) {
        // Test modal on mobile
        await setViewportAndWait(page, devices.mobile);

        const modalBox = await modal.boundingBox();
        if (modalBox) {
          // Modal should fit within mobile viewport
          expect(modalBox.width).toBeLessThanOrEqual(devices.mobile.width);
          expect(modalBox.height).toBeLessThanOrEqual(devices.mobile.height);

          // Modal should be positioned appropriately
          expect(modalBox.x).toBeGreaterThanOrEqual(0);
          expect(modalBox.y).toBeGreaterThanOrEqual(0);
        }

        // Test modal on desktop
        await setViewportAndWait(page, devices.desktop);

        const desktopModalBox = await modal.boundingBox();
        if (desktopModalBox) {
          // Modal should be centered on desktop
          const centerX = devices.desktop.width / 2;
          const modalCenterX = desktopModalBox.x + desktopModalBox.width / 2;

          expect(Math.abs(modalCenterX - centerX)).toBeLessThan(100);
        }

        // Close modal
        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible();
      }
    }
  });
});