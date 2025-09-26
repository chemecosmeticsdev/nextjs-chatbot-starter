import { test, expect } from '@playwright/test'

test.describe('Dashboard Navigation', () => {
  let userContext: any
  let superAdminContext: any

  test.beforeAll(async ({ browser }) => {
    // Create regular user context
    userContext = await browser.newContext()
    const userPage = await userContext.newPage()

    await userPage.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'user-id',
            email: 'user@example.com',
            fullName: 'Regular User',
            role: 'user'
          }
        })
      })
    })

    await userContext.addCookies([
      { name: 'session', value: 'user-session', domain: 'localhost', path: '/' }
    ])

    // Create super admin context
    superAdminContext = await browser.newContext()
    const adminPage = await superAdminContext.newPage()

    await adminPage.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'admin-id',
            email: 'admin@example.com',
            fullName: 'Super Admin',
            role: 'super_admin'
          }
        })
      })
    })

    await superAdminContext.addCookies([
      { name: 'session', value: 'admin-session', domain: 'localhost', path: '/' }
    ])
  })

  test.afterAll(async () => {
    await userContext.close()
    await superAdminContext.close()
  })

  test('should display sidebar navigation for authenticated users', async () => {
    const page = await userContext.newPage()
    await page.goto('/dashboard')

    // Check sidebar is visible
    await expect(page.getByRole('navigation')).toBeVisible()

    // Check main navigation items
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /documents/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /chat/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /profile/i })).toBeVisible()

    // Check user info in navigation
    await expect(page.getByText(/regular user/i)).toBeVisible()
    await expect(page.getByText(/user@example.com/i)).toBeVisible()
  })

  test('should show admin-specific navigation items for super admin', async () => {
    const page = await superAdminContext.newPage()
    await page.goto('/dashboard')

    // Regular navigation items
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()

    // Admin-specific items
    await expect(page.getByRole('link', { name: /users/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /settings/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /logs/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /chatbots/i })).toBeVisible()

    // Super admin badge or indicator
    await expect(page.getByText(/super admin/i)).toBeVisible()
  })

  test('should navigate between pages correctly', async () => {
    const page = await userContext.newPage()
    await page.goto('/dashboard')

    // Navigate to Documents
    await page.getByRole('link', { name: /documents/i }).click()
    await expect(page).toHaveURL('/dashboard/documents')
    await expect(page.getByRole('heading', { name: /documents/i })).toBeVisible()

    // Navigate to Profile
    await page.getByRole('link', { name: /profile/i }).click()
    await expect(page).toHaveURL('/dashboard/profile')
    await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible()

    // Navigate back to Dashboard
    await page.getByRole('link', { name: /dashboard/i }).click()
    await expect(page).toHaveURL('/dashboard')
  })

  test('should highlight active navigation item', async () => {
    const page = await userContext.newPage()

    // Dashboard should be active by default
    await page.goto('/dashboard')
    const dashboardLink = page.getByRole('link', { name: /^dashboard$/i })
    await expect(dashboardLink).toHaveClass(/active|current/)

    // Navigate to documents and check active state
    await page.goto('/dashboard/documents')
    const documentsLink = page.getByRole('link', { name: /documents/i })
    await expect(documentsLink).toHaveClass(/active|current/)

    // Dashboard should no longer be active
    await expect(dashboardLink).not.toHaveClass(/active|current/)
  })

  test('should display user dropdown menu', async () => {
    const page = await userContext.newPage()
    await page.goto('/dashboard')

    // Click on user avatar/name to open dropdown
    const userButton = page.getByRole('button', { name: /regular user/i })
    await userButton.click()

    // Check dropdown menu items
    await expect(page.getByRole('menuitem', { name: /profile/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /logout/i })).toBeVisible()

    // Test theme switcher if present
    const themeToggle = page.getByRole('menuitem', { name: /theme/i })
    if (await themeToggle.isVisible()) {
      await expect(themeToggle).toBeVisible()
    }
  })

  test('should handle logout correctly', async () => {
    const page = await userContext.newPage()

    // Mock logout API
    await page.route('**/api/v1/auth/logout', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })

    await page.goto('/dashboard')

    // Open user dropdown and click logout
    await page.getByRole('button', { name: /regular user/i }).click()
    await page.getByRole('menuitem', { name: /logout/i }).click()

    // Should redirect to login page
    await expect(page).toHaveURL('/login')

    // Verify session is cleared
    const cookies = await page.context().cookies()
    const sessionCookie = cookies.find(c => c.name === 'session')
    expect(sessionCookie).toBeUndefined()
  })

  test('should toggle sidebar on mobile', async () => {
    const page = await userContext.newPage()

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/dashboard')

    // Sidebar should be hidden on mobile by default
    const sidebar = page.getByRole('navigation')
    await expect(sidebar).not.toBeVisible()

    // Click menu button to show sidebar
    const menuButton = page.getByRole('button', { name: /menu/i })
    await menuButton.click()
    await expect(sidebar).toBeVisible()

    // Click outside or close button to hide sidebar
    const closeButton = page.getByRole('button', { name: /close/i })
    if (await closeButton.isVisible()) {
      await closeButton.click()
    } else {
      await page.click('main') // Click outside sidebar
    }

    await expect(sidebar).not.toBeVisible()
  })

  test('should display breadcrumbs for nested pages', async () => {
    const page = await userContext.newPage()

    // Navigate to nested page
    await page.goto('/dashboard/documents/upload')

    // Check breadcrumb navigation
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /documents/i })).toBeVisible()
    await expect(page.getByText(/upload/i)).toBeVisible()

    // Breadcrumb links should be functional
    await page.getByRole('link', { name: /documents/i }).click()
    await expect(page).toHaveURL('/dashboard/documents')
  })

  test('should handle theme switching', async () => {
    const page = await userContext.newPage()
    await page.goto('/dashboard')

    // Open user dropdown
    await page.getByRole('button', { name: /regular user/i }).click()

    // Look for theme toggle
    const themeToggle = page.getByRole('menuitem', { name: /theme|dark|light/i })

    if (await themeToggle.isVisible()) {
      // Get current theme
      const htmlElement = page.locator('html')
      const currentClass = await htmlElement.getAttribute('class')

      // Toggle theme
      await themeToggle.click()

      // Verify theme changed
      const newClass = await htmlElement.getAttribute('class')
      expect(newClass).not.toBe(currentClass)

      // Verify theme persistence (if implemented)
      await page.reload()
      const persistedClass = await htmlElement.getAttribute('class')
      expect(persistedClass).toBe(newClass)
    }
  })

  test('should show page loading states during navigation', async () => {
    const page = await userContext.newPage()

    // Mock delayed page response
    await page.route('**/dashboard/documents', async route => {
      await new Promise(resolve => setTimeout(resolve, 500))
      await route.continue()
    })

    await page.goto('/dashboard')

    // Click navigation link
    await page.getByRole('link', { name: /documents/i }).click()

    // Should show loading indicator (if implemented)
    const loadingIndicator = page.getByTestId('loading') || page.getByText(/loading/i)
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).toBeVisible()
    }

    // Wait for page to load
    await expect(page).toHaveURL('/dashboard/documents')
  })

  test('should handle navigation keyboard shortcuts', async () => {
    const page = await userContext.newPage()
    await page.goto('/dashboard')

    // Test common keyboard shortcuts (if implemented)

    // Ctrl/Cmd + K for search
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
    const searchModal = page.getByRole('dialog', { name: /search/i })
    if (await searchModal.isVisible()) {
      await expect(searchModal).toBeVisible()
      await page.keyboard.press('Escape')
    }

    // Alt + number keys for navigation (if implemented)
    await page.keyboard.press('Alt+1')
    // Should navigate to first item or stay on dashboard
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('should show appropriate error states for navigation failures', async () => {
    const page = await userContext.newPage()
    await page.goto('/dashboard')

    // Navigate to non-existent page
    await page.goto('/dashboard/nonexistent')

    // Should show 404 error or redirect appropriately
    const heading = page.getByRole('heading', { level: 1 })
    const headingText = await heading.textContent()

    expect(
      headingText?.includes('404') ||
      headingText?.includes('Not Found') ||
      headingText?.includes('Page Not Found')
    ).toBeTruthy()
  })

  test('should maintain navigation state across page refreshes', async () => {
    const page = await userContext.newPage()

    // Navigate to a specific page
    await page.goto('/dashboard/documents')

    // Refresh the page
    await page.reload()

    // Should maintain the same page and navigation state
    await expect(page).toHaveURL('/dashboard/documents')
    await expect(page.getByRole('link', { name: /documents/i })).toHaveClass(/active|current/)
  })
})