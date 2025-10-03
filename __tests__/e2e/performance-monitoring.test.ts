import { test, expect, Page, Browser } from '@playwright/test';
import { chromium, firefox, webkit } from '@playwright/test';

// Performance monitoring utilities
const PerformanceMonitor = {
  // Core Web Vitals
  measureLCP: async (page: Page) => {
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lcpEntry = entries[entries.length - 1];
          resolve({
            value: lcpEntry.startTime,
            element: lcpEntry.element?.tagName || 'unknown',
            url: lcpEntry.url || window.location.href
          });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
    });
  },

  measureFID: async (page: Page) => {
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const fidEntry = entries[0];
          resolve({
            value: fidEntry.processingStart - fidEntry.startTime,
            name: fidEntry.name,
            target: fidEntry.target?.tagName || 'unknown'
          });
        }).observe({ type: 'first-input', buffered: true });
      });
    });
  },

  measureCLS: async (page: Page) => {
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        let clsValue = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          resolve({ value: clsValue });
        }).observe({ type: 'layout-shift', buffered: true });

        setTimeout(() => resolve({ value: clsValue }), 5000);
      });
    });
  },

  measureTTFB: async (page: Page) => {
    return await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        value: navigation.responseStart - navigation.requestStart,
        totalTime: navigation.loadEventEnd - navigation.navigationStart
      };
    });
  },

  measureResourceTiming: async (page: Page) => {
    return await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      return resources.map(resource => ({
        name: resource.name,
        duration: resource.duration,
        size: (resource as any).transferSize || 0,
        type: resource.initiatorType
      }));
    });
  },

  measureJavaScriptExecution: async (page: Page) => {
    return await page.evaluate(() => {
      const measures = performance.getEntriesByType('measure');
      const userTimings = performance.getEntriesByType('mark');
      return {
        measures: measures.map(m => ({ name: m.name, duration: m.duration })),
        marks: userTimings.map(m => ({ name: m.name, startTime: m.startTime }))
      };
    });
  }
};

// E2E Test utilities
const E2ETestHelper = {
  // Authentication
  login: async (page: Page, email: string = 'test@example.com', password: string = 'password123') => {
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', email);
    await page.fill('[data-testid="password-input"]', password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  },

  // Navigation
  navigateToChatbots: async (page: Page) => {
    await page.click('[data-testid="chatbots-nav"]');
    await page.waitForURL('/dashboard/chatbots');
  },

  navigateToPlayground: async (page: Page, chatbotId: string) => {
    await page.goto(`/dashboard/chatbots/${chatbotId}/playground`);
    await page.waitForLoadState('networkidle');
  },

  // Chatbot creation
  createTestChatbot: async (page: Page, name: string = 'E2E Test Chatbot') => {
    await page.click('[data-testid="create-chatbot-button"]');
    await page.fill('[data-testid="chatbot-name-input"]', name);
    await page.fill('[data-testid="chatbot-description-input"]', 'E2E test chatbot for performance monitoring');
    await page.click('[data-testid="create-submit-button"]');
    await page.waitForURL(/\/dashboard\/chatbots\/.*$/);
    return page.url().split('/').pop(); // Extract chatbot ID
  },

  // Chat interaction
  sendChatMessage: async (page: Page, message: string) => {
    await page.fill('[data-testid="chat-input"]', message);
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="bot-response"]', { timeout: 10000 });
  },

  // Performance measurement
  measurePageLoad: async (page: Page, url: string) => {
    const startTime = Date.now();
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();
    return endTime - startTime;
  },

  // Network monitoring
  monitorNetworkRequests: async (page: Page) => {
    const requests: any[] = [];
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now()
      });
    });

    const responses: any[] = [];
    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        timing: response.timing(),
        size: response.headers()['content-length'] || 0
      });
    });

    return { requests, responses };
  }
};

test.describe('Performance Monitoring E2E Tests', () => {
  let browser: Browser;
  let context: any;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: 'test-results/videos/' }
    });
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test.describe('Core Web Vitals Monitoring', () => {
    test('should meet Core Web Vitals thresholds on dashboard', async () => {
      await E2ETestHelper.login(page);

      // Measure LCP (Largest Contentful Paint) - should be < 2.5s
      const lcp = await PerformanceMonitor.measureLCP(page);
      expect(lcp.value).toBeLessThan(2500);

      // Measure CLS (Cumulative Layout Shift) - should be < 0.1
      const cls = await PerformanceMonitor.measureCLS(page);
      expect(cls.value).toBeLessThan(0.1);

      // Measure TTFB (Time to First Byte) - should be < 800ms
      const ttfb = await PerformanceMonitor.measureTTFB(page);
      expect(ttfb.value).toBeLessThan(800);

      console.log('Core Web Vitals:', { lcp: lcp.value, cls: cls.value, ttfb: ttfb.value });
    });

    test('should maintain performance standards on chatbot playground', async () => {
      await E2ETestHelper.login(page);
      await E2ETestHelper.navigateToChatbots(page);

      const chatbotId = await E2ETestHelper.createTestChatbot(page);
      await E2ETestHelper.navigateToPlayground(page, chatbotId);

      // Measure performance on interactive page
      const lcp = await PerformanceMonitor.measureLCP(page);
      const cls = await PerformanceMonitor.measureCLS(page);

      expect(lcp.value).toBeLessThan(3000); // Slightly higher threshold for interactive pages
      expect(cls.value).toBeLessThan(0.1);

      // Test interaction performance
      const startTime = Date.now();
      await E2ETestHelper.sendChatMessage(page, 'Hello, this is a performance test message');
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(5000); // Chat response should be under 5 seconds

      console.log('Playground Performance:', { lcp: lcp.value, cls: cls.value, responseTime });
    });

    test('should handle FID (First Input Delay) efficiently', async () => {
      await E2ETestHelper.login(page);

      // Simulate user interaction immediately after page load
      await page.click('[data-testid="chatbots-nav"]');

      const fid = await PerformanceMonitor.measureFID(page);
      expect(fid.value).toBeLessThan(100); // FID should be < 100ms

      console.log('First Input Delay:', fid.value);
    });
  });

  test.describe('Resource Loading Performance', () => {
    test('should load resources efficiently', async () => {
      const networkMonitor = await E2ETestHelper.monitorNetworkRequests(page);

      await E2ETestHelper.login(page);
      await page.waitForTimeout(2000); // Allow all resources to load

      const resources = await PerformanceMonitor.measureResourceTiming(page);

      // Check critical resources
      const jsResources = resources.filter(r => r.name.includes('.js'));
      const cssResources = resources.filter(r => r.name.includes('.css'));
      const imageResources = resources.filter(r => r.type === 'img');

      // JavaScript resources should load quickly
      jsResources.forEach(resource => {
        expect(resource.duration).toBeLessThan(2000);
      });

      // CSS resources should load very quickly
      cssResources.forEach(resource => {
        expect(resource.duration).toBeLessThan(1000);
      });

      // Images should be optimized
      imageResources.forEach(resource => {
        expect(resource.size).toBeLessThan(500000); // Max 500KB per image
      });

      console.log('Resource Performance:', {
        jsCount: jsResources.length,
        cssCount: cssResources.length,
        imageCount: imageResources.length,
        totalResources: resources.length
      });
    });

    test('should optimize bundle sizes', async () => {
      await page.goto('/dashboard');

      const resources = await PerformanceMonitor.measureResourceTiming(page);
      const mainBundle = resources.find(r => r.name.includes('main') && r.name.includes('.js'));
      const vendorBundle = resources.find(r => r.name.includes('vendor') && r.name.includes('.js'));

      if (mainBundle) {
        expect(mainBundle.size).toBeLessThan(1000000); // Main bundle < 1MB
      }

      if (vendorBundle) {
        expect(vendorBundle.size).toBeLessThan(2000000); // Vendor bundle < 2MB
      }

      // Total JavaScript size should be reasonable
      const totalJSSize = resources
        .filter(r => r.name.includes('.js'))
        .reduce((total, resource) => total + resource.size, 0);

      expect(totalJSSize).toBeLessThan(3000000); // Total JS < 3MB

      console.log('Bundle Sizes:', { mainBundle: mainBundle?.size, vendorBundle: vendorBundle?.size, totalJS: totalJSSize });
    });
  });

  test.describe('Chat Performance', () => {
    test('should handle real-time chat interactions efficiently', async () => {
      await E2ETestHelper.login(page);
      await E2ETestHelper.navigateToChatbots(page);

      const chatbotId = await E2ETestHelper.createTestChatbot(page);
      await E2ETestHelper.navigateToPlayground(page, chatbotId);

      // Test multiple rapid messages
      const messages = [
        'Hello, how are you?',
        'Can you help me with my account?',
        'What are your capabilities?',
        'Thank you for your help!'
      ];

      const responseTimes: number[] = [];

      for (const message of messages) {
        const startTime = Date.now();
        await E2ETestHelper.sendChatMessage(page, message);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);

        // Each response should be reasonably fast
        expect(responseTime).toBeLessThan(8000);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      expect(averageResponseTime).toBeLessThan(5000);

      console.log('Chat Performance:', { responseTimes, average: averageResponseTime });
    });

    test('should handle typing indicators without performance degradation', async () => {
      await E2ETestHelper.login(page);
      await E2ETestHelper.navigateToChatbots(page);

      const chatbotId = await E2ETestHelper.createTestChatbot(page);
      await E2ETestHelper.navigateToPlayground(page, chatbotId);

      // Test typing indicator performance
      const chatInput = page.locator('[data-testid="chat-input"]');

      const startTime = Date.now();
      await chatInput.fill('This is a test message for typing indicators');

      // Wait for typing indicator
      await page.waitForSelector('[data-testid="typing-indicator"]', { timeout: 2000 });
      const typingIndicatorTime = Date.now() - startTime;

      expect(typingIndicatorTime).toBeLessThan(500); // Typing indicator should appear quickly

      // Clear input and verify indicator disappears
      await chatInput.clear();
      await page.waitForSelector('[data-testid="typing-indicator"]', { state: 'hidden', timeout: 3000 });

      console.log('Typing Indicator Performance:', typingIndicatorTime);
    });

    test('should maintain performance with chat history loading', async () => {
      await E2ETestHelper.login(page);
      await E2ETestHelper.navigateToChatbots(page);

      const chatbotId = await E2ETestHelper.createTestChatbot(page);
      await E2ETestHelper.navigateToPlayground(page, chatbotId);

      // Send multiple messages to create history
      for (let i = 1; i <= 10; i++) {
        await E2ETestHelper.sendChatMessage(page, `Test message ${i}`);
      }

      // Navigate away and back to test history loading
      await page.goto('/dashboard');
      const historyLoadStart = Date.now();
      await E2ETestHelper.navigateToPlayground(page, chatbotId);
      const historyLoadTime = Date.now() - historyLoadStart;

      expect(historyLoadTime).toBeLessThan(3000); // History should load quickly

      // Verify all messages are present
      const messageCount = await page.locator('[data-testid="chat-message"]').count();
      expect(messageCount).toBeGreaterThanOrEqual(20); // 10 user + 10 bot messages

      console.log('Chat History Performance:', { loadTime: historyLoadTime, messageCount });
    });
  });

  test.describe('Mobile Performance', () => {
    test('should maintain performance on mobile devices', async () => {
      // Test on mobile viewport
      await context.close();
      context = await browser.newContext({
        viewport: { width: 375, height: 667 }, // iPhone dimensions
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
      });
      page = await context.newPage();

      await E2ETestHelper.login(page);

      const lcp = await PerformanceMonitor.measureLCP(page);
      const cls = await PerformanceMonitor.measureCLS(page);
      const ttfb = await PerformanceMonitor.measureTTFB(page);

      // Mobile thresholds can be slightly more lenient
      expect(lcp.value).toBeLessThan(4000);
      expect(cls.value).toBeLessThan(0.1);
      expect(ttfb.value).toBeLessThan(1000);

      console.log('Mobile Performance:', { lcp: lcp.value, cls: cls.value, ttfb: ttfb.value });
    });

    test('should handle touch interactions efficiently on mobile', async () => {
      await context.close();
      context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        hasTouch: true
      });
      page = await context.newPage();

      await E2ETestHelper.login(page);
      await E2ETestHelper.navigateToChatbots(page);

      // Test touch interactions
      const startTime = Date.now();
      await page.tap('[data-testid="create-chatbot-button"]');
      const touchResponseTime = Date.now() - startTime;

      expect(touchResponseTime).toBeLessThan(300); // Touch should be responsive

      console.log('Touch Response Time:', touchResponseTime);
    });
  });

  test.describe('Network Performance', () => {
    test('should handle slow network conditions gracefully', async () => {
      // Simulate slow 3G connection
      await context.close();
      context = await browser.newContext({
        offline: false,
        // Simulate slow connection
        httpCredentials: undefined
      });
      page = await context.newPage();

      // Throttle network in page context
      const client = await page.context().newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 500 * 1024, // 500 KB/s
        uploadThroughput: 250 * 1024,   // 250 KB/s
        latency: 300 // 300ms latency
      });

      const loadStart = Date.now();
      await E2ETestHelper.login(page);
      const loadTime = Date.now() - loadStart;

      // Should still load within reasonable time on slow connection
      expect(loadTime).toBeLessThan(15000); // 15 seconds max on slow connection

      console.log('Slow Network Performance:', loadTime);
    });

    test('should implement effective caching strategies', async () => {
      // First visit
      await E2ETestHelper.login(page);
      const firstLoadResources = await PerformanceMonitor.measureResourceTiming(page);

      // Second visit (should benefit from caching)
      await page.reload();
      await page.waitForLoadState('networkidle');
      const secondLoadResources = await PerformanceMonitor.measureResourceTiming(page);

      // Compare load times
      const firstTotalTime = firstLoadResources.reduce((total, r) => total + r.duration, 0);
      const secondTotalTime = secondLoadResources.reduce((total, r) => total + r.duration, 0);

      // Second load should be faster due to caching
      expect(secondTotalTime).toBeLessThan(firstTotalTime);

      console.log('Caching Performance:', {
        firstLoad: firstTotalTime,
        secondLoad: secondTotalTime,
        improvement: ((firstTotalTime - secondTotalTime) / firstTotalTime * 100).toFixed(2) + '%'
      });
    });
  });

  test.describe('Error Handling Performance', () => {
    test('should handle 404 errors gracefully without performance impact', async () => {
      const startTime = Date.now();

      // Try to access non-existent page
      const response = await page.goto('/dashboard/chatbots/non-existent-id');
      expect(response?.status()).toBe(404);

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000); // Error pages should load quickly

      // Verify error page loads properly
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();

      console.log('404 Error Performance:', loadTime);
    });

    test('should recover from network errors efficiently', async () => {
      await E2ETestHelper.login(page);

      // Simulate network failure
      await context.setOffline(true);

      // Try to navigate (should fail)
      await page.click('[data-testid="chatbots-nav"]');

      // Verify offline indicator or error message
      await expect(page.locator('[data-testid="offline-indicator"], [data-testid="network-error"]')).toBeVisible({ timeout: 5000 });

      // Restore network
      await context.setOffline(false);

      // Verify recovery
      const recoveryStart = Date.now();
      await page.reload();
      await page.waitForLoadState('networkidle');
      const recoveryTime = Date.now() - recoveryStart;

      expect(recoveryTime).toBeLessThan(5000); // Should recover quickly

      console.log('Network Recovery Performance:', recoveryTime);
    });
  });

  test.describe('Cross-Browser Performance', () => {
    test('should maintain performance consistency across browsers', async () => {
      const browsers = [chromium, firefox, webkit];
      const results: any[] = [];

      for (const browserType of browsers) {
        const testBrowser = await browserType.launch({ headless: true });
        const testContext = await testBrowser.newContext();
        const testPage = await testContext.newPage();

        try {
          const startTime = Date.now();
          await testPage.goto('/auth/login');
          await testPage.waitForLoadState('networkidle');
          const loadTime = Date.now() - startTime;

          const lcp = await PerformanceMonitor.measureLCP(testPage);
          const ttfb = await PerformanceMonitor.measureTTFB(testPage);

          results.push({
            browser: browserType.name(),
            loadTime,
            lcp: lcp.value,
            ttfb: ttfb.value
          });

          // Each browser should meet performance thresholds
          expect(loadTime).toBeLessThan(5000);
          expect(lcp.value).toBeLessThan(3000);
          expect(ttfb.value).toBeLessThan(1000);

        } finally {
          await testContext.close();
          await testBrowser.close();
        }
      }

      console.log('Cross-Browser Performance:', results);

      // Verify consistency (no browser should be significantly slower)
      const loadTimes = results.map(r => r.loadTime);
      const maxLoadTime = Math.max(...loadTimes);
      const minLoadTime = Math.min(...loadTimes);
      const variation = (maxLoadTime - minLoadTime) / minLoadTime;

      expect(variation).toBeLessThan(0.5); // Less than 50% variation between browsers
    });
  });

  test.describe('Memory and CPU Performance', () => {
    test('should maintain reasonable memory usage', async () => {
      await E2ETestHelper.login(page);

      // Get initial memory usage
      const initialMemory = await page.evaluate(() => {
        return (performance as any).memory ? {
          used: (performance as any).memory.usedJSHeapSize,
          total: (performance as any).memory.totalJSHeapSize,
          limit: (performance as any).memory.jsHeapSizeLimit
        } : null;
      });

      if (initialMemory) {
        // Navigate around the app
        await E2ETestHelper.navigateToChatbots(page);
        const chatbotId = await E2ETestHelper.createTestChatbot(page);
        await E2ETestHelper.navigateToPlayground(page, chatbotId);

        // Send multiple messages to create activity
        for (let i = 0; i < 5; i++) {
          await E2ETestHelper.sendChatMessage(page, `Memory test message ${i}`);
        }

        // Check memory usage after activity
        const finalMemory = await page.evaluate(() => {
          return {
            used: (performance as any).memory.usedJSHeapSize,
            total: (performance as any).memory.totalJSHeapSize,
            limit: (performance as any).memory.jsHeapSizeLimit
          };
        });

        const memoryIncrease = finalMemory.used - initialMemory.used;
        const memoryUsageRatio = finalMemory.used / finalMemory.limit;

        // Memory usage should be reasonable
        expect(memoryUsageRatio).toBeLessThan(0.5); // Less than 50% of available memory
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase

        console.log('Memory Usage:', {
          initial: initialMemory.used,
          final: finalMemory.used,
          increase: memoryIncrease,
          usageRatio: memoryUsageRatio
        });
      }
    });

    test('should handle long-running sessions without memory leaks', async () => {
      await E2ETestHelper.login(page);
      await E2ETestHelper.navigateToChatbots(page);

      const chatbotId = await E2ETestHelper.createTestChatbot(page);
      await E2ETestHelper.navigateToPlayground(page, chatbotId);

      const memorySnapshots: any[] = [];

      // Simulate long-running session
      for (let i = 0; i < 20; i++) {
        await E2ETestHelper.sendChatMessage(page, `Long session message ${i}`);

        // Take memory snapshot every 5 messages
        if (i % 5 === 0) {
          const memory = await page.evaluate(() => {
            return (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
          });
          memorySnapshots.push({ iteration: i, memory });
        }
      }

      // Check for memory leaks (memory should not continuously increase)
      if (memorySnapshots.length > 2) {
        const firstMemory = memorySnapshots[0].memory;
        const lastMemory = memorySnapshots[memorySnapshots.length - 1].memory;
        const memoryGrowthRatio = (lastMemory - firstMemory) / firstMemory;

        // Memory growth should be reasonable (less than 100% increase)
        expect(memoryGrowthRatio).toBeLessThan(1.0);

        console.log('Memory Leak Test:', { snapshots: memorySnapshots, growthRatio: memoryGrowthRatio });
      }
    });
  });
});

test.describe('Performance Regression Tests', () => {
  test('should not regress from baseline performance metrics', async () => {
    // Baseline performance metrics (these would be updated over time)
    const baselines = {
      dashboardLoadTime: 2000,
      chatResponseTime: 3000,
      lcp: 2500,
      cls: 0.1,
      ttfb: 800
    };

    const context = await chromium.launch({ headless: true }).then(b => b.newContext());
    const page = await context.newPage();

    try {
      // Test dashboard load time
      const dashboardStart = Date.now();
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      const dashboardLoadTime = Date.now() - dashboardStart;

      // Test Core Web Vitals
      const lcp = await PerformanceMonitor.measureLCP(page);
      const cls = await PerformanceMonitor.measureCLS(page);
      const ttfb = await PerformanceMonitor.measureTTFB(page);

      // Compare against baselines
      expect(dashboardLoadTime).toBeLessThanOrEqual(baselines.dashboardLoadTime * 1.1); // 10% tolerance
      expect(lcp.value).toBeLessThanOrEqual(baselines.lcp * 1.1);
      expect(cls.value).toBeLessThanOrEqual(baselines.cls * 1.2); // 20% tolerance for CLS
      expect(ttfb.value).toBeLessThanOrEqual(baselines.ttfb * 1.1);

      console.log('Performance Regression Test Results:', {
        dashboardLoadTime: `${dashboardLoadTime}ms (baseline: ${baselines.dashboardLoadTime}ms)`,
        lcp: `${lcp.value}ms (baseline: ${baselines.lcp}ms)`,
        cls: `${cls.value} (baseline: ${baselines.cls})`,
        ttfb: `${ttfb.value}ms (baseline: ${baselines.ttfb}ms)`
      });

    } finally {
      await context.close();
    }
  });
});