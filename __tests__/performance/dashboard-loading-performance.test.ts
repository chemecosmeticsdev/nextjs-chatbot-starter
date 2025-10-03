import { test, expect } from '@playwright/test'

test.describe('Dashboard Loading Performance Tests', () => {
  // Target: Dashboard load time <500ms
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('/api/auth/**', async (route) => {
      if (route.request().url().includes('session')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'test-user-1',
              email: 'test@example.com',
              name: 'Test User',
              role: 'admin'
            },
            expires: '2024-12-31T23:59:59.999Z'
          })
        })
      } else {
        await route.continue()
      }
    })

    // Mock dashboard API endpoints
    await page.route('/api/dashboard/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            metrics: {
              activeWidgets: 5,
              totalDeployments: 12,
              deploymentSuccess: 95,
              topDomains: [
                { domain: 'example.com', conversations: 150, percentage: 45 }
              ],
              realTimeMetrics: {
                active_sessions: 23,
                messages_last_hour: 145,
                widget_loads_last_hour: 67,
                online_status: 'healthy'
              }
            },
            activities: [
              {
                id: 'activity_1',
                type: 'chat_started',
                user: 'User 123',
                description: 'Started new chat session',
                timestamp: new Date().toISOString()
              }
            ]
          }
        })
      })
    })

    await page.route('/api/analytics/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            analytics: {
              totalSessions: 1250,
              avgResponseTime: 1.8,
              satisfactionScore: 4.2,
              topQueries: ['pricing', 'support', 'features']
            }
          }
        })
      })
    })
  })

  test('Dashboard initial load performance - <500ms target', async ({ page }) => {
    const startTime = Date.now()

    await page.goto('/dashboard')

    // Wait for critical content to be visible
    await expect(page.locator('[role="main"]')).toBeVisible()
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible()

    const endTime = Date.now()
    const loadTime = endTime - startTime

    console.log(`Dashboard load time: ${loadTime}ms`)

    // Target: <500ms
    expect(loadTime).toBeLessThan(500)

    // Verify essential components loaded
    await expect(page.locator('[data-testid="widget-stats-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="live-metrics-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="activity-feed-card"]')).toBeVisible()
  })

  test('Dashboard with real-time data loading performance', async ({ page }) => {
    const performanceMetrics: number[] = []

    for (let i = 0; i < 5; i++) {
      const startTime = Date.now()

      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const endTime = Date.now()
      performanceMetrics.push(endTime - startTime)

      // Clear cache between iterations
      await page.evaluate(() => {
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name))
          })
        }
      })
    }

    const averageLoadTime = performanceMetrics.reduce((a, b) => a + b, 0) / performanceMetrics.length
    const maxLoadTime = Math.max(...performanceMetrics)
    const minLoadTime = Math.min(...performanceMetrics)

    console.log(`Average dashboard load time: ${averageLoadTime}ms`)
    console.log(`Max load time: ${maxLoadTime}ms`)
    console.log(`Min load time: ${minLoadTime}ms`)

    // Performance targets
    expect(averageLoadTime).toBeLessThan(500) // Average <500ms
    expect(maxLoadTime).toBeLessThan(1000) // No load should exceed 1s
    expect(minLoadTime).toBeGreaterThan(50) // Sanity check
  })

  test('Dashboard component lazy loading performance', async ({ page }) => {
    await page.goto('/dashboard')

    // Test analytics card lazy loading
    const analyticsButton = page.locator('[data-testid="view-analytics-button"]')

    if (await analyticsButton.isVisible()) {
      const startTime = Date.now()

      await analyticsButton.click()
      await expect(page).toHaveURL('/dashboard/analytics')
      await page.waitForLoadState('networkidle')

      const endTime = Date.now()
      const navigationTime = endTime - startTime

      console.log(`Analytics navigation time: ${navigationTime}ms`)

      // Target: <300ms for navigation
      expect(navigationTime).toBeLessThan(300)
    }

    // Test chatbots management lazy loading
    await page.goto('/dashboard')
    const chatbotsButton = page.locator('[data-testid="manage-chatbots-button"]')

    if (await chatbotsButton.isVisible()) {
      const startTime = Date.now()

      await chatbotsButton.click()
      await expect(page).toHaveURL('/dashboard/chatbots')
      await page.waitForLoadState('networkidle')

      const endTime = Date.now()
      const navigationTime = endTime - startTime

      console.log(`Chatbots navigation time: ${navigationTime}ms`)

      // Target: <300ms for navigation
      expect(navigationTime).toBeLessThan(300)
    }
  })

  test('Dashboard API response time impact on load performance', async ({ page }) => {
    const testCases = [
      { delay: 0, label: 'Instant' },
      { delay: 100, label: 'Fast' },
      { delay: 250, label: 'Normal' },
      { delay: 500, label: 'Slow' }
    ]

    const results: Array<{ label: string; loadTime: number; delay: number }> = []

    for (const testCase of testCases) {
      // Mock API with specific delay
      await page.route('/api/dashboard/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, testCase.delay))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              metrics: {
                activeWidgets: 5,
                totalDeployments: 12,
                deploymentSuccess: 95
              }
            }
          })
        })
      })

      const startTime = Date.now()

      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const endTime = Date.now()
      const loadTime = endTime - startTime

      results.push({
        label: testCase.label,
        loadTime,
        delay: testCase.delay
      })

      console.log(`${testCase.label} API (${testCase.delay}ms): Dashboard load time ${loadTime}ms`)
    }

    // Verify performance degrades gracefully with slower APIs
    expect(results[0].loadTime).toBeLessThan(results[3].loadTime) // Instant should be faster than slow

    // Even with 500ms API delay, total load should be <1s
    expect(results[3].loadTime).toBeLessThan(1000)
  })

  test('Dashboard rendering performance with large datasets', async ({ page }) => {
    // Mock large dataset response
    const largeActivities = Array.from({ length: 100 }, (_, i) => ({
      id: `activity_${i}`,
      type: i % 3 === 0 ? 'chat_started' : i % 3 === 1 ? 'message_sent' : 'user_registered',
      user: `User ${i}`,
      description: `Activity description ${i}`,
      timestamp: new Date(Date.now() - i * 60000).toISOString()
    }))

    const largeDomains = Array.from({ length: 50 }, (_, i) => ({
      domain: `domain${i}.com`,
      conversations: Math.floor(Math.random() * 1000) + 100,
      percentage: Math.floor(Math.random() * 100)
    }))

    await page.route('/api/dashboard/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            metrics: {
              activeWidgets: 25,
              totalDeployments: 150,
              deploymentSuccess: 95,
              topDomains: largeDomains,
              realTimeMetrics: {
                active_sessions: 523,
                messages_last_hour: 2145,
                widget_loads_last_hour: 1267,
                online_status: 'healthy'
              }
            },
            activities: largeActivities
          }
        })
      })
    })

    const startTime = Date.now()

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const endTime = Date.now()
    const loadTime = endTime - startTime

    console.log(`Dashboard load time with large dataset: ${loadTime}ms`)

    // Even with large datasets, should load within 1 second
    expect(loadTime).toBeLessThan(1000)

    // Verify content is still rendered correctly
    await expect(page.locator('[data-testid="activity-feed-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="widget-stats-card"]')).toBeVisible()

    // Check if virtualization/pagination is working for large lists
    const activityItems = page.locator('[data-testid="activity-item"]')
    const visibleActivities = await activityItems.count()

    // Should not render all 100 activities at once (performance optimization)
    expect(visibleActivities).toBeLessThanOrEqual(50)
  })

  test('Dashboard concurrent user simulation performance', async ({ page, browser }) => {
    const concurrentUsers = 5
    const contexts = []
    const pages = []
    const loadTimes: number[] = []

    try {
      // Create multiple browser contexts to simulate concurrent users
      for (let i = 0; i < concurrentUsers; i++) {
        const context = await browser.newContext()
        const newPage = await context.newPage()

        // Mock authentication for each user
        await newPage.route('/api/auth/**', async (route) => {
          if (route.request().url().includes('session')) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                user: {
                  id: `test-user-${i}`,
                  email: `test${i}@example.com`,
                  name: `Test User ${i}`,
                  role: 'admin'
                },
                expires: '2024-12-31T23:59:59.999Z'
              })
            })
          }
        })

        // Mock dashboard APIs
        await newPage.route('/api/dashboard/**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                metrics: {
                  activeWidgets: 5 + i,
                  totalDeployments: 12 + i,
                  deploymentSuccess: 95
                }
              }
            })
          })
        })

        contexts.push(context)
        pages.push(newPage)
      }

      // Load dashboard concurrently for all users
      const loadPromises = pages.map(async (userPage, index) => {
        const startTime = Date.now()

        await userPage.goto('/dashboard')
        await userPage.waitForLoadState('networkidle')

        const endTime = Date.now()
        const loadTime = endTime - startTime

        console.log(`User ${index} dashboard load time: ${loadTime}ms`)
        loadTimes.push(loadTime)

        return loadTime
      })

      await Promise.all(loadPromises)

      // Analyze concurrent performance
      const averageLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length
      const maxLoadTime = Math.max(...loadTimes)

      console.log(`Concurrent users average load time: ${averageLoadTime}ms`)
      console.log(`Concurrent users max load time: ${maxLoadTime}ms`)

      // Performance should not degrade significantly with concurrent users
      expect(averageLoadTime).toBeLessThan(750) // Allow slight degradation
      expect(maxLoadTime).toBeLessThan(1200) // No user should wait more than 1.2s

    } finally {
      // Cleanup
      await Promise.all(contexts.map(context => context.close()))
    }
  })

  test('Dashboard Web Vitals performance metrics', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Measure Core Web Vitals
    const webVitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const metrics = {
          LCP: 0, // Largest Contentful Paint
          FID: 0, // First Input Delay
          CLS: 0  // Cumulative Layout Shift
        }

        // LCP
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          metrics.LCP = lastEntry.startTime
        }).observe({ entryTypes: ['largest-contentful-paint'] })

        // CLS
        let clsValue = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value
            }
          }
          metrics.CLS = clsValue
        }).observe({ entryTypes: ['layout-shift'] })

        // Wait a bit to collect metrics
        setTimeout(() => {
          resolve(metrics)
        }, 2000)
      })
    })

    console.log('Web Vitals:', webVitals)

    // Web Vitals targets (Google recommendations)
    expect((webVitals as any).LCP).toBeLessThan(2500) // LCP < 2.5s
    expect((webVitals as any).CLS).toBeLessThan(0.1)  // CLS < 0.1
    // FID is measured on first user interaction, tested separately
  })

  test('Dashboard bundle size and resource loading performance', async ({ page }) => {
    // Track resource loading
    const resources: Array<{ url: string; size: number; time: number; type: string }> = []

    page.on('response', async (response) => {
      const url = response.url()
      const size = (await response.allHeaders())['content-length']
      const timing = response.timing()

      if (url.includes('/dashboard') || url.includes('/_next/') || url.includes('.js') || url.includes('.css')) {
        resources.push({
          url,
          size: parseInt(size || '0', 10),
          time: timing.responseEnd - timing.requestStart,
          type: response.headers()['content-type'] || 'unknown'
        })
      }
    })

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Analyze resource loading
    const jsResources = resources.filter(r => r.url.includes('.js'))
    const cssResources = resources.filter(r => r.url.includes('.css'))

    const totalJSSize = jsResources.reduce((sum, r) => sum + r.size, 0)
    const totalCSSSize = cssResources.reduce((sum, r) => sum + r.size, 0)
    const totalResources = resources.length

    console.log(`Total JS size: ${(totalJSSize / 1024).toFixed(2)} KB`)
    console.log(`Total CSS size: ${(totalCSSSize / 1024).toFixed(2)} KB`)
    console.log(`Total resources loaded: ${totalResources}`)

    // Bundle size targets (for good performance)
    expect(totalJSSize).toBeLessThan(1024 * 1024) // JS bundle < 1MB
    expect(totalCSSSize).toBeLessThan(256 * 1024) // CSS bundle < 256KB
    expect(totalResources).toBeLessThan(50) // Not too many requests

    // Individual resource loading should be fast
    resources.forEach(resource => {
      if (resource.size > 100 * 1024) { // Resources > 100KB
        expect(resource.time).toBeLessThan(1000) // Should load within 1s
      }
    })
  })
})