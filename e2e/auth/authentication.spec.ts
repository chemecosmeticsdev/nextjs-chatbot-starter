import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('/dashboard')

    // Should be redirected to login page
    await expect(page).toHaveURL('/login')
    expect(page.locator('h1')).toContainText('Sign In')
  })

  test('should allow user to log in with valid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill in login form
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')

    // Submit form
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText('Invalid credentials')
  })

  test('should allow user to log out', async ({ page }) => {
    // First log in
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    // Wait for dashboard to load
    await expect(page).toHaveURL('/dashboard')

    // Find and click logout button in sidebar
    await page.click('[data-testid="user-menu"]')
    await page.click('button:has-text("Sign Out")')

    // Should redirect to login
    await expect(page).toHaveURL('/login')
  })

  test('should persist session across page reloads', async ({ page }) => {
    // Log in
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/dashboard')

    // Reload page
    await page.reload()

    // Should still be on dashboard
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
  })
})