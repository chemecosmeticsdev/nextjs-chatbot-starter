import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page before each test
    await page.goto('/login')
  })

  test('should display login form correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Login/)

    // Check form elements are present
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

    // Check form styling and branding
    await expect(page.getByText(/welcome back/i)).toBeVisible()
  })

  test('should show validation errors for empty fields', async ({ page }) => {
    // Click submit without filling fields
    await page.getByRole('button', { name: /sign in/i }).click()

    // Check for validation messages
    await expect(page.getByText(/email is required/i)).toBeVisible()
    await expect(page.getByText(/password is required/i)).toBeVisible()
  })

  test('should validate email format', async ({ page }) => {
    // Enter invalid email
    await page.getByLabel(/email/i).fill('invalid-email')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Check for email format validation
    await expect(page.getByText(/invalid email/i)).toBeVisible()
  })

  test('should handle successful login', async ({ page }) => {
    // Mock successful login response
    await page.route('**/api/v1/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            fullName: 'Test User',
            role: 'user'
          },
          token: 'mock-session-token'
        })
      })
    })

    // Fill form with valid credentials
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('password123')

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard')

    // Check for successful login indicators
    await expect(page.getByText(/Test User/i)).toBeVisible()
  })

  test('should handle login failure', async ({ page }) => {
    // Mock failed login response
    await page.route('**/api/v1/auth/login', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        })
      })
    })

    // Fill form
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should show error message
    await expect(page.getByText(/invalid credentials/i)).toBeVisible()

    // Should remain on login page
    await expect(page).toHaveURL('/login')
  })

  test('should show loading state during submission', async ({ page }) => {
    // Mock delayed response
    await page.route('**/api/v1/auth/login', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })

    // Fill form
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('password123')

    // Submit form
    const submitButton = page.getByRole('button', { name: /sign in/i })
    await submitButton.click()

    // Check loading state
    await expect(submitButton).toBeDisabled()
    await expect(page.getByText(/signing in/i)).toBeVisible()
  })

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i)
    const toggleButton = page.getByRole('button', { name: /toggle password/i })

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password')

    // Click toggle to show password
    await toggleButton.click()
    await expect(passwordInput).toHaveAttribute('type', 'text')

    // Click again to hide password
    await toggleButton.click()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('should handle keyboard navigation', async ({ page }) => {
    const emailInput = page.getByLabel(/email/i)
    const passwordInput = page.getByLabel(/password/i)
    const submitButton = page.getByRole('button', { name: /sign in/i })

    // Tab through form elements
    await emailInput.focus()
    await page.keyboard.press('Tab')
    await expect(passwordInput).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(submitButton).toBeFocused()

    // Enter key should submit form
    await emailInput.fill('test@example.com')
    await passwordInput.fill('password123')

    // Mock response
    await page.route('**/api/v1/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, redirect: '/dashboard' })
      })
    })

    await passwordInput.press('Enter')
    // Form should submit
  })

  test('should prevent multiple form submissions', async ({ page }) => {
    let requestCount = 0

    // Count API calls
    await page.route('**/api/v1/auth/login', async route => {
      requestCount++
      await new Promise(resolve => setTimeout(resolve, 500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })

    // Fill form
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('password123')

    const submitButton = page.getByRole('button', { name: /sign in/i })

    // Click submit multiple times quickly
    await Promise.all([
      submitButton.click(),
      submitButton.click(),
      submitButton.click()
    ])

    // Should only make one request
    expect(requestCount).toBe(1)
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network error
    await page.route('**/api/v1/auth/login', async route => {
      await route.abort('internetdisconnected')
    })

    // Fill and submit form
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should show network error message
    await expect(page.getByText(/network error/i)).toBeVisible()
  })

  test('should clear form on successful submission', async ({ page }) => {
    // Mock successful response
    await page.route('**/api/v1/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, redirect: '/dashboard' })
      })
    })

    const emailInput = page.getByLabel(/email/i)
    const passwordInput = page.getByLabel(/password/i)

    // Fill form
    await emailInput.fill('test@example.com')
    await passwordInput.fill('password123')

    // Submit
    await page.getByRole('button', { name: /sign in/i }).click()

    // Form should be cleared
    await expect(emailInput).toHaveValue('')
    await expect(passwordInput).toHaveValue('')
  })
})

test.describe('Authentication Redirects', () => {
  test('should redirect authenticated users away from login', async ({ page }) => {
    // Mock authenticated session
    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { id: 'test-user', email: 'test@example.com' }
        })
      })
    })

    // Set session cookie
    await page.context().addCookies([
      { name: 'session', value: 'valid-session-token', domain: 'localhost', path: '/' }
    ])

    await page.goto('/login')

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
  })

  test('should redirect to intended page after login', async ({ page }) => {
    // Try to access protected page
    await page.goto('/dashboard/settings')

    // Should redirect to login
    await expect(page).toHaveURL('/login?redirect=/dashboard/settings')

    // Mock successful login
    await page.route('**/api/v1/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { role: 'super_admin' },
          redirect: '/dashboard/settings'
        })
      })
    })

    // Login
    await page.getByLabel(/email/i).fill('admin@example.com')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should redirect to intended page
    await expect(page).toHaveURL('/dashboard/settings')
  })
})