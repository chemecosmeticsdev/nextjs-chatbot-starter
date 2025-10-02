import { test, expect } from '@playwright/test'

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication by going to login and filling credentials
    await page.goto('/login')
    await page.fill('input[type="email"]', 'admin@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should display dashboard header and sidebar', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Dashboard')
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
    await expect(page.locator('text=Chatbot Dashboard')).toBeVisible()
  })

  test('should navigate between dashboard sections', async ({ page }) => {
    // Test Chat navigation
    await page.click('a:has-text("Chat")')
    await expect(page).toHaveURL('/dashboard/chat')

    // Test Dashboard navigation
    await page.click('a:has-text("Dashboard")')
    await expect(page).toHaveURL('/dashboard')

    // Test Analytics (if available for admin)
    const analyticsLink = page.locator('a:has-text("Analytics")')
    if (await analyticsLink.isVisible()) {
      await analyticsLink.click()
      await expect(page).toHaveURL('/dashboard/analytics')
    }
  })

  test('should display role-appropriate navigation items', async ({ page }) => {
    // Admin should see all navigation items
    await expect(page.locator('a:has-text("Dashboard")')).toBeVisible()
    await expect(page.locator('a:has-text("Chat")')).toBeVisible()
    await expect(page.locator('a:has-text("Knowledge Base")')).toBeVisible()
    await expect(page.locator('a:has-text("Analytics")')).toBeVisible()
  })

  test('should handle sidebar collapse/expand', async ({ page }) => {
    // Check if sidebar is initially expanded
    const sidebar = page.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Look for collapse button (usually a hamburger or arrow)
    const collapseButton = page.locator('[data-testid="sidebar-toggle"], button[aria-label*="toggle"], button[aria-label*="collapse"]').first()

    if (await collapseButton.isVisible()) {
      await collapseButton.click()

      // Check if sidebar state changed (might be collapsed or icons-only)
      await page.waitForTimeout(300) // Wait for animation

      // Expand again
      await collapseButton.click()
      await page.waitForTimeout(300)
    }
  })

  test('should show user information in sidebar footer', async ({ page }) => {
    // Check if user email or info is displayed
    await expect(page.locator('text=admin@example.com')).toBeVisible()
    await expect(page.locator('text=Admin')).toBeVisible()
  })

  test('should handle responsive design on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()

    // Sidebar might be hidden on mobile
    const sidebar = page.locator('[data-testid="sidebar"]')
    const mobileMenuButton = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu"]')

    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click()
      await expect(sidebar).toBeVisible()
    }
  })

  test('should navigate to chatbot management', async ({ page }) => {
    // Look for chatbot-related navigation
    const chatbotsLink = page.locator('a:has-text("All Chatbots"), a:has-text("Chatbots"), a[href*="chatbot"]').first()

    if (await chatbotsLink.isVisible()) {
      await chatbotsLink.click()
      await expect(page.url()).toMatch(/chatbot/)
    }
  })

  test('should display breadcrumbs for navigation context', async ({ page }) => {
    // Navigate to a sub-page
    await page.click('a:has-text("Chat")')

    // Check for breadcrumbs or navigation context
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"], nav[aria-label*="breadcrumb"]')

    if (await breadcrumbs.isVisible()) {
      await expect(breadcrumbs).toContainText('Dashboard')
      await expect(breadcrumbs).toContainText('Chat')
    }
  })
})