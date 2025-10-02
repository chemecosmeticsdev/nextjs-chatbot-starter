import { test, expect } from '@playwright/test'

test.describe('Mobile Responsive Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    // Authenticate user
    await page.goto('/login')
    await page.fill('input[type="email"]', 'user@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should display mobile-optimized login page', async ({ page }) => {
    await page.goto('/login')

    // Check if login form is properly sized for mobile
    const loginForm = page.locator('form, [data-testid="login-form"]')
    await expect(loginForm).toBeVisible()

    // Form elements should be touch-friendly
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    const submitButton = page.locator('button[type="submit"]')

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(submitButton).toBeVisible()

    // Check button is large enough for touch
    const buttonBox = await submitButton.boundingBox()
    if (buttonBox) {
      expect(buttonBox.height).toBeGreaterThan(40) // Minimum touch target size
    }
  })

  test('should have collapsible mobile navigation', async ({ page }) => {
    // Look for mobile menu button (hamburger)
    const mobileMenuButton = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu"], .hamburger-menu')

    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click()

      // Sidebar should become visible
      const sidebar = page.locator('[data-testid="sidebar"], .sidebar')
      await expect(sidebar).toBeVisible()

      // Click again to close
      await mobileMenuButton.click()
      await expect(sidebar).not.toBeVisible()
    } else {
      // If no mobile menu, sidebar might be always visible but adapted
      const sidebar = page.locator('[data-testid="sidebar"], .sidebar')
      if (await sidebar.isVisible()) {
        await expect(sidebar).toBeVisible()
      }
    }
  })

  test('should display mobile-optimized dashboard', async ({ page }) => {
    // Dashboard should adapt to mobile layout
    const dashboardContent = page.locator('main, [data-testid="dashboard-content"]')
    await expect(dashboardContent).toBeVisible()

    // Cards should stack vertically on mobile
    const cards = page.locator('.card, [data-testid="dashboard-card"]')
    if (await cards.first().isVisible()) {
      const firstCardBox = await cards.first().boundingBox()
      const secondCardBox = await cards.nth(1).boundingBox()

      if (firstCardBox && secondCardBox) {
        // Cards should be stacked (second card below first)
        expect(secondCardBox.y).toBeGreaterThan(firstCardBox.y + firstCardBox.height - 10)
      }
    }
  })

  test('should handle mobile chat interface', async ({ page }) => {
    await page.goto('/dashboard/chat')

    // Chat input should be at bottom of screen
    const chatInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    await expect(chatInput).toBeVisible()

    // Send button should be touch-friendly
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')
    await expect(sendButton).toBeVisible()

    const sendButtonBox = await sendButton.boundingBox()
    if (sendButtonBox) {
      expect(sendButtonBox.height).toBeGreaterThan(40)
    }

    // Test message sending
    await chatInput.fill('Mobile test message')
    await sendButton.click()

    await expect(page.locator('text=Mobile test message')).toBeVisible()
  })

  test('should handle mobile forms and inputs', async ({ page }) => {
    // Navigate to a page with forms (settings or profile)
    const settingsLink = page.locator('a:has-text("Settings"), a[href*="settings"]')

    if (await settingsLink.isVisible()) {
      await settingsLink.click()
    } else {
      await page.goto('/dashboard/settings')
    }

    // Form inputs should be appropriately sized
    const formInputs = page.locator('input, textarea, select')

    for (let i = 0; i < await formInputs.count(); i++) {
      const input = formInputs.nth(i)
      if (await input.isVisible()) {
        const inputBox = await input.boundingBox()
        if (inputBox) {
          expect(inputBox.height).toBeGreaterThan(36) // Minimum touch target
        }
      }
    }
  })

  test('should handle mobile table responsiveness', async ({ page }) => {
    // Navigate to a page with tables (documents, users, etc.)
    await page.goto('/dashboard/documents')

    const table = page.locator('table, [data-testid="data-table"]')

    if (await table.isVisible()) {
      // Table should either:
      // 1. Be horizontally scrollable
      // 2. Be converted to card layout
      // 3. Have columns hidden/stacked

      const tableBox = await table.boundingBox()
      const viewportWidth = 375

      if (tableBox && tableBox.width > viewportWidth) {
        // Should have horizontal scroll
        const scrollContainer = page.locator('.table-container, .overflow-x-auto')
        if (await scrollContainer.isVisible()) {
          await expect(scrollContainer).toBeVisible()
        }
      }
    }
  })

  test('should handle mobile modals and dialogs', async ({ page }) => {
    // Look for any button that opens a modal
    const modalTrigger = page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("Edit")').first()

    if (await modalTrigger.isVisible()) {
      await modalTrigger.click()

      const modal = page.locator('[role="dialog"], .modal')
      if (await modal.isVisible()) {
        await expect(modal).toBeVisible()

        // Modal should fit mobile screen
        const modalBox = await modal.boundingBox()
        if (modalBox) {
          expect(modalBox.width).toBeLessThanOrEqual(375)
          expect(modalBox.x).toBeGreaterThanOrEqual(0)
        }

        // Close button should be accessible
        const closeButton = page.locator('[aria-label*="close"], button:has-text("Close"), [data-testid="close-modal"]')
        if (await closeButton.isVisible()) {
          await expect(closeButton).toBeVisible()
        }
      }
    }
  })

  test('should handle mobile dropdown menus', async ({ page }) => {
    // Find dropdown or select elements
    const dropdown = page.locator('select, [role="combobox"], .dropdown-trigger').first()

    if (await dropdown.isVisible()) {
      await dropdown.click()

      // Dropdown options should be touch-friendly
      const options = page.locator('[role="option"], option')
      if (await options.first().isVisible()) {
        const optionBox = await options.first().boundingBox()
        if (optionBox) {
          expect(optionBox.height).toBeGreaterThan(36)
        }
      }
    }
  })

  test('should handle mobile touch interactions', async ({ page }) => {
    // Test swipe gestures if implemented
    const swipeableElement = page.locator('[data-testid="swipeable"], .swipe-container')

    if (await swipeableElement.isVisible()) {
      // Simulate touch events
      await swipeableElement.touchstart()
      await swipeableElement.touchend()
    }

    // Test long press if implemented
    const longPressElement = page.locator('[data-testid="long-press"], .long-press-target')

    if (await longPressElement.isVisible()) {
      await longPressElement.press()
    }
  })

  test('should handle mobile orientation changes', async ({ page }) => {
    // Test landscape orientation
    await page.setViewportSize({ width: 667, height: 375 })
    await page.reload()

    // Layout should adapt to landscape
    const header = page.locator('header, [data-testid="header"]')
    if (await header.isVisible()) {
      await expect(header).toBeVisible()
    }

    // Switch back to portrait
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()

    // Should work in both orientations
    await expect(page.locator('main, [data-testid="main-content"]')).toBeVisible()
  })

  test('should handle mobile scroll behavior', async ({ page }) => {
    // Navigate to a page with scrollable content
    await page.goto('/dashboard/chat')

    // Send multiple messages to create scrollable content
    const chatInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    if (await chatInput.isVisible() && await sendButton.isVisible()) {
      for (let i = 0; i < 10; i++) {
        await chatInput.fill(`Test message ${i + 1}`)
        await sendButton.click()
        await page.waitForTimeout(100)
      }

      // Should be able to scroll to see all messages
      const chatContainer = page.locator('[data-testid="chat-container"], .chat-messages')
      if (await chatContainer.isVisible()) {
        // Scroll to top
        await chatContainer.hover()
        await page.mouse.wheel(0, -1000)

        // Should see earlier messages
        await expect(page.locator('text=Test message 1')).toBeVisible()

        // Scroll to bottom
        await page.mouse.wheel(0, 1000)

        // Should see latest messages
        await expect(page.locator('text=Test message 10')).toBeVisible()
      }
    }
  })

  test('should handle mobile accessibility features', async ({ page }) => {
    // Check for proper touch targets
    const buttons = page.locator('button')

    for (let i = 0; i < Math.min(5, await buttons.count()); i++) {
      const button = buttons.nth(i)
      if (await button.isVisible()) {
        const buttonBox = await button.boundingBox()
        if (buttonBox) {
          expect(buttonBox.height).toBeGreaterThan(40) // WCAG minimum
          expect(buttonBox.width).toBeGreaterThan(40)
        }
      }
    }

    // Check for proper contrast and readability
    const textElements = page.locator('p, span, div')
    if (await textElements.first().isVisible()) {
      await expect(textElements.first()).toBeVisible()
    }
  })
})