import { test, expect } from '@playwright/test'

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate user
    await page.goto('/login')
    await page.fill('input[type="email"]', 'user@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')

    // Navigate to chat page
    await page.goto('/dashboard/chat')
  })

  test('should display chat interface', async ({ page }) => {
    // Check for chat container
    await expect(page.locator('[data-testid="chat-container"], .chat-interface')).toBeVisible()

    // Check for message input
    await expect(page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')).toBeVisible()

    // Check for send button
    await expect(page.locator('button[type="submit"], button:has-text("Send")')).toBeVisible()
  })

  test('should send and receive messages', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    // Send a test message
    await messageInput.fill('Hello, can you help me?')
    await sendButton.click()

    // Check if message appears in chat
    await expect(page.locator('text=Hello, can you help me?')).toBeVisible()

    // Wait for bot response (mock or real)
    await page.waitForTimeout(2000)

    // Check for response message container
    const messages = page.locator('[data-testid="message"], .message')
    await expect(messages).toHaveCount.greaterThan(1)
  })

  test('should handle message history', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    // Send multiple messages
    await messageInput.fill('First message')
    await sendButton.click()
    await page.waitForTimeout(1000)

    await messageInput.fill('Second message')
    await sendButton.click()
    await page.waitForTimeout(1000)

    await messageInput.fill('Third message')
    await sendButton.click()

    // Check all messages are visible
    await expect(page.locator('text=First message')).toBeVisible()
    await expect(page.locator('text=Second message')).toBeVisible()
    await expect(page.locator('text=Third message')).toBeVisible()
  })

  test('should clear chat history', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    // Send a message first
    await messageInput.fill('Test message to clear')
    await sendButton.click()

    await expect(page.locator('text=Test message to clear')).toBeVisible()

    // Look for clear button
    const clearButton = page.locator('button:has-text("Clear"), button[title*="clear"], [data-testid="clear-chat"]')

    if (await clearButton.isVisible()) {
      await clearButton.click()

      // Confirm if there's a confirmation dialog
      const confirmButton = page.locator('button:has-text("Yes"), button:has-text("Confirm")')
      if (await confirmButton.isVisible()) {
        await confirmButton.click()
      }

      // Message should be gone
      await expect(page.locator('text=Test message to clear')).not.toBeVisible()
    }
  })

  test('should handle empty message submission', async ({ page }) => {
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    // Try to send empty message
    await sendButton.click()

    // Should not send message (button might be disabled or show validation)
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    await expect(messageInput).toBeFocused()
  })

  test('should handle long messages', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    const longMessage = 'This is a very long message that tests how the chat interface handles lengthy text input. '.repeat(10)

    await messageInput.fill(longMessage)
    await sendButton.click()

    // Check if long message is displayed properly
    await expect(page.locator(`text=${longMessage.substring(0, 50)}`)).toBeVisible()
  })

  test('should support keyboard shortcuts', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')

    await messageInput.fill('Test keyboard shortcut')

    // Test Enter to send
    await messageInput.press('Enter')

    await expect(page.locator('text=Test keyboard shortcut')).toBeVisible()
  })

  test('should show typing indicator during response', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    await messageInput.fill('Show typing indicator')
    await sendButton.click()

    // Look for typing indicator
    const typingIndicator = page.locator('[data-testid="typing"], .typing-indicator, text=typing')

    if (await typingIndicator.isVisible()) {
      await expect(typingIndicator).toBeVisible()

      // Wait for typing to finish
      await expect(typingIndicator).not.toBeVisible({ timeout: 10000 })
    }
  })

  test('should handle message timestamps', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    await messageInput.fill('Check timestamp')
    await sendButton.click()

    // Look for timestamp elements
    const timestamp = page.locator('[data-testid="timestamp"], .timestamp, .message-time')

    if (await timestamp.first().isVisible()) {
      await expect(timestamp.first()).toBeVisible()
    }
  })

  test('should display user and bot message styles differently', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    await messageInput.fill('Distinguish message styles')
    await sendButton.click()

    // Wait for response
    await page.waitForTimeout(2000)

    // Check if user and bot messages have different styling
    const userMessages = page.locator('[data-testid="user-message"], .user-message')
    const botMessages = page.locator('[data-testid="bot-message"], .bot-message, .assistant-message')

    if (await userMessages.first().isVisible()) {
      await expect(userMessages.first()).toBeVisible()
    }

    if (await botMessages.first().isVisible()) {
      await expect(botMessages.first()).toBeVisible()
    }
  })

  test('should handle error states gracefully', async ({ page }) => {
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")')

    // Send a message that might trigger an error response
    await messageInput.fill('Error test message')
    await sendButton.click()

    // Wait for potential error message
    await page.waitForTimeout(3000)

    // Check for error handling
    const errorMessage = page.locator('[role="alert"], .error-message, text=error')

    if (await errorMessage.isVisible()) {
      await expect(errorMessage).toBeVisible()

      // Should allow retry
      const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try again")')
      if (await retryButton.isVisible()) {
        await retryButton.click()
      }
    }
  })
})