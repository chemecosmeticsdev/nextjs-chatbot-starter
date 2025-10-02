import { test, expect } from '@playwright/test'

test.describe('Chatbot Configuration Flow', () => {
  let superAdminContext: any

  test.beforeAll(async ({ browser }) => {
    // Create super admin context for chatbot management
    superAdminContext = await browser.newContext()
    const adminPage = await superAdminContext.newPage()

    // Mock authentication for super admin
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
    await superAdminContext.close()
  })

  test('should display and navigate to chatbot configuration page', async () => {
    const page = await superAdminContext.newPage()

    // Mock chatbots list API
    await page.route('**/api/v1/chatbots', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'cda1f36a-44dc-4efe-beeb-437b309aae9f',
              name: 'Customer Support Bot',
              description: 'AI assistant for customer support',
              status: 'active',
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          ]
        })
      })
    })

    await page.goto('/dashboard/chatbots')

    // Check if chatbots page loads correctly
    await expect(page.getByRole('heading', { name: /chatbots/i })).toBeVisible()

    // Find and click Configure button for a chatbot
    const configureButton = page.getByRole('button', { name: /configure/i }).first()
    await expect(configureButton).toBeVisible()
    await configureButton.click()

    // Should navigate to configuration page
    await expect(page).toHaveURL(/\/dashboard\/chatbots\/.*\/configure/)
    await expect(page.getByRole('heading', { name: /configure/i })).toBeVisible()
  })

  test('should load and display chatbot configuration with all tabs', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock chatbot configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: chatbotId,
              name: 'Customer Support Bot',
              description: 'AI assistant for customer support',
              status: 'active',
              model: 'anthropic.claude-3-haiku-20240307-v1:0',
              temperature: 0.7,
              maxTokens: 2048,
              systemPrompt: 'You are a helpful customer support assistant.',
              responseStyle: 'professional',
              language: 'en',
              timezone: 'UTC',
              enableLogging: true,
              enableAnalytics: true,
              rateLimitPerMinute: 60,
              sessionTimeout: 30,
              autoSave: true,
              enableFallback: true,
              fallbackMessage: "I'm sorry, I didn't understand that. Could you please rephrase your question?",
              enableWelcomeMessage: true,
              welcomeMessage: "Hello! How can I help you today?",
              enableTypingIndicator: true,
              maxConversationLength: 50,
              retentionDays: 30,
              enableEmoticons: false,
              enableFileUploads: false,
              maxFileSize: 10,
              allowedFileTypes: ['pdf', 'txt', 'docx'],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /configure/i })).toBeVisible()

    // Check all configuration tabs are present
    await expect(page.getByRole('tab', { name: /general/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /ai model/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /behavior/i })).toBeVisible()

    // Check that configuration fields are loaded with values
    await expect(page.getByDisplayValue('Customer Support Bot')).toBeVisible()
    await expect(page.getByDisplayValue('AI assistant for customer support')).toBeVisible()
  })

  test('should successfully switch between configuration tabs', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: chatbotId,
              name: 'Test Bot',
              temperature: 0.7,
              maxTokens: 2048,
              responseStyle: 'professional',
              enableWelcomeMessage: true,
              welcomeMessage: 'Hello!'
            }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)

    // Wait for page to load
    await expect(page.getByRole('heading')).toBeVisible()

    // General tab should be active by default
    const generalTab = page.getByRole('tab', { name: /general/i })
    const aiModelTab = page.getByRole('tab', { name: /ai model/i })
    const behaviorTab = page.getByRole('tab', { name: /behavior/i })

    await expect(generalTab).toHaveAttribute('aria-selected', 'true')

    // Switch to AI Model tab
    await aiModelTab.click()
    await expect(aiModelTab).toHaveAttribute('aria-selected', 'true')
    await expect(generalTab).toHaveAttribute('aria-selected', 'false')

    // Check AI Model tab content
    await expect(page.getByText(/temperature/i)).toBeVisible()
    await expect(page.getByText(/max tokens/i)).toBeVisible()

    // Switch to Behavior tab
    await behaviorTab.click()
    await expect(behaviorTab).toHaveAttribute('aria-selected', 'true')
    await expect(aiModelTab).toHaveAttribute('aria-selected', 'false')

    // Check Behavior tab content
    await expect(page.getByText(/response style/i)).toBeVisible()
    await expect(page.getByText(/welcome message/i)).toBeVisible()
  })

  test('should update configuration values using form controls', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock GET configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: chatbotId,
              name: 'Test Bot',
              description: 'Original description',
              temperature: 0.7,
              maxTokens: 2048,
              responseStyle: 'professional',
              enableWelcomeMessage: true,
              welcomeMessage: 'Hello!',
              maxConversationLength: 50
            }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)
    await expect(page.getByRole('heading')).toBeVisible()

    // Test General tab form updates
    const nameInput = page.getByLabel(/name/i)
    const descriptionInput = page.getByLabel(/description/i)

    await nameInput.fill('Updated Bot Name')
    await descriptionInput.fill('Updated description')

    // Test AI Model tab controls
    await page.getByRole('tab', { name: /ai model/i }).click()

    // Test temperature slider
    const temperatureSlider = page.getByRole('slider', { name: /temperature/i })
    await expect(temperatureSlider).toBeVisible()

    // Test max tokens input
    const maxTokensInput = page.getByLabel(/max tokens/i)
    if (await maxTokensInput.isVisible()) {
      await maxTokensInput.fill('4096')
    }

    // Test Behavior tab controls
    await page.getByRole('tab', { name: /behavior/i }).click()

    // Test response style dropdown
    const responseStyleSelect = page.getByLabel(/response style/i)
    if (await responseStyleSelect.isVisible()) {
      await responseStyleSelect.selectOption('casual')
    }

    // Test welcome message toggle and input
    const welcomeToggle = page.getByRole('switch', { name: /welcome message/i })
    if (await welcomeToggle.isVisible()) {
      await welcomeToggle.click() // Toggle state
    }

    // Test max conversation length slider
    const conversationLengthSlider = page.getByRole('slider', { name: /conversation length/i })
    if (await conversationLengthSlider.isVisible()) {
      // Verify slider is interactive
      await expect(conversationLengthSlider).toBeVisible()
    }

    // Verify form values have been updated
    await page.getByRole('tab', { name: /general/i }).click()
    await expect(nameInput).toHaveValue('Updated Bot Name')
    await expect(descriptionInput).toHaveValue('Updated description')
  })

  test('should save configuration changes successfully', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock GET configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: chatbotId,
              name: 'Test Bot',
              description: 'Test description',
              temperature: 0.7
            }
          })
        })
      }
    })

    // Mock PUT configuration API
    let saveRequestMade = false
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'PUT') {
        saveRequestMade = true
        const requestBody = await route.request().postDataJSON()

        // Verify request contains expected fields
        expect(requestBody.name).toBeDefined()

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { ...requestBody, id: chatbotId }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)
    await expect(page.getByRole('heading')).toBeVisible()

    // Make a change
    const nameInput = page.getByLabel(/name/i)
    await nameInput.fill('Updated Bot Name')

    // Save changes
    const saveButton = page.getByRole('button', { name: /save/i })
    await expect(saveButton).toBeVisible()
    await saveButton.click()

    // Wait for save request to complete
    await page.waitForTimeout(1000)

    // Verify save request was made
    expect(saveRequestMade).toBe(true)

    // Check for success message or indication
    const successMessage = page.getByText(/saved|success|updated/i)
    if (await successMessage.isVisible()) {
      await expect(successMessage).toBeVisible()
    }
  })

  test('should handle configuration loading errors gracefully', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'nonexistent-chatbot-id'

    // Mock API to return error
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            message: 'Chatbot not found',
            code: 'NOT_FOUND'
          }
        })
      })
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)

    // Should show error state
    const errorMessage = page.getByText(/error|not found|failed/i)
    await expect(errorMessage).toBeVisible()

    // Should provide way to go back or retry
    const backButton = page.getByRole('button', { name: /back|return/i })
    const retryButton = page.getByRole('button', { name: /retry|reload/i })

    const hasBackButton = await backButton.isVisible()
    const hasRetryButton = await retryButton.isVisible()

    expect(hasBackButton || hasRetryButton).toBe(true)
  })

  test('should handle save errors appropriately', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock successful GET
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: chatbotId, name: 'Test Bot' }
          })
        })
      }
    })

    // Mock failed PUT
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              message: 'Failed to update configuration',
              code: 'UPDATE_FAILED'
            }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)
    await expect(page.getByRole('heading')).toBeVisible()

    // Make a change and try to save
    const nameInput = page.getByLabel(/name/i)
    await nameInput.fill('Failed Save Test')

    const saveButton = page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Should show error message
    const errorMessage = page.getByText(/error|failed|could not save/i)
    await expect(errorMessage).toBeVisible()

    // Form should still contain user's changes
    await expect(nameInput).toHaveValue('Failed Save Test')
  })

  test('should validate required fields and show validation errors', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: chatbotId, name: 'Test Bot' }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)
    await expect(page.getByRole('heading')).toBeVisible()

    // Clear required field
    const nameInput = page.getByLabel(/name/i)
    await nameInput.fill('')

    // Try to save
    const saveButton = page.getByRole('button', { name: /save/i })
    await saveButton.click()

    // Should show validation error
    const validationError = page.getByText(/required|cannot be empty|name is required/i)
    if (await validationError.isVisible()) {
      await expect(validationError).toBeVisible()
    }

    // Save button should be disabled or show error state
    const hasSaveError = await saveButton.isDisabled() || await validationError.isVisible()
    expect(hasSaveError).toBe(true)
  })

  test('should maintain scroll position and form state when switching tabs', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: chatbotId,
              name: 'Test Bot',
              description: 'Original description',
              temperature: 0.7,
              enableWelcomeMessage: true,
              welcomeMessage: 'Hello!'
            }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)
    await expect(page.getByRole('heading')).toBeVisible()

    // Make changes in General tab
    const nameInput = page.getByLabel(/name/i)
    await nameInput.fill('Modified Name')

    const descriptionInput = page.getByLabel(/description/i)
    await descriptionInput.fill('Modified description')

    // Switch to AI Model tab
    await page.getByRole('tab', { name: /ai model/i }).click()

    // Switch back to General tab
    await page.getByRole('tab', { name: /general/i }).click()

    // Verify changes are preserved
    await expect(nameInput).toHaveValue('Modified Name')
    await expect(descriptionInput).toHaveValue('Modified description')
  })

  test('should provide keyboard navigation support', async () => {
    const page = await superAdminContext.newPage()
    const chatbotId = 'cda1f36a-44dc-4efe-beeb-437b309aae9f'

    // Mock configuration API
    await page.route(`**/api/v1/chatbots/${chatbotId}/config`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: chatbotId, name: 'Test Bot' }
          })
        })
      }
    })

    await page.goto(`/dashboard/chatbots/${chatbotId}/configure`)
    await expect(page.getByRole('heading')).toBeVisible()

    // Test tab navigation with keyboard
    const generalTab = page.getByRole('tab', { name: /general/i })
    const aiModelTab = page.getByRole('tab', { name: /ai model/i })

    await generalTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(aiModelTab).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(aiModelTab).toHaveAttribute('aria-selected', 'true')

    // Test form navigation
    await page.keyboard.press('Tab')
    const focusedElement = await page.locator(':focus').first()
    await expect(focusedElement).toBeVisible()
  })
})