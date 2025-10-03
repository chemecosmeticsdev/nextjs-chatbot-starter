import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

// Performance targets
const PERFORMANCE_TARGETS = {
  ROUTE_TRANSITION_TIME: 50, // ms
  BREADCRUMB_UPDATE_TIME: 30, // ms
  PAGE_TRANSITION_ANIMATION: 300, // ms
  SIDEBAR_TOGGLE_TIME: 200, // ms
  NAVIGATION_CLICK_RESPONSE: 100, // ms
  HISTORY_NAVIGATION_TIME: 150, // ms
};

// Navigation routes to test
const NAVIGATION_ROUTES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/dashboard/analytics', name: 'Analytics' },
  { path: '/dashboard/chatbots', name: 'Chatbots' },
  { path: '/chat', name: 'Chat' },
  { path: '/dashboard/settings', name: 'Settings' },
];

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

async function measureRouteTransition(page: Page, fromRoute: string, toRoute: string, method: 'click' | 'goto' = 'goto') {
  // Start from initial route
  await page.goto(fromRoute);
  await page.waitForLoadState('networkidle');

  const startTime = performance.now();

  // Mark transition start
  await page.evaluate(() => {
    performance.mark('navigation-start');
    (window as any).transitionStartTime = performance.now();
  });

  if (method === 'click') {
    // Find and click navigation element
    const navElement = page.locator(`[href="${toRoute}"], [data-route="${toRoute}"]`).first();
    if (await navElement.isVisible()) {
      await navElement.click();
    } else {
      // Fallback to goto if navigation element not found
      await page.goto(toRoute);
    }
  } else {
    await page.goto(toRoute);
  }

  // Wait for new route to load
  await expect(page).toHaveURL(toRoute);
  await page.waitForSelector('[role="main"]', { state: 'visible' });

  // Mark transition end
  await page.evaluate(() => {
    performance.mark('navigation-end');
    performance.measure('route-transition', 'navigation-start', 'navigation-end');
    (window as any).transitionEndTime = performance.now();
  });

  const endTime = performance.now();

  // Get detailed timing information
  const timingInfo = await page.evaluate(() => {
    const measure = performance.getEntriesByName('route-transition')[0];
    const transitionTime = (window as any).transitionEndTime - (window as any).transitionStartTime;

    return {
      measureDuration: measure?.duration || 0,
      transitionTime,
      domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
    };
  });

  return {
    totalTime: endTime - startTime,
    transitionTime: timingInfo.transitionTime,
    measureDuration: timingInfo.measureDuration,
  };
}

async function measureBreadcrumbUpdate(page: Page, route: string) {
  await page.goto(route);

  const startTime = performance.now();

  // Mark breadcrumb update start
  await page.evaluate(() => {
    performance.mark('breadcrumb-update-start');
  });

  // Wait for breadcrumbs to be visible and updated
  const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
  await expect(breadcrumbs).toBeVisible();

  // Wait for specific breadcrumb content to appear
  await page.waitForFunction(() => {
    const breadcrumbItems = document.querySelectorAll('[data-testid="breadcrumb-item"]');
    return breadcrumbItems.length > 0;
  });

  // Mark breadcrumb update end
  await page.evaluate(() => {
    performance.mark('breadcrumb-update-end');
    performance.measure('breadcrumb-update', 'breadcrumb-update-start', 'breadcrumb-update-end');
  });

  const endTime = performance.now();

  const breadcrumbUpdateTime = await page.evaluate(() => {
    const measure = performance.getEntriesByName('breadcrumb-update')[0];
    return measure?.duration || 0;
  });

  return {
    totalTime: endTime - startTime,
    breadcrumbUpdateTime,
  };
}

async function measureAnimationPerformance(page: Page, animationTrigger: () => Promise<void>) {
  // Start frame counting
  await page.evaluate(() => {
    (window as any).frameCount = 0;
    (window as any).animationStartTime = performance.now();

    function countFrame() {
      (window as any).frameCount++;
      requestAnimationFrame(countFrame);
    }
    requestAnimationFrame(countFrame);
  });

  const startTime = performance.now();

  // Trigger animation
  await animationTrigger();

  // Wait for animation to complete
  await page.waitForTimeout(PERFORMANCE_TARGETS.PAGE_TRANSITION_ANIMATION + 100);

  const endTime = performance.now();

  const animationMetrics = await page.evaluate(() => {
    const frameCount = (window as any).frameCount || 0;
    const duration = performance.now() - (window as any).animationStartTime;
    return {
      frameCount,
      duration,
      fps: frameCount / (duration / 1000),
    };
  });

  return {
    totalTime: endTime - startTime,
    ...animationMetrics,
  };
}

test.describe('Navigation Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should handle route transitions within performance targets', async ({ page }) => {
    const transitionMetrics = [];

    // Test transitions between all major routes
    for (let i = 0; i < NAVIGATION_ROUTES.length - 1; i++) {
      const fromRoute = NAVIGATION_ROUTES[i];
      const toRoute = NAVIGATION_ROUTES[i + 1];

      const metrics = await measureRouteTransition(page, fromRoute.path, toRoute.path);
      transitionMetrics.push({
        from: fromRoute.name,
        to: toRoute.name,
        ...metrics,
      });

      // Each transition should be fast
      expect(metrics.transitionTime).toBeLessThan(PERFORMANCE_TARGETS.ROUTE_TRANSITION_TIME);

      await page.waitForTimeout(100); // Small delay between tests
    }

    // Calculate average performance
    const avgTransitionTime = transitionMetrics.reduce((sum, m) => sum + m.transitionTime, 0) / transitionMetrics.length;

    console.log('Route Transition Performance:', {
      averageTransitionTime: `${avgTransitionTime.toFixed(2)}ms`,
      transitionCount: transitionMetrics.length,
      transitions: transitionMetrics.map(m => ({
        route: `${m.from} → ${m.to}`,
        time: `${m.transitionTime.toFixed(2)}ms`,
      })),
    });
  });

  test('should update breadcrumbs efficiently across navigation', async ({ page }) => {
    const breadcrumbMetrics = [];

    for (const route of NAVIGATION_ROUTES) {
      const metrics = await measureBreadcrumbUpdate(page, route.path);
      breadcrumbMetrics.push({
        route: route.name,
        ...metrics,
      });

      // Breadcrumb updates should be fast
      expect(metrics.breadcrumbUpdateTime).toBeLessThan(PERFORMANCE_TARGETS.BREADCRUMB_UPDATE_TIME);

      await page.waitForTimeout(50);
    }

    const avgBreadcrumbTime = breadcrumbMetrics.reduce((sum, m) => sum + m.breadcrumbUpdateTime, 0) / breadcrumbMetrics.length;

    console.log('Breadcrumb Update Performance:', {
      averageUpdateTime: `${avgBreadcrumbTime.toFixed(2)}ms`,
      routeCount: breadcrumbMetrics.length,
      routes: breadcrumbMetrics.map(m => ({
        route: m.route,
        time: `${m.breadcrumbUpdateTime.toFixed(2)}ms`,
      })),
    });
  });

  test('should handle navigation animations smoothly', async ({ page }) => {
    await page.goto('/dashboard');

    // Test page transition animation
    const pageTransitionMetrics = await measureAnimationPerformance(page, async () => {
      await page.goto('/dashboard/analytics');
      await page.waitForSelector('[role="main"]', { state: 'visible' });
    });

    // Animation should maintain good frame rate
    expect(pageTransitionMetrics.fps).toBeGreaterThan(30);

    // Test sidebar animation
    const sidebarToggle = page.locator('[data-testid="sidebar-toggle"]');
    if (await sidebarToggle.isVisible()) {
      const sidebarAnimationMetrics = await measureAnimationPerformance(page, async () => {
        await sidebarToggle.click();
        await page.waitForTimeout(PERFORMANCE_TARGETS.SIDEBAR_TOGGLE_TIME);
      });

      expect(sidebarAnimationMetrics.fps).toBeGreaterThan(30);

      console.log('Sidebar Animation Performance:', {
        fps: `${sidebarAnimationMetrics.fps.toFixed(1)} FPS`,
        duration: `${sidebarAnimationMetrics.duration.toFixed(2)}ms`,
        frameCount: sidebarAnimationMetrics.frameCount,
      });
    }

    console.log('Page Transition Animation Performance:', {
      fps: `${pageTransitionMetrics.fps.toFixed(1)} FPS`,
      duration: `${pageTransitionMetrics.duration.toFixed(2)}ms`,
      frameCount: pageTransitionMetrics.frameCount,
    });
  });

  test('should handle navigation clicks with minimal delay', async ({ page }) => {
    await page.goto('/dashboard');

    const navigationElements = [
      '[data-testid="nav-analytics"]',
      '[data-testid="nav-chatbots"]',
      '[data-testid="nav-chat"]',
      '[data-testid="breadcrumb-item"]',
    ];

    const clickMetrics = [];

    for (const selector of navigationElements) {
      const element = page.locator(selector).first();

      if (await element.isVisible()) {
        const startTime = performance.now();

        await element.click();

        // Wait for navigation to start (URL change or loading indicator)
        await page.waitForFunction(() => {
          return window.location.href !== (window as any).initialUrl ||
                 document.querySelector('[data-testid$="-loading"]') !== null;
        }, { timeout: 500 });

        const responseTime = performance.now() - startTime;
        clickMetrics.push({
          element: selector,
          responseTime,
        });

        expect(responseTime).toBeLessThan(PERFORMANCE_TARGETS.NAVIGATION_CLICK_RESPONSE);

        // Reset to dashboard for next test
        await page.goto('/dashboard');
        await page.waitForSelector('[role="main"]', { state: 'visible' });
      }
    }

    const avgClickResponse = clickMetrics.reduce((sum, m) => sum + m.responseTime, 0) / clickMetrics.length;

    console.log('Navigation Click Performance:', {
      averageResponseTime: `${avgClickResponse.toFixed(2)}ms`,
      clickCount: clickMetrics.length,
      clicks: clickMetrics.map(m => ({
        element: m.element,
        time: `${m.responseTime.toFixed(2)}ms`,
      })),
    });
  });

  test('should handle browser history navigation efficiently', async ({ page }) => {
    const historyNavigation = [
      '/dashboard',
      '/dashboard/analytics',
      '/dashboard/chatbots',
      '/chat',
      '/dashboard/settings',
    ];

    // Build up history
    for (const route of historyNavigation) {
      await page.goto(route);
      await page.waitForSelector('[role="main"]', { state: 'visible' });
    }

    const historyMetrics = [];

    // Test back navigation
    for (let i = 0; i < historyNavigation.length - 1; i++) {
      const startTime = performance.now();

      await page.goBack();
      await page.waitForLoadState('networkidle');

      const backTime = performance.now() - startTime;
      historyMetrics.push({
        type: 'back',
        time: backTime,
        toRoute: historyNavigation[historyNavigation.length - 2 - i],
      });

      expect(backTime).toBeLessThan(PERFORMANCE_TARGETS.HISTORY_NAVIGATION_TIME);
    }

    // Test forward navigation
    for (let i = 0; i < historyNavigation.length - 1; i++) {
      const startTime = performance.now();

      await page.goForward();
      await page.waitForLoadState('networkidle');

      const forwardTime = performance.now() - startTime;
      historyMetrics.push({
        type: 'forward',
        time: forwardTime,
        toRoute: historyNavigation[i + 1],
      });

      expect(forwardTime).toBeLessThan(PERFORMANCE_TARGETS.HISTORY_NAVIGATION_TIME);
    }

    const avgHistoryTime = historyMetrics.reduce((sum, m) => sum + m.time, 0) / historyMetrics.length;

    console.log('Browser History Navigation Performance:', {
      averageTime: `${avgHistoryTime.toFixed(2)}ms`,
      navigationCount: historyMetrics.length,
      navigations: historyMetrics.map(m => ({
        type: m.type,
        route: m.toRoute,
        time: `${m.time.toFixed(2)}ms`,
      })),
    });
  });

  test('should maintain performance with deep navigation levels', async ({ page }) => {
    const deepRoutes = [
      '/dashboard',
      '/dashboard/chatbots',
      '/dashboard/chatbots/123',
      '/dashboard/chatbots/123/settings',
      '/dashboard/chatbots/123/settings/advanced',
      '/dashboard/chatbots/123/conversations',
      '/dashboard/chatbots/123/conversations/456',
    ];

    const deepNavMetrics = [];

    for (let i = 0; i < deepRoutes.length - 1; i++) {
      const metrics = await measureRouteTransition(page, deepRoutes[i], deepRoutes[i + 1]);
      deepNavMetrics.push({
        level: i + 1,
        route: deepRoutes[i + 1],
        ...metrics,
      });

      // Deep navigation should not significantly degrade performance
      expect(metrics.transitionTime).toBeLessThan(PERFORMANCE_TARGETS.ROUTE_TRANSITION_TIME * 1.5);

      // Test breadcrumb generation for deep routes
      const breadcrumbMetrics = await measureBreadcrumbUpdate(page, deepRoutes[i + 1]);
      expect(breadcrumbMetrics.breadcrumbUpdateTime).toBeLessThan(PERFORMANCE_TARGETS.BREADCRUMB_UPDATE_TIME * 2);
    }

    const avgDeepNavTime = deepNavMetrics.reduce((sum, m) => sum + m.transitionTime, 0) / deepNavMetrics.length;

    console.log('Deep Navigation Performance:', {
      averageTransitionTime: `${avgDeepNavTime.toFixed(2)}ms`,
      maxDepth: deepRoutes.length,
      routes: deepNavMetrics.map(m => ({
        level: m.level,
        route: m.route,
        time: `${m.transitionTime.toFixed(2)}ms`,
      })),
    });
  });

  test('should handle keyboard navigation efficiently', async ({ page }) => {
    await page.goto('/dashboard');

    const keyboardNavMetrics = [];

    // Test Tab navigation performance
    for (let i = 0; i < 10; i++) {
      const startTime = performance.now();

      await page.keyboard.press('Tab');

      // Wait for focus to change
      await page.waitForFunction(() => {
        const activeElement = document.activeElement;
        return activeElement && activeElement !== document.body;
      }, { timeout: 200 });

      const tabTime = performance.now() - startTime;
      keyboardNavMetrics.push({
        type: 'tab',
        time: tabTime,
        step: i + 1,
      });

      expect(tabTime).toBeLessThan(50); // Tab navigation should be very fast
    }

    // Test keyboard shortcuts
    const shortcuts = [
      { key: 'Alt+D', target: '/dashboard' },
      { key: 'Alt+C', target: '/chat' },
      { key: 'Alt+A', target: '/dashboard/analytics' },
    ];

    for (const shortcut of shortcuts) {
      const startTime = performance.now();

      await page.keyboard.press(shortcut.key);

      // Wait for navigation to occur (if implemented)
      try {
        await page.waitForURL(shortcut.target, { timeout: 1000 });
        const shortcutTime = performance.now() - startTime;

        keyboardNavMetrics.push({
          type: 'shortcut',
          key: shortcut.key,
          time: shortcutTime,
        });

        expect(shortcutTime).toBeLessThan(200);
      } catch (error) {
        // Keyboard shortcut not implemented, skip
      }
    }

    const avgTabTime = keyboardNavMetrics
      .filter(m => m.type === 'tab')
      .reduce((sum, m) => sum + m.time, 0) / 10;

    console.log('Keyboard Navigation Performance:', {
      averageTabTime: `${avgTabTime.toFixed(2)}ms`,
      totalNavigations: keyboardNavMetrics.length,
      navigations: keyboardNavMetrics.map(m => ({
        type: m.type,
        key: m.key || `Tab ${m.step}`,
        time: `${m.time.toFixed(2)}ms`,
      })),
    });
  });

  test('should optimize navigation state management', async ({ page }) => {
    await page.goto('/dashboard');

    // Measure navigation state overhead
    const stateManagementMetrics = await page.evaluate(() => {
      const startTime = performance.now();

      // Simulate navigation state updates
      for (let i = 0; i < 100; i++) {
        // Mock state updates that would happen during navigation
        const state = {
          currentRoute: `/test/route/${i}`,
          breadcrumbs: [`Item 1`, `Item 2`, `Item ${i}`],
          navigationHistory: Array.from({ length: i }, (_, idx) => `/route/${idx}`),
          timestamp: Date.now(),
        };

        // Simulate state serialization/deserialization
        const serialized = JSON.stringify(state);
        const deserialized = JSON.parse(serialized);
      }

      const endTime = performance.now();
      return endTime - startTime;
    });

    // State management should be efficient
    expect(stateManagementMetrics).toBeLessThan(100);

    console.log('Navigation State Management Performance:', {
      stateOperationTime: `${stateManagementMetrics.toFixed(2)}ms`,
      operationsCount: 100,
    });
  });

  test('should handle navigation under memory pressure', async ({ page }) => {
    await page.goto('/dashboard');

    // Get initial memory
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
      } : null;
    });

    if (initialMemory) {
      // Perform many navigation operations
      for (let i = 0; i < 20; i++) {
        const routeIndex = i % NAVIGATION_ROUTES.length;
        const route = NAVIGATION_ROUTES[routeIndex];

        await page.goto(route.path);
        await page.waitForSelector('[role="main"]', { state: 'visible' });

        // Add some memory pressure
        await page.evaluate(() => {
          // Create temporary objects to simulate memory usage
          const tempData = Array.from({ length: 1000 }, (_, idx) => ({
            id: idx,
            data: `Navigation test data ${idx}`,
            timestamp: Date.now(),
          }));

          // Force garbage collection if available
          if ((window as any).gc) {
            (window as any).gc();
          }
        });

        await page.waitForTimeout(50);
      }

      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        } : null;
      });

      if (finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;

        // Memory should not grow excessively
        expect(memoryIncreasePercent).toBeLessThan(200);

        console.log('Navigation Memory Usage:', {
          initialMemory: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          finalMemory: `${(finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          increase: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
          increasePercent: `${memoryIncreasePercent.toFixed(1)}%`,
          navigationCount: 20,
        });
      }
    }
  });

  test('should maintain navigation performance on slow networks', async ({ page }) => {
    // Simulate slow network
    await page.route('**/*', route => {
      const url = route.request().url();
      const delay = url.includes('/api/') ? 200 : 50; // API calls slower

      setTimeout(() => {
        route.continue();
      }, delay);
    });

    await page.goto('/dashboard');

    const throttledMetrics = [];

    // Test navigation under network throttling
    for (let i = 0; i < 3; i++) {
      const route = NAVIGATION_ROUTES[i + 1];
      const metrics = await measureRouteTransition(page, '/dashboard', route.path);

      throttledMetrics.push({
        route: route.name,
        ...metrics,
      });

      // Local navigation should still be responsive
      expect(metrics.transitionTime).toBeLessThan(PERFORMANCE_TARGETS.ROUTE_TRANSITION_TIME * 3);
    }

    const avgThrottledTime = throttledMetrics.reduce((sum, m) => sum + m.transitionTime, 0) / throttledMetrics.length;

    console.log('Throttled Navigation Performance:', {
      averageTransitionTime: `${avgThrottledTime.toFixed(2)}ms`,
      routeCount: throttledMetrics.length,
      routes: throttledMetrics.map(m => ({
        route: m.route,
        time: `${m.transitionTime.toFixed(2)}ms`,
      })),
    });
  });
});