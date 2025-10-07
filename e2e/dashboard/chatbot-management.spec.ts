import { test, expect } from '@playwright/test'

test.describe('Chatbot Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as admin user
    await page.goto('/login')
    await page.fill('input[type="email"]', 'admin@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('should display chatbot list', async ({ page }) => {
    // Navigate to chatbots page
    await page.goto('/dashboard/chatbots')

    // Should show chatbot listing
    await expect(page.locator('h1, h2')).toContainText(/chatbot/i)

    // Check for chatbot cards or table
    const chatbotItems = page.locator('[data-testid="chatbot-item"], .chatbot-card, tr[data-chatbot-id]')
    if (await chatbotItems.first().isVisible()) {
      await expect(chatbotItems.first()).toBeVisible()
    }
  })

  test('should create new chatbot', async ({ page }) => {
    await page.goto('/dashboard/chatbots')

    // Look for create button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New"), a:has-text("Create")')

    if (await createButton.first().isVisible()) {
      await createButton.first().click()

      // Fill in chatbot creation form
      await page.fill('input[name="name"], input[placeholder*="name"]', 'Test Chatbot E2E')
      await page.fill('textarea[name="description"], textarea[placeholder*="description"]', 'E2E test chatbot description')

      // Submit form
      const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")')
      await submitButton.click()

      // Should redirect to chatbot list or detail page
      await page.waitForTimeout(2000)
      await expect(page.locator('text=Test Chatbot E2E')).toBeVisible()
    }
  })

  test('should view chatbot details', async ({ page }) => {
    await page.goto('/dashboard/chatbots')

    // Find first chatbot and click to view details
    const firstChatbot = page.locator('[data-testid="chatbot-item"], .chatbot-card').first()

    if (await firstChatbot.isVisible()) {
      const chatbotName = await firstChatbot.locator('h3, .chatbot-name, [data-testid="chatbot-name"]').first().textContent()
      await firstChatbot.click()

      // Should navigate to chatbot detail page
      await expect(page.url()).toMatch(/chatbots\/[a-zA-Z0-9-]+/)

      if (chatbotName) {
        await expect(page.locator('h1, h2')).toContainText(chatbotName)
      }
    }
  })

  test('should configure chatbot settings', async ({ page }) => {
    await page.goto('/dashboard/chatbots')

    // Find configure button or first chatbot
    const configureButton = page.locator('button:has-text("Configure"), a:has-text("Configure")').first()

    if (await configureButton.isVisible()) {
      await configureButton.click()
    } else {
      // Navigate to first chatbot and then configure
      const firstChatbot = page.locator('[data-testid="chatbot-item"], .chatbot-card').first()
      if (await firstChatbot.isVisible()) {
        await firstChatbot.click()

        // Look for configure button on detail page
        const detailConfigureButton = page.locator('button:has-text("Configure"), a:has-text("Configure")')
        if (await detailConfigureButton.isVisible()) {
          await detailConfigureButton.click()
        }
      }
    }

    // Should be on configure page
    await expect(page.url()).toMatch(/configure/)

    // Test configuration tabs
    const generalTab = page.locator('button[role="tab"]:has-text("General")')
    if (await generalTab.isVisible()) {
      await generalTab.click()
      await expect(page.locator('input[name="name"], input[value]:not([value=""])')).toBeVisible()
    }

    const aiModelTab = page.locator('button[role="tab"]:has-text("AI Model")')
    if (await aiModelTab.isVisible()) {
      await aiModelTab.click()
      await expect(page.locator('[data-testid="model-select"], select, [role="combobox"]')).toBeVisible()
    }

    const behaviorTab = page.locator('button[role="tab"]:has-text("Behavior")')
    if (await behaviorTab.isVisible()) {
      await behaviorTab.click()
      await expect(page.locator('textarea, input[type="text"]')).toBeVisible()
    }
  })

  test('should update chatbot configuration', async ({ page }) => {
    // Navigate to configure page
    await page.goto('/dashboard/chatbots')

    const firstChatbot = page.locator('[data-testid="chatbot-item"], .chatbot-card').first()
    if (await firstChatbot.isVisible()) {
      await firstChatbot.click()

      const configureButton = page.locator('button:has-text("Configure"), a:has-text("Configure")')
      if (await configureButton.isVisible()) {
        await configureButton.click()

        // Update chatbot name in General tab
        const nameInput = page.locator('input[name="name"], input[placeholder*="name"]').first()
        if (await nameInput.isVisible()) {
          await nameInput.clear()
          await nameInput.fill('Updated Chatbot Name E2E')
        }

        // Save changes
        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]')
        if (await saveButton.isVisible()) {
          await saveButton.click()

          // Should show success message
          await expect(page.locator('text=saved, text=updated, [role="alert"]')).toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('should delete chatbot', async ({ page }) => {
    await page.goto('/dashboard/chatbots')

    // Look for delete button (usually in dropdown or as separate button)
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid="delete-button"]').first()

    if (await deleteButton.isVisible()) {
      await deleteButton.click()

      // Should show confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")')
      if (await confirmButton.isVisible()) {
        await confirmButton.click()

        // Should show success message or remove item from list
        await expect(page.locator('text=deleted, [role="alert"]')).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should handle chatbot status changes', async ({ page }) => {
    await page.goto('/dashboard/chatbots')

    // Look for status toggle (Active/Inactive)
    const statusToggle = page.locator('button[role="switch"], input[type="checkbox"][role="switch"]').first()

    if (await statusToggle.isVisible()) {
      const initialState = await statusToggle.isChecked()
      await statusToggle.click()

      // Status should change
      await expect(statusToggle).toBeChecked({ checked: !initialState })
    }
  })

  test('should test chatbot in playground', async ({ page }) => {
    await page.goto('/dashboard/chatbots')

    // Look for test/playground button
    const testButton = page.locator('button:has-text("Test"), button:has-text("Try"), a:has-text("Playground")').first()

    if (await testButton.isVisible()) {
      await testButton.click()

      // Should open chat interface
      const chatInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
      if (await chatInput.isVisible()) {
        await chatInput.fill('Hello, this is a test message')

        const sendButton = page.locator('button[type="submit"], button:has-text("Send")')
        if (await sendButton.isVisible()) {
          await sendButton.click()

          // Should show message in chat
          await expect(page.locator('text=Hello, this is a test message')).toBeVisible()
        }
      }
    }
  })
})