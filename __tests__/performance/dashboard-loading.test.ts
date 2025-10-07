import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

// Performance targets
const PERFORMANCE_TARGETS = {
  DASHBOARD_LOAD_TIME: 500, // ms
  FIRST_CONTENTFUL_PAINT: 300, // ms
  LARGEST_CONTENTFUL_PAINT: 400, // ms
  TIME_TO_INTERACTIVE: 600, // ms
  CUMULATIVE_LAYOUT_SHIFT: 0.1,
  FIRST_INPUT_DELAY: 100, // ms
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

async function measurePageLoadPerformance(page: Page, url: string) {
  // Clear any existing performance entries
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  const startTime = Date.now();

  // Start performance measurement
  await page.evaluate(() => {
    performance.mark('navigation-start');
  });

  // Navigate to the page
  await page.goto(url);

  // Wait for main content to be visible
  await page.waitForSelector('[role="main"]', { state: 'visible' });

  // Mark when main content is loaded
  await page.evaluate(() => {
    performance.mark('main-content-loaded');
  });

  // Wait for all loading indicators to disappear
  await page.waitForFunction(() => {
    const loadingElements = document.querySelectorAll('[data-testid$="-loading"], [data-testid$="-skeleton"]');
    return Array.from(loadingElements).every(el => !el.isConnected || getComputedStyle(el).display === 'none');
  }, { timeout: 10000 });

  // Mark when all content is fully loaded
  await page.evaluate(() => {
    performance.mark('content-fully-loaded');
  });

  const endTime = Date.now();

  // Get performance metrics
  const metrics = await page.evaluate(() => {
    // Create performance measures
    performance.measure('page-load-time', 'navigation-start', 'content-fully-loaded');
    performance.measure('main-content-time', 'navigation-start', 'main-content-loaded');

    const pageLoadTime = performance.getEntriesByName('page-load-time')[0]?.duration || 0;
    const mainContentTime = performance.getEntriesByName('main-content-time')[0]?.duration || 0;

    // Get Web Vitals if available
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType('paint');

    const firstContentfulPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint')?.startTime || 0;
    const largestContentfulPaint = paintEntries.find(entry => entry.name === 'largest-contentful-paint')?.startTime || 0;

    return {
      pageLoadTime,
      mainContentTime,
      firstContentfulPaint,
      largestContentfulPaint,
      domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart || 0,
      loadComplete: navigation?.loadEventEnd - navigation?.loadEventStart || 0,
      ttfb: navigation?.responseStart - navigation?.requestStart || 0,
    };
  });

  return {
    ...metrics,
    totalTime: endTime - startTime,
  };
}

async function measureResourceLoadTimes(page: Page) {
  return await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    const resourceMetrics = {
      totalResources: resources.length,
      jsFiles: resources.filter(r => r.name.includes('.js')).length,
      cssFiles: resources.filter(r => r.name.includes('.css')).length,
      images: resources.filter(r => r.name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)).length,
      apiCalls: resources.filter(r => r.name.includes('/api/')).length,
      slowestResource: Math.max(...resources.map(r => r.duration)),
      averageResourceTime: resources.reduce((sum, r) => sum + r.duration, 0) / resources.length,
      cacheHitRate: resources.filter(r => r.transferSize === 0).length / resources.length,
    };

    // Group resources by type for detailed analysis
    const resourcesByType = {
      scripts: resources.filter(r => r.name.includes('.js')).map(r => ({
        name: r.name.split('/').pop(),
        duration: r.duration,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
      })),
      stylesheets: resources.filter(r => r.name.includes('.css')).map(r => ({
        name: r.name.split('/').pop(),
        duration: r.duration,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
      })),
      apiCalls: resources.filter(r => r.name.includes('/api/')).map(r => ({
        name: r.name.split('/api/').pop(),
        duration: r.duration,
        transferSize: r.transferSize,
      })),
    };

    return { resourceMetrics, resourcesByType };
  });
}

test.describe('Dashboard Loading Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load dashboard within performance targets', async ({ page }) => {
    const metrics = await measurePageLoadPerformance(page, '/dashboard');

    // Verify performance targets
    expect(metrics.totalTime).toBeLessThan(PERFORMANCE_TARGETS.DASHBOARD_LOAD_TIME);
    expect(metrics.mainContentTime).toBeLessThan(PERFORMANCE_TARGETS.FIRST_CONTENTFUL_PAINT);
    expect(metrics.pageLoadTime).toBeLessThan(PERFORMANCE_TARGETS.DASHBOARD_LOAD_TIME);

    if (metrics.firstContentfulPaint > 0) {
      expect(metrics.firstContentfulPaint).toBeLessThan(PERFORMANCE_TARGETS.FIRST_CONTENTFUL_PAINT);
    }

    if (metrics.largestContentfulPaint > 0) {
      expect(metrics.largestContentfulPaint).toBeLessThan(PERFORMANCE_TARGETS.LARGEST_CONTENTFUL_PAINT);
    }

    // Log performance metrics for analysis
    console.log('Dashboard Load Performance:', {
      totalTime: `${metrics.totalTime}ms`,
      pageLoadTime: `${metrics.pageLoadTime}ms`,
      mainContentTime: `${metrics.mainContentTime}ms`,
      firstContentfulPaint: `${metrics.firstContentfulPaint}ms`,
      largestContentfulPaint: `${metrics.largestContentfulPaint}ms`,
      domContentLoaded: `${metrics.domContentLoaded}ms`,
      ttfb: `${metrics.ttfb}ms`,
    });
  });

  test('should load analytics dashboard with real-time data efficiently', async ({ page }) => {
    const metrics = await measurePageLoadPerformance(page, '/dashboard/analytics');

    // Analytics page should load within reasonable time
    expect(metrics.totalTime).toBeLessThan(PERFORMANCE_TARGETS.DASHBOARD_LOAD_TIME * 1.2);

    // Verify charts and graphs load efficiently
    await page.waitForSelector('[data-testid$="-chart"], [data-testid$="-graph"]', { state: 'visible' });

    const chartLoadTime = await page.evaluate(() => {
      performance.mark('charts-loaded');
      performance.measure('chart-load-time', 'navigation-start', 'charts-loaded');
      return performance.getEntriesByName('chart-load-time')[0]?.duration || 0;
    });

    expect(chartLoadTime).toBeLessThan(800); // Charts should load within 800ms

    console.log('Analytics Dashboard Performance:', {
      totalTime: `${metrics.totalTime}ms`,
      chartLoadTime: `${chartLoadTime}ms`,
    });
  });

  test('should handle dashboard refresh performance', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('[role="main"]', { state: 'visible' });

    // Measure refresh performance
    const refreshStartTime = Date.now();

    await page.click('[data-testid="refresh-dashboard-button"]');

    // Wait for refresh to complete
    await page.waitForFunction(() => {
      const refreshingIndicator = document.querySelector('[data-testid="dashboard-refreshing"]');
      return !refreshingIndicator || getComputedStyle(refreshingIndicator).display === 'none';
    });

    const refreshEndTime = Date.now();
    const refreshTime = refreshEndTime - refreshStartTime;

    // Refresh should be fast
    expect(refreshTime).toBeLessThan(300);

    console.log('Dashboard Refresh Performance:', {
      refreshTime: `${refreshTime}ms`,
    });
  });

  test('should optimize resource loading for dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const { resourceMetrics, resourcesByType } = await measureResourceLoadTimes(page);

    // Verify resource optimization
    expect(resourceMetrics.slowestResource).toBeLessThan(2000); // No resource should take more than 2s
    expect(resourceMetrics.averageResourceTime).toBeLessThan(200); // Average load time should be under 200ms
    expect(resourceMetrics.cacheHitRate).toBeGreaterThan(0.3); // At least 30% cache hit rate

    // Verify reasonable number of resources
    expect(resourceMetrics.totalResources).toBeLessThan(50); // Shouldn't load too many resources

    // Check for efficient bundling
    expect(resourceMetrics.jsFiles).toBeLessThan(10); // JS should be bundled
    expect(resourceMetrics.cssFiles).toBeLessThan(5); // CSS should be bundled

    console.log('Resource Loading Metrics:', {
      totalResources: resourceMetrics.totalResources,
      jsFiles: resourceMetrics.jsFiles,
      cssFiles: resourceMetrics.cssFiles,
      apiCalls: resourceMetrics.apiCalls,
      slowestResource: `${resourceMetrics.slowestResource.toFixed(2)}ms`,
      averageResourceTime: `${resourceMetrics.averageResourceTime.toFixed(2)}ms`,
      cacheHitRate: `${(resourceMetrics.cacheHitRate * 100).toFixed(1)}%`,
    });

    // Log slow resources for optimization
    const slowScripts = resourcesByType.scripts.filter(r => r.duration > 500);
    const slowStylesheets = resourcesByType.stylesheets.filter(r => r.duration > 300);
    const slowApiCalls = resourcesByType.apiCalls.filter(r => r.duration > 1000);

    if (slowScripts.length > 0) {
      console.log('Slow JavaScript files:', slowScripts);
    }
    if (slowStylesheets.length > 0) {
      console.log('Slow CSS files:', slowStylesheets);
    }
    if (slowApiCalls.length > 0) {
      console.log('Slow API calls:', slowApiCalls);
    }
  });

  test('should handle concurrent dashboard operations efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('[role="main"]', { state: 'visible' });

    const startTime = Date.now();

    // Start multiple operations simultaneously
    const operations = [
      page.click('[data-testid="refresh-dashboard-button"]'),
      page.click('[data-testid="view-analytics-button"]'),
      page.evaluate(() => {
        // Simulate data fetch
        return fetch('/api/dashboard/metrics').catch(() => {});
      }),
    ];

    await Promise.all(operations);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Concurrent operations should complete efficiently
    expect(totalTime).toBeLessThan(1500);

    console.log('Concurrent Operations Performance:', {
      totalTime: `${totalTime}ms`,
    });
  });

  test('should maintain performance with large datasets', async ({ page }) => {
    // Mock large dataset
    await page.route('**/api/dashboard/metrics', route => {
      const largeDataset = {
        analytics: {
          totalConversations: 150000,
          activeUsers: 25000,
          averageResponseTime: '1.2s',
          satisfactionScore: 4.7,
          dailyStats: Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
            conversations: Math.floor(Math.random() * 1000) + 500,
            users: Math.floor(Math.random() * 200) + 100,
          })),
        },
        activities: Array.from({ length: 100 }, (_, i) => ({
          id: `activity_${i}`,
          type: 'conversation',
          message: `Activity ${i}`,
          timestamp: Date.now() - i * 60000,
        })),
        chatbots: Array.from({ length: 50 }, (_, i) => ({
          id: `bot_${i}`,
          name: `Chatbot ${i}`,
          status: i % 3 === 0 ? 'active' : 'idle',
          conversations: Math.floor(Math.random() * 100),
        })),
      };

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(largeDataset),
      });
    });

    const metrics = await measurePageLoadPerformance(page, '/dashboard');

    // Performance should not degrade significantly with large datasets
    expect(metrics.totalTime).toBeLessThan(PERFORMANCE_TARGETS.DASHBOARD_LOAD_TIME * 1.5);

    // Check if virtualization or pagination is working
    const activityItems = await page.locator('[data-testid="activity-item"]').count();
    expect(activityItems).toBeLessThan(25); // Should not render all 100 items at once

    console.log('Large Dataset Performance:', {
      totalTime: `${metrics.totalTime}ms`,
      renderedActivityItems: activityItems,
    });
  });

  test('should optimize memory usage during dashboard operation', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('[role="main"]', { state: 'visible' });

    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
      } : null;
    });

    if (initialMemory) {
      // Simulate extended usage
      for (let i = 0; i < 10; i++) {
        await page.click('[data-testid="refresh-dashboard-button"]');
        await page.waitForTimeout(100);

        // Navigate between sections
        if (i % 2 === 0) {
          await page.goto('/dashboard/analytics');
        } else {
          await page.goto('/dashboard');
        }
        await page.waitForSelector('[role="main"]', { state: 'visible' });
      }

      // Get final memory usage
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
        } : null;
      });

      if (finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;

        // Memory increase should be reasonable (less than 50% increase)
        expect(memoryIncreasePercent).toBeLessThan(50);

        console.log('Memory Usage Analysis:', {
          initialMemory: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          finalMemory: `${(finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          increase: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
          increasePercent: `${memoryIncreasePercent.toFixed(1)}%`,
        });
      }
    }
  });

  test('should handle dashboard loading under network throttling', async ({ page }) => {
    // Simulate slow 3G connection
    await page.route('**/*', route => {
      const url = route.request().url();

      // Add delay to simulate slow connection
      setTimeout(() => {
        route.continue();
      }, url.includes('/api/') ? 300 : 100); // API calls slower than static assets
    });

    const metrics = await measurePageLoadPerformance(page, '/dashboard');

    // Under throttled conditions, basic content should still load reasonably fast
    expect(metrics.mainContentTime).toBeLessThan(1500);
    expect(metrics.totalTime).toBeLessThan(3000);

    // Verify progressive loading works
    const skeletonElements = await page.locator('[data-testid$="-skeleton"]').count();
    expect(skeletonElements).toBeGreaterThan(0); // Should show loading skeletons

    console.log('Throttled Network Performance:', {
      totalTime: `${metrics.totalTime}ms`,
      mainContentTime: `${metrics.mainContentTime}ms`,
      skeletonElements,
    });
  });

  test('should measure and optimize Cumulative Layout Shift (CLS)', async ({ page }) => {
    await page.goto('/dashboard');

    // Measure layout stability
    const clsScore = await page.evaluate(() => {
      return new Promise<number>(resolve => {
        let cls = 0;

        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        });

        observer.observe({ entryTypes: ['layout-shift'] });

        // Measure for 3 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(cls);
        }, 3000);
      });
    });

    // CLS should be within acceptable range
    expect(clsScore).toBeLessThan(PERFORMANCE_TARGETS.CUMULATIVE_LAYOUT_SHIFT);

    console.log('Cumulative Layout Shift Score:', clsScore.toFixed(4));
  });
});