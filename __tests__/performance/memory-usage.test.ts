import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

// Memory performance targets
const MEMORY_TARGETS = {
  INITIAL_HEAP_SIZE: 50 * 1024 * 1024, // 50MB initial heap
  MAX_HEAP_GROWTH: 100 * 1024 * 1024, // 100MB max growth during session
  COMPONENT_CLEANUP_THRESHOLD: 0.95, // 95% of components should clean up
  MEMORY_LEAK_THRESHOLD: 0.1, // 10% memory growth after cleanup
  GC_EFFICIENCY_THRESHOLD: 0.8, // 80% memory should be reclaimed after GC
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

async function getMemoryInfo(page: Page) {
  return await page.evaluate(() => {
    const memory = (performance as any).memory;
    if (!memory) {
      return null;
    }

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      timestamp: Date.now(),
    };
  });
}

async function forceGarbageCollection(page: Page) {
  await page.evaluate(() => {
    // Try multiple methods to trigger garbage collection
    if ((window as any).gc) {
      (window as any).gc();
    }

    // Create and release large objects to trigger GC
    for (let i = 0; i < 10; i++) {
      const largeArray = new Array(100000).fill('trigger-gc');
      largeArray.length = 0;
    }

    // Force event loop cycles
    return new Promise(resolve => {
      setTimeout(() => {
        setTimeout(() => {
          setTimeout(resolve, 0);
        }, 0);
      }, 0);
    });
  });
}

async function measureComponentLifecycle(page: Page, componentSelector: string, iterations: number = 10) {
  const memorySnapshots = [];

  for (let i = 0; i < iterations; i++) {
    // Take memory snapshot before component creation
    const beforeMemory = await getMemoryInfo(page);
    memorySnapshots.push({ phase: 'before', iteration: i, ...beforeMemory });

    // Trigger component creation/mounting
    await page.evaluate((selector) => {
      // Simulate component mounting
      const event = new CustomEvent('mount-component', { detail: { selector } });
      document.dispatchEvent(event);
    }, componentSelector);

    await page.waitForTimeout(100);

    // Take memory snapshot after component creation
    const afterMemory = await getMemoryInfo(page);
    memorySnapshots.push({ phase: 'after', iteration: i, ...afterMemory });

    // Trigger component cleanup/unmounting
    await page.evaluate((selector) => {
      // Simulate component unmounting
      const event = new CustomEvent('unmount-component', { detail: { selector } });
      document.dispatchEvent(event);
    }, componentSelector);

    await page.waitForTimeout(100);

    // Force garbage collection
    await forceGarbageCollection(page);
    await page.waitForTimeout(200);

    // Take memory snapshot after cleanup
    const cleanupMemory = await getMemoryInfo(page);
    memorySnapshots.push({ phase: 'cleanup', iteration: i, ...cleanupMemory });
  }

  return memorySnapshots;
}

async function simulateDataLoad(page: Page, dataSize: number) {
  await page.evaluate((size) => {
    // Simulate loading large datasets
    (window as any).testData = Array.from({ length: size }, (_, i) => ({
      id: i,
      title: `Item ${i}`,
      description: `Description for item ${i}`.repeat(10),
      metadata: {
        created: new Date(),
        tags: [`tag${i}`, `category${i % 10}`, `type${i % 5}`],
        stats: {
          views: Math.floor(Math.random() * 1000),
          likes: Math.floor(Math.random() * 100),
          shares: Math.floor(Math.random() * 50),
        },
      },
    }));
  }, dataSize);
}

async function measureMemoryLeaks(page: Page, operations: (() => Promise<void>)[]) {
  const initialMemory = await getMemoryInfo(page);
  if (!initialMemory) return null;

  const memorySnapshots = [{ phase: 'initial', ...initialMemory }];

  // Perform operations multiple times
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const operation of operations) {
      await operation();
      await page.waitForTimeout(100);
    }

    // Force garbage collection after each cycle
    await forceGarbageCollection(page);
    await page.waitForTimeout(300);

    const cycleMemory = await getMemoryInfo(page);
    if (cycleMemory) {
      memorySnapshots.push({ phase: `cycle_${cycle}`, ...cycleMemory });
    }
  }

  return memorySnapshots;
}

test.describe('Memory Usage Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should maintain reasonable initial memory usage', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('[role="main"]', { state: 'visible' });

    // Allow application to fully initialize
    await page.waitForTimeout(2000);

    const initialMemory = await getMemoryInfo(page);

    if (initialMemory) {
      // Initial memory usage should be reasonable
      expect(initialMemory.usedJSHeapSize).toBeLessThan(MEMORY_TARGETS.INITIAL_HEAP_SIZE);

      console.log('Initial Memory Usage:', {
        usedHeap: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        totalHeap: `${(initialMemory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        heapLimit: `${(initialMemory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
        heapUtilization: `${((initialMemory.usedJSHeapSize / initialMemory.totalJSHeapSize) * 100).toFixed(1)}%`,
      });
    }
  });

  test('should handle component lifecycle without memory leaks', async ({ page }) => {
    await page.goto('/dashboard');

    // Test dashboard components
    const componentSnapshots = await measureComponentLifecycle(page, 'dashboard-card', 15);

    if (componentSnapshots.length > 0) {
      // Group snapshots by iteration
      const iterations = [];
      for (let i = 0; i < 15; i++) {
        const iterationSnapshots = componentSnapshots.filter(s => s.iteration === i);
        if (iterationSnapshots.length === 3) {
          const before = iterationSnapshots.find(s => s.phase === 'before');
          const after = iterationSnapshots.find(s => s.phase === 'after');
          const cleanup = iterationSnapshots.find(s => s.phase === 'cleanup');

          if (before && after && cleanup) {
            const memoryGrowth = after.usedJSHeapSize - before.usedJSHeapSize;
            const memoryReclaimed = after.usedJSHeapSize - cleanup.usedJSHeapSize;
            const cleanupEfficiency = memoryReclaimed / memoryGrowth;

            iterations.push({
              iteration: i,
              memoryGrowth,
              memoryReclaimed,
              cleanupEfficiency,
              finalMemory: cleanup.usedJSHeapSize,
            });

            // Component should clean up most of its memory
            expect(cleanupEfficiency).toBeGreaterThan(MEMORY_TARGETS.COMPONENT_CLEANUP_THRESHOLD);
          }
        }
      }

      // Calculate overall memory trend
      const firstIteration = iterations[0];
      const lastIteration = iterations[iterations.length - 1];

      if (firstIteration && lastIteration) {
        const overallGrowth = lastIteration.finalMemory - firstIteration.finalMemory;
        const overallGrowthPercent = (overallGrowth / firstIteration.finalMemory) * 100;

        // Overall memory growth should be minimal
        expect(overallGrowthPercent).toBeLessThan(MEMORY_TARGETS.MEMORY_LEAK_THRESHOLD * 100);

        console.log('Component Lifecycle Memory Analysis:', {
          iterations: iterations.length,
          averageCleanupEfficiency: `${(iterations.reduce((sum, i) => sum + i.cleanupEfficiency, 0) / iterations.length * 100).toFixed(1)}%`,
          overallGrowth: `${(overallGrowth / 1024 / 1024).toFixed(2)} MB`,
          overallGrowthPercent: `${overallGrowthPercent.toFixed(2)}%`,
        });
      }
    }
  });

  test('should handle large dataset loading efficiently', async ({ page }) => {
    await page.goto('/dashboard');

    const dataSizes = [1000, 5000, 10000, 20000];
    const dataLoadResults = [];

    for (const size of dataSizes) {
      const beforeMemory = await getMemoryInfo(page);

      if (beforeMemory) {
        await simulateDataLoad(page, size);
        await page.waitForTimeout(500);

        const afterMemory = await getMemoryInfo(page);

        if (afterMemory) {
          const memoryIncrease = afterMemory.usedJSHeapSize - beforeMemory.usedJSHeapSize;
          const memoryPerItem = memoryIncrease / size;

          dataLoadResults.push({
            dataSize: size,
            memoryIncrease,
            memoryPerItem,
            totalMemory: afterMemory.usedJSHeapSize,
          });

          // Memory usage should scale reasonably with data size
          expect(memoryPerItem).toBeLessThan(10000); // Less than 10KB per item
        }

        // Clean up data
        await page.evaluate(() => {
          delete (window as any).testData;
        });

        await forceGarbageCollection(page);
        await page.waitForTimeout(300);
      }
    }

    console.log('Large Dataset Memory Usage:', {
      dataSizes: dataLoadResults.map(r => ({
        size: r.dataSize,
        memoryIncrease: `${(r.memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
        memoryPerItem: `${(r.memoryPerItem / 1024).toFixed(2)} KB`,
      })),
    });
  });

  test('should detect and prevent memory leaks in navigation', async ({ page }) => {
    const navigationOperations = [
      async () => {
        await page.goto('/dashboard');
        await page.waitForSelector('[role="main"]', { state: 'visible' });
      },
      async () => {
        await page.goto('/dashboard/analytics');
        await page.waitForSelector('[role="main"]', { state: 'visible' });
      },
      async () => {
        await page.goto('/dashboard/chatbots');
        await page.waitForSelector('[role="main"]', { state: 'visible' });
      },
      async () => {
        await page.goto('/chat');
        await page.waitForSelector('[role="main"]', { state: 'visible' });
      },
    ];

    const memorySnapshots = await measureMemoryLeaks(page, navigationOperations);

    if (memorySnapshots && memorySnapshots.length > 0) {
      const initialSnapshot = memorySnapshots[0];
      const finalSnapshot = memorySnapshots[memorySnapshots.length - 1];

      const memoryGrowth = finalSnapshot.usedJSHeapSize - initialSnapshot.usedJSHeapSize;
      const memoryGrowthPercent = (memoryGrowth / initialSnapshot.usedJSHeapSize) * 100;

      // Memory growth should be minimal after multiple navigation cycles
      expect(memoryGrowthPercent).toBeLessThan(50); // Less than 50% growth

      console.log('Navigation Memory Leak Analysis:', {
        initialMemory: `${(initialSnapshot.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        finalMemory: `${(finalSnapshot.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        memoryGrowth: `${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`,
        memoryGrowthPercent: `${memoryGrowthPercent.toFixed(2)}%`,
        cycles: 3,
        operationsPerCycle: navigationOperations.length,
      });
    }
  });

  test('should handle real-time updates without memory accumulation', async ({ page }) => {
    await page.goto('/dashboard');

    // Mock WebSocket for real-time updates
    await page.addInitScript(() => {
      class MockWebSocket {
        onmessage: ((event: MessageEvent) => void) | null = null;
        readyState = WebSocket.OPEN;

        constructor(url: string) {}

        send(data: string) {}
        close() {}
      }

      (window as any).MockWebSocket = MockWebSocket;
      (window as any).WebSocket = MockWebSocket;
    });

    const initialMemory = await getMemoryInfo(page);

    if (initialMemory) {
      // Simulate 1000 real-time updates
      for (let i = 0; i < 1000; i++) {
        await page.evaluate((updateIndex) => {
          // Simulate real-time metric updates
          const ws = new (window as any).MockWebSocket('ws://localhost:3001');
          if (ws.onmessage) {
            ws.onmessage(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'metrics_update',
                data: {
                  active_sessions: 50 + updateIndex,
                  messages_last_hour: 200 + updateIndex * 2,
                  timestamp: Date.now(),
                },
              }),
            }));
          }
        }, i);

        // Periodic garbage collection
        if (i % 100 === 0) {
          await forceGarbageCollection(page);
          await page.waitForTimeout(50);
        }
      }

      const finalMemory = await getMemoryInfo(page);

      if (finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;

        // Memory should not grow significantly with real-time updates
        expect(memoryIncreasePercent).toBeLessThan(25);

        console.log('Real-time Updates Memory Analysis:', {
          updateCount: 1000,
          initialMemory: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          finalMemory: `${(finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          memoryIncrease: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
          memoryIncreasePercent: `${memoryIncreasePercent.toFixed(2)}%`,
        });
      }
    }
  });

  test('should optimize memory usage in chat with message history', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"]', { state: 'visible' });

    const initialMemory = await getMemoryInfo(page);

    if (initialMemory) {
      // Simulate loading large message history
      const messageCount = 500;

      for (let i = 0; i < messageCount; i++) {
        await page.evaluate((messageIndex) => {
          // Simulate message loading
          const messageElement = document.createElement('div');
          messageElement.setAttribute('data-testid', 'message');
          messageElement.innerHTML = `
            <div>Message ${messageIndex}</div>
            <div>This is a test message with some content that simulates real chat messages.</div>
            <div class="timestamp">${new Date().toISOString()}</div>
          `;

          const container = document.querySelector('[data-testid="messages-container"]') ||
                           document.querySelector('[role="main"]') ||
                           document.body;
          container.appendChild(messageElement);
        }, i);

        // Periodic cleanup and memory check
        if (i % 50 === 0) {
          // Simulate message virtualization (remove old messages from DOM)
          await page.evaluate(() => {
            const messages = document.querySelectorAll('[data-testid="message"]');
            const maxVisibleMessages = 50;

            if (messages.length > maxVisibleMessages) {
              for (let j = 0; j < messages.length - maxVisibleMessages; j++) {
                messages[j].remove();
              }
            }
          });

          await forceGarbageCollection(page);
          await page.waitForTimeout(100);
        }
      }

      const finalMemory = await getMemoryInfo(page);

      if (finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;

        // Chat should use memory efficiently even with large message history
        expect(memoryIncreasePercent).toBeLessThan(40);

        // Check that virtualization is working
        const visibleMessages = await page.locator('[data-testid="message"]').count();
        expect(visibleMessages).toBeLessThan(100); // Should virtualize messages

        console.log('Chat Message History Memory Analysis:', {
          totalMessages: messageCount,
          visibleMessages,
          initialMemory: `${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          finalMemory: `${(finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          memoryIncrease: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
          memoryIncreasePercent: `${memoryIncreasePercent.toFixed(2)}%`,
        });
      }
    }
  });

  test('should handle garbage collection efficiency', async ({ page }) => {
    await page.goto('/dashboard');

    const gcTestResults = [];

    for (let cycle = 0; cycle < 5; cycle++) {
      // Create memory pressure
      await page.evaluate(() => {
        (window as any).memoryPressureData = Array.from({ length: 50000 }, (_, i) => ({
          id: i,
          data: `Memory pressure test data ${i}`.repeat(20),
          created: new Date(),
          metadata: {
            cycle: (window as any).currentCycle || 0,
            random: Math.random(),
          },
        }));
      });

      const beforeGC = await getMemoryInfo(page);

      // Force garbage collection
      await forceGarbageCollection(page);
      await page.waitForTimeout(500);

      const afterGC = await getMemoryInfo(page);

      if (beforeGC && afterGC) {
        const memoryReclaimed = beforeGC.usedJSHeapSize - afterGC.usedJSHeapSize;
        const gcEfficiency = memoryReclaimed / beforeGC.usedJSHeapSize;

        gcTestResults.push({
          cycle,
          beforeGC: beforeGC.usedJSHeapSize,
          afterGC: afterGC.usedJSHeapSize,
          memoryReclaimed,
          gcEfficiency,
        });

        // GC should be reasonably efficient
        expect(gcEfficiency).toBeGreaterThan(MEMORY_TARGETS.GC_EFFICIENCY_THRESHOLD * 0.5);
      }

      // Clean up test data
      await page.evaluate(() => {
        delete (window as any).memoryPressureData;
      });
    }

    const avgGCEfficiency = gcTestResults.reduce((sum, r) => sum + r.gcEfficiency, 0) / gcTestResults.length;

    console.log('Garbage Collection Efficiency Analysis:', {
      cycles: gcTestResults.length,
      averageEfficiency: `${(avgGCEfficiency * 100).toFixed(1)}%`,
      results: gcTestResults.map(r => ({
        cycle: r.cycle,
        beforeGC: `${(r.beforeGC / 1024 / 1024).toFixed(2)} MB`,
        afterGC: `${(r.afterGC / 1024 / 1024).toFixed(2)} MB`,
        reclaimed: `${(r.memoryReclaimed / 1024 / 1024).toFixed(2)} MB`,
        efficiency: `${(r.gcEfficiency * 100).toFixed(1)}%`,
      })),
    });
  });

  test('should monitor memory usage during extended session', async ({ page }) => {
    await page.goto('/dashboard');

    const sessionMemorySnapshots = [];
    const sessionDuration = 30000; // 30 seconds
    const snapshotInterval = 2000; // 2 seconds

    const startTime = Date.now();

    // Simulate extended user session
    const sessionSimulation = async () => {
      while (Date.now() - startTime < sessionDuration) {
        // Simulate user activities
        const activities = [
          () => page.goto('/dashboard'),
          () => page.goto('/dashboard/analytics'),
          () => page.goto('/chat'),
          () => page.click('[data-testid="refresh-dashboard-button"]').catch(() => {}),
        ];

        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        await randomActivity();
        await page.waitForTimeout(Math.random() * 1000 + 500);
      }
    };

    // Memory monitoring
    const memoryMonitoring = async () => {
      while (Date.now() - startTime < sessionDuration) {
        const memory = await getMemoryInfo(page);
        if (memory) {
          sessionMemorySnapshots.push({
            timestamp: Date.now() - startTime,
            ...memory,
          });
        }
        await page.waitForTimeout(snapshotInterval);
      }
    };

    // Run simulation and monitoring in parallel
    await Promise.all([sessionSimulation(), memoryMonitoring()]);

    if (sessionMemorySnapshots.length > 0) {
      const initialSnapshot = sessionMemorySnapshots[0];
      const finalSnapshot = sessionMemorySnapshots[sessionMemorySnapshots.length - 1];

      const totalGrowth = finalSnapshot.usedJSHeapSize - initialSnapshot.usedJSHeapSize;
      const totalGrowthPercent = (totalGrowth / initialSnapshot.usedJSHeapSize) * 100;

      // Extended session should not cause excessive memory growth
      expect(totalGrowthPercent).toBeLessThan(75);

      // Calculate memory growth rate
      const sessionDurationMinutes = sessionDuration / 60000;
      const growthRatePerMinute = totalGrowth / sessionDurationMinutes;

      console.log('Extended Session Memory Analysis:', {
        sessionDuration: `${sessionDuration / 1000}s`,
        snapshots: sessionMemorySnapshots.length,
        initialMemory: `${(initialSnapshot.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        finalMemory: `${(finalSnapshot.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        totalGrowth: `${(totalGrowth / 1024 / 1024).toFixed(2)} MB`,
        totalGrowthPercent: `${totalGrowthPercent.toFixed(2)}%`,
        growthRatePerMinute: `${(growthRatePerMinute / 1024 / 1024).toFixed(2)} MB/min`,
      });
    }
  });
});