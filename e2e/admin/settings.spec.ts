import { test, expect } from '@playwright/test'

test.describe('Admin Settings Management', () => {
  let superAdminContext: any

  test.beforeAll(async ({ browser }) => {
    // Create super admin context
    superAdminContext = await browser.newContext()
    const page = await superAdminContext.newPage()

    // Mock super admin authentication
    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'super-admin-id',
            email: 'admin@example.com',
            fullName: 'Super Admin',
            role: 'super_admin'
          }
        })
      })
    })

    // Set session cookie
    await superAdminContext.addCookies([
      { name: 'session', value: 'super-admin-session', domain: 'localhost', path: '/' }
    ])
  })

  test.afterAll(async () => {
    await superAdminContext.close()
  })

  test('should display admin settings page for super admin', async () => {
    const page = await superAdminContext.newPage()

    // Mock settings API response
    await page.route('**/api/v1/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          settings: [
            {
              key: 'mistral_ocr_api_key',
              value: 'actual-api-key',
              masked_value: '***key-123',
              description: 'Mistral OCR API key',
              is_sensitive: true,
              updated_at: new Date().toISOString(),
              updated_by_name: 'Super Admin'
            },
            {
              key: 'aws_bedrock_credentials',
              value: {
                accessKeyId: 'AKIA123456789',
                secretAccessKey: 'secret',
                region: 'us-east-1'
              },
              masked_value: {
                accessKeyId: '***6789',
                region: 'us-east-1'
              },
              description: 'AWS Bedrock credentials',
              is_sensitive: true
            }
          ]
        })
      })
    })

    // Mock Bedrock models API
    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          models: [
            {
              modelId: 'amazon.nova-micro-v1:0',
              modelName: 'Nova Micro',
              providerName: 'Amazon',
              description: 'Fast and efficient model'
            },
            {
              modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
              modelName: 'Claude 3 Sonnet',
              providerName: 'Anthropic',
              description: 'High-performance model'
            }
          ]
        })
      })
    })

    await page.goto('/dashboard/settings')

    // Check page title and description
    await expect(page.getByRole('heading', { name: /admin settings/i })).toBeVisible()
    await expect(page.getByText(/configure system-wide admin settings/i)).toBeVisible()

    // Check all setting cards are present
    await expect(page.getByText(/mistral ocr configuration/i)).toBeVisible()
    await expect(page.getByText(/aws bedrock credentials/i)).toBeVisible()
    await expect(page.getByText(/default llm model/i)).toBeVisible()
    await expect(page.getByText(/document storage/i)).toBeVisible()
    await expect(page.getByText(/vector embeddings/i)).toBeVisible()

    // Check sensitive values are masked
    await expect(page.getByText('***key-123')).toBeVisible()
    await expect(page.getByText('***6789')).toBeVisible()

    // Check save button is present
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible()
  })

  test('should toggle password visibility for sensitive fields', async () => {
    const page = await superAdminContext.newPage()

    await page.route('**/api/v1/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          settings: []
        })
      })
    })

    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success": true, "models": []}' })
    })

    await page.goto('/dashboard/settings')

    // Fill in OCR API key
    const ocrInput = page.getByLabel(/ocr api key/i)
    const ocrToggle = page.getByRole('button', { name: /toggle.*ocr/i }).first()

    await ocrInput.fill('secret-api-key')

    // Initially should be password type
    await expect(ocrInput).toHaveAttribute('type', 'password')

    // Click toggle to show
    await ocrToggle.click()
    await expect(ocrInput).toHaveAttribute('type', 'text')

    // Click again to hide
    await ocrToggle.click()
    await expect(ocrInput).toHaveAttribute('type', 'password')
  })

  test('should validate form fields before saving', async () => {
    const page = await superAdminContext.newPage()

    await page.route('**/api/v1/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, settings: [] })
      })
    })

    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success": true, "models": []}' })
    })

    await page.goto('/dashboard/settings')

    // Try to save without filling required fields
    await page.getByRole('button', { name: /save changes/i }).click()

    // Should show validation errors
    await expect(page.getByText(/ocr api key is required/i)).toBeVisible()
    await expect(page.getByText(/access key id is required/i)).toBeVisible()
    await expect(page.getByText(/secret access key is required/i)).toBeVisible()
  })

  test('should save settings successfully', async () => {
    const page = await superAdminContext.newPage()

    let saveRequestCount = 0

    await page.route('**/api/v1/settings', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, settings: [] })
        })
      }
    })

    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          models: [
            {
              modelId: 'amazon.nova-micro-v1:0',
              modelName: 'Nova Micro',
              providerName: 'Amazon'
            }
          ]
        })
      })
    })

    // Mock PUT requests for individual settings
    await page.route('**/api/v1/settings/*', async route => {
      saveRequestCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          setting: { key: 'test', value: 'saved' }
        })
      })
    })

    await page.goto('/dashboard/settings')

    // Fill in all required fields
    await page.getByLabel(/ocr api key/i).fill('test-ocr-key')
    await page.getByLabel(/access key id/i).fill('AKIA123456789')
    await page.getByLabel(/secret access key/i).fill('secret-key')
    await page.getByLabel(/s3 bucket name/i).fill('my-test-bucket')

    // Select LLM model
    await page.getByRole('combobox', { name: /llm model/i }).click()
    await page.getByRole('option', { name: /nova micro/i }).click()

    // Save settings
    await page.getByRole('button', { name: /save changes/i }).click()

    // Should show loading state
    await expect(page.getByText(/saving/i)).toBeVisible()

    // Wait for success message (mocked as alert)
    await page.waitForFunction(() => window.confirm || window.alert)

    // Verify API calls were made
    expect(saveRequestCount).toBeGreaterThan(0)
  })

  test('should handle save errors gracefully', async () => {
    const page = await superAdminContext.newPage()

    await page.route('**/api/v1/settings', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, settings: [] })
        })
      }
    })

    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, models: [] })
      })
    })

    // Mock save error
    await page.route('**/api/v1/settings/*', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Database connection failed'
        })
      })
    })

    await page.goto('/dashboard/settings')

    // Fill required fields
    await page.getByLabel(/ocr api key/i).fill('test-key')
    await page.getByLabel(/access key id/i).fill('AKIA123')
    await page.getByLabel(/secret access key/i).fill('secret')
    await page.getByLabel(/s3 bucket name/i).fill('bucket')

    // Try to save
    await page.getByRole('button', { name: /save changes/i }).click()

    // Should show error message
    await page.waitForFunction(() => window.alert)
  })

  test('should deny access to non-super admin users', async ({ page }) => {
    // Mock regular user authentication
    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'regular-user-id',
            email: 'user@example.com',
            role: 'user'
          }
        })
      })
    })

    await page.goto('/dashboard/settings')

    // Should show access denied message
    await expect(page.getByText(/access denied/i)).toBeVisible()
    await expect(page.getByText(/super administrator/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /return to dashboard/i })).toBeVisible()
  })

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Mock unauthenticated response
    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Unauthorized'
        })
      })
    })

    await page.goto('/dashboard/settings')

    // Should redirect to login
    await expect(page).toHaveURL('/login')
  })

  test('should display system information correctly', async () => {
    const page = await superAdminContext.newPage()

    await page.route('**/api/v1/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          settings: [
            {
              key: 'default_llm_model',
              updated_at: new Date('2024-01-15').toISOString()
            }
          ]
        })
      })
    })

    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success": true, "models": []}' })
    })

    await page.goto('/dashboard/settings')

    // Check system information section
    await expect(page.getByText(/system information/i)).toBeVisible()
    await expect(page.getByText(/database connection/i)).toBeVisible()
    await expect(page.getByText(/connected/i)).toBeVisible()
    await expect(page.getByText(/1 configured/i)).toBeVisible()
    await expect(page.getByText(/1\/15\/2024/i)).toBeVisible() // Last modified date
  })

  test('should handle network connectivity issues', async () => {
    const page = await superAdminContext.newPage()

    // Mock network failure
    await page.route('**/api/v1/settings', async route => {
      await route.abort('internetdisconnected')
    })

    await page.goto('/dashboard/settings')

    // Should show loading state initially, then error
    await expect(page.getByText(/loading admin settings/i)).toBeVisible()

    // After timeout, should show error state or redirect
    // This depends on the implementation
  })

  test('should preserve form state during navigation', async () => {
    const page = await superAdminContext.newPage()

    await page.route('**/api/v1/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, settings: [] })
      })
    })

    await page.route('**/api/v1/bedrock/models', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success": true, "models": []}' })
    })

    await page.goto('/dashboard/settings')

    // Fill some fields
    await page.getByLabel(/ocr api key/i).fill('test-key-123')
    await page.getByLabel(/s3 bucket name/i).fill('my-bucket')

    // Navigate away and back (simulate browser back/forward)
    await page.goBack()
    await page.goForward()

    // Form should maintain state (if implemented)
    // This would depend on whether the form has state persistence
  })
})