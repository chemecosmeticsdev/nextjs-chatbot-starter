import { chromium, FullConfig } from '@playwright/test'
import { mcp__neon__create_branch } from '../lib/test-db-setup'

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting Playwright global setup...')

  // Create a test database branch in Neon
  try {
    const testBranch = await mcp__neon__create_branch({
      params: {
        projectId: 'orange-credit-10889790',
        branchName: `test-e2e-${Date.now()}`
      }
    })

    // Store branch ID for cleanup
    process.env.TEST_BRANCH_ID = testBranch.branch.id
    console.log(`✅ Created test database branch: ${testBranch.branch.id}`)
  } catch (error) {
    console.warn('⚠️ Could not create test database branch:', error)
  }

  // Setup auth state if needed
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // You can add authentication setup here if needed
    // await page.goto('/login')
    // await page.fill('[name="email"]', 'test@example.com')
    // await page.fill('[name="password"]', 'testpassword')
    // await page.click('[type="submit"]')
    // await page.waitForURL('/dashboard')
    // await context.storageState({ path: 'e2e/auth-state.json' })
  } catch (error) {
    console.warn('⚠️ Auth setup failed:', error)
  }

  await browser.close()
  console.log('✅ Playwright global setup completed')
}

export default globalSetup