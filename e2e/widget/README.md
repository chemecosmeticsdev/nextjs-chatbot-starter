# Widget System E2E Tests

This directory contains end-to-end tests for the JavaScript Widget System using Playwright.

## Test Files

### 1. widget-builder.spec.ts
Comprehensive tests for the Widget Builder interface covering:
- Widget configuration loading and display
- Design customization (theme, colors, fonts, layout)
- Behavior settings (greeting messages, auto-open, typing indicators)
- Security settings (allowed domains, rate limiting, CSRF protection)
- Embed code generation and download
- Analytics settings and statistics display
- Live preview functionality
- Configuration save/update operations
- Error handling

### 2. widget-preview.spec.ts
Tests for widget preview and runtime functionality:
- Widget preview page rendering
- Theme configuration application
- Widget bubble interaction (open/close)
- Greeting message display
- Typing indicator visibility
- Widget positioning
- Message input and submission
- Powered-by branding display
- Mobile viewport responsiveness
- Widget loader script functionality
- Chat conversation flow
- Error handling in chat interface

### 3. widget-integration-flow.spec.ts
Complete user journey tests covering:
- Dashboard to widget setup navigation
- Full widget configuration workflow
- Real-time preview updates
- Analytics and performance tracking
- Widget deployment workflow (draft to published)
- Security settings validation
- Domain restriction configuration
- End-to-end integration from dashboard to embed code

## Running the Tests

### Prerequisites
Ensure Playwright browsers are installed:
```bash
npm run playwright:install
```

### Run All Widget Tests
```bash
# Run all widget tests
npx playwright test e2e/widget/

# Run in UI mode for debugging
npm run test:e2e-ui -- e2e/widget/

# Run in debug mode
npm run test:e2e-debug -- e2e/widget/
```

### Run Specific Test Files
```bash
# Run only builder tests
npx playwright test e2e/widget/widget-builder.spec.ts

# Run only preview tests
npx playwright test e2e/widget/widget-preview.spec.ts

# Run only integration flow tests
npx playwright test e2e/widget/widget-integration-flow.spec.ts
```

### Run Specific Test Suites
```bash
# Run only widget configuration tests
npx playwright test -g "Widget Builder - Configuration and Setup"

# Run only preview tests
npx playwright test -g "Widget Preview and Embed Testing"

# Run only integration journey tests
npx playwright test -g "Widget Integration - Complete User Journey"
```

### Run Tests in Different Browsers
```bash
# Run in chromium only
npx playwright test e2e/widget/ --project=chromium

# Run in firefox only
npx playwright test e2e/widget/ --project=firefox

# Run in webkit (Safari) only
npx playwright test e2e/widget/ --project=webkit

# Run in mobile chrome
npx playwright test e2e/widget/ --project="Mobile Chrome"
```

### Debug Tests
```bash
# Run with headed browser (visible)
npx playwright test e2e/widget/ --headed

# Run with Playwright Inspector
npx playwright test e2e/widget/ --debug

# Run in UI mode for interactive debugging
npx playwright test e2e/widget/ --ui
```

## Test Structure

Each test file follows this structure:

```typescript
test.describe('Test Suite Name', () => {
  // Setup runs before each test
  test.beforeEach(async ({ page }) => {
    // Mock API endpoints
    // Login user
    // Navigate to starting page
  });

  test('individual test case', async ({ page }) => {
    // Test implementation
  });
});
```

## Mocking Strategy

All tests use route mocking to simulate API responses:

```typescript
await page.route('**/api/v1/chatbots/:id/integrations/widget', (route) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ /* mock data */ })
  });
});
```

This ensures:
- Tests run independently of backend state
- Consistent test data
- Fast test execution
- No database modifications during tests

## Test Coverage

### Widget Builder Tests Cover:
- ✅ Page loading and initial state
- ✅ Design tab functionality
- ✅ Behavior tab functionality
- ✅ Security tab functionality
- ✅ Code generation tab
- ✅ Analytics tab
- ✅ Live preview display
- ✅ Configuration save operations
- ✅ Navigation and breadcrumbs
- ✅ Error handling

### Widget Preview Tests Cover:
- ✅ Preview page rendering
- ✅ Widget bubble styling
- ✅ Widget open/close interactions
- ✅ Message display and input
- ✅ Chat functionality
- ✅ Mobile responsiveness
- ✅ Loader script functionality
- ✅ Error handling

### Integration Flow Tests Cover:
- ✅ Complete user journey
- ✅ Dashboard navigation
- ✅ Full configuration workflow
- ✅ Code generation
- ✅ Analytics tracking
- ✅ Deployment workflow
- ✅ Security configuration

## Key Testing Patterns

### 1. Element Selection
Tests use flexible selectors to handle dynamic content:
```typescript
// Try multiple selector strategies
const element = page.locator('[data-testid="element"], .class-name, text=Label').first();
```

### 2. Conditional Testing
Tests check element existence before interaction:
```typescript
if (await element.count() > 0) {
  await element.click();
}
```

### 3. Waiting Strategies
Tests use appropriate wait strategies:
```typescript
// Wait for network idle
await page.waitForLoadState('networkidle');

// Wait for specific element
await expect(element).toBeVisible({ timeout: 5000 });

// Wait for timeout (use sparingly)
await page.waitForTimeout(500);
```

## Troubleshooting

### Tests Failing Due to Timeouts
Increase timeout in individual tests:
```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // test code
});
```

### Element Not Found Errors
1. Check if element selector matches your implementation
2. Verify element is visible before interaction
3. Add appropriate waits
4. Check if element is in a different tab or frame

### Mock Not Working
1. Verify route pattern matches actual API calls
2. Check if route is set up before navigation
3. Ensure mock data structure matches expected format

### Preview Tests Not Working
Preview tests depend on the actual implementation of:
- `/integrations/widget/:id/preview` page
- `/integrations/widget/:id/chat` page
- Widget loader script at `/api/integrations/widget/:id/loader.js`

Adjust selectors and expectations based on your implementation.

## CI/CD Integration

These tests are configured to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Install Playwright
  run: npm run playwright:install

- name: Run Widget E2E Tests
  run: npm run test:e2e -- e2e/widget/
```

## Best Practices

1. **Keep tests independent**: Each test should be able to run in isolation
2. **Use descriptive test names**: Test names should clearly describe what is being tested
3. **Mock external dependencies**: Don't rely on external services or databases
4. **Clean up after tests**: Use `afterEach` hooks to clean up any state
5. **Use data-testid attributes**: Add these to your components for reliable selectors
6. **Avoid hard waits**: Use Playwright's auto-waiting features instead of `waitForTimeout`
7. **Test user workflows**: Focus on testing complete user journeys, not just individual features

## Adding New Tests

To add new widget tests:

1. Create a new test file or add to existing file
2. Set up necessary mocks in `beforeEach`
3. Write test cases following existing patterns
4. Run tests locally to verify
5. Update this README with new test coverage

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Playwright Selectors](https://playwright.dev/docs/selectors)
