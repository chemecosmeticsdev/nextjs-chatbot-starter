# Widget System Testing Guide

This guide provides comprehensive information about the Playwright testing setup for the JavaScript Widget System.

## Overview

The widget system testing suite provides end-to-end testing coverage for:
- Widget configuration and customization
- Widget preview and runtime behavior
- Complete user workflows from dashboard to deployment
- Widget embed code generation
- Security and analytics features

## Quick Start

### 1. Install Dependencies
```bash
# Install Playwright browsers (first time only)
npm run playwright:install

# Verify installation
npx playwright --version
```

### 2. Run All Widget Tests
```bash
# Run all widget tests
npm run test:e2e -- e2e/widget/

# Run in UI mode (recommended for development)
npm run test:e2e-ui -- e2e/widget/

# Run in debug mode
npm run test:e2e-debug -- e2e/widget/
```

### 3. Run Specific Test File
```bash
# Widget builder tests
npx playwright test e2e/widget/widget-builder.spec.ts

# Widget preview tests
npx playwright test e2e/widget/widget-preview.spec.ts

# Integration flow tests
npx playwright test e2e/widget/widget-integration-flow.spec.ts
```

## Test Files Structure

```
e2e/
└── widget/
    ├── README.md                          # Detailed testing documentation
    ├── widget-builder.spec.ts             # Widget builder UI tests (13 tests)
    ├── widget-preview.spec.ts             # Widget preview & chat tests (15 tests)
    └── widget-integration-flow.spec.ts    # Complete user journey tests (7 tests)
```

## Test Coverage

### Widget Builder Tests (widget-builder.spec.ts)
**13 comprehensive tests covering:**

1. **Page Loading & Display**
   - Initial configuration loading
   - Tab navigation (Design, Behavior, Security, Code, Analytics)
   - Live preview panel display
   - Breadcrumb navigation

2. **Design Configuration**
   - Theme color customization (primary, background, text)
   - Font family selection
   - Border radius adjustment
   - Widget positioning (bottom-right, bottom-left, top-right, top-left)
   - Bubble style selection (circle, rounded, square)
   - Widget dimensions (width, height, margin)
   - Branding customization (bot name, company name, avatar)

3. **Behavior Settings**
   - Greeting message configuration
   - Placeholder text customization
   - Auto-open toggle and delay setting
   - Typing indicator toggle
   - Sound notifications toggle
   - Persistent sessions toggle

4. **Security Configuration**
   - Allowed domains management (add/remove)
   - Rate limiting toggle and configuration
   - CSRF protection toggle
   - API key display and copy functionality

5. **Code Generation**
   - Embed code generation
   - Code copy to clipboard
   - Code download as HTML file
   - Installation instructions display

6. **Analytics Settings**
   - Event tracking toggle
   - User behavior tracking toggle
   - Session recording toggle
   - Widget performance statistics display
   - Conversion rate and engagement metrics

7. **Preview Functionality**
   - Live preview display
   - Preview refresh capability
   - Real-time configuration updates
   - Desktop/mobile view toggle

8. **Configuration Management**
   - Save configuration with success feedback
   - Error handling for save failures
   - API error handling with user feedback

9. **Navigation**
   - Quick actions (playground, preview, publish)
   - Breadcrumb navigation
   - Back to integrations navigation

### Widget Preview Tests (widget-preview.spec.ts)
**15 tests covering:**

1. **Preview Page Rendering**
   - Preview page loading
   - Widget bubble display
   - Theme configuration application

2. **Widget Interaction**
   - Bubble click to open/close widget
   - Chat window visibility
   - Greeting message display
   - Bot name display

3. **Visual Elements**
   - Typing indicator animation
   - Powered-by branding
   - Widget positioning verification

4. **Chat Functionality**
   - Message input and submission
   - Conversation flow maintenance
   - Message history display
   - Error handling for chat failures
   - Conversation reset functionality

5. **Responsive Design**
   - Mobile viewport adaptation
   - Window size adjustments

6. **Widget Loader**
   - Loader script execution
   - Widget API availability
   - Error handling for loader failures

### Integration Flow Tests (widget-integration-flow.spec.ts)
**7 comprehensive workflow tests:**

1. **Dashboard to Widget Setup**
   - Complete navigation path from dashboard
   - Chatbot selection
   - Integrations page access
   - Widget builder initialization

2. **Complete Configuration Workflow**
   - Design settings configuration
   - Behavior settings configuration
   - Security settings configuration
   - Configuration save
   - Embed code generation and download

3. **Real-time Preview Updates**
   - Preview reflects configuration changes
   - Preview refresh functionality
   - Multi-tab configuration updates

4. **Analytics & Performance Tracking**
   - Analytics settings display
   - Widget statistics display
   - Performance metrics tracking

5. **Widget Deployment**
   - Draft to published workflow
   - Status updates
   - Code availability after publish

6. **Security Validation**
   - Domain restrictions
   - Rate limiting configuration
   - CSRF protection verification
   - API key security

## Running Tests

### Development Mode
```bash
# Interactive UI mode (best for development)
npm run test:e2e-ui -- e2e/widget/

# Watch mode (auto-runs on file changes)
npx playwright test e2e/widget/ --ui
```

### CI/CD Mode
```bash
# Run all tests with retries
npm run test:e2e -- e2e/widget/

# Generate HTML report
npx playwright test e2e/widget/ --reporter=html
```

### Debugging
```bash
# Run with Playwright Inspector
npx playwright test e2e/widget/ --debug

# Run headed (visible browser)
npx playwright test e2e/widget/ --headed

# Slow motion for observation
npx playwright test e2e/widget/ --headed --slow-mo=1000
```

### Browser-Specific Testing
```bash
# Test in Chromium only
npx playwright test e2e/widget/ --project=chromium

# Test in Firefox
npx playwright test e2e/widget/ --project=firefox

# Test in WebKit (Safari)
npx playwright test e2e/widget/ --project=webkit

# Test on Mobile Chrome
npx playwright test e2e/widget/ --project="Mobile Chrome"

# Test on Mobile Safari
npx playwright test e2e/widget/ --project="Mobile Safari"
```

## Test Configuration

The tests use the main Playwright configuration in `playwright.config.ts`:

```typescript
{
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: ['html', 'json', 'junit'],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000
  }
}
```

## Mocking Strategy

All tests use comprehensive API mocking to ensure:
- **Independence**: Tests don't depend on backend state
- **Speed**: No real API calls or database operations
- **Reliability**: Consistent test data
- **Isolation**: No side effects between tests

### Example Mock Setup
```typescript
await page.route('**/api/v1/chatbots/:id/integrations/widget', (route) => {
  if (route.request().method() === 'GET') {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ /* mock response */ })
    });
  }
});
```

## Best Practices

### 1. Element Selection
Use flexible, resilient selectors:
```typescript
// Good: Multiple fallback strategies
const element = page.locator('[data-testid="button"], button:has-text("Submit")').first();

// Avoid: Brittle CSS selectors
const element = page.locator('.class1 .class2 > div:nth-child(3)');
```

### 2. Waiting Strategies
Use Playwright's auto-waiting:
```typescript
// Good: Auto-waiting with expect
await expect(element).toBeVisible();

// Avoid: Manual waits
await page.waitForTimeout(5000);
```

### 3. Test Independence
Each test should work in isolation:
```typescript
test.beforeEach(async ({ page }) => {
  // Set up fresh state for each test
  await page.route('**/api/**', mockHandler);
  await loginUser(page);
});
```

### 4. Descriptive Test Names
```typescript
// Good: Clear description of what is tested
test('should display error message when API fails to save configuration', ...);

// Avoid: Vague descriptions
test('test save error', ...);
```

## Troubleshooting

### Common Issues

**1. Element Not Found**
- Verify element exists in your implementation
- Check selector syntax
- Add appropriate waits
- Verify element is not in a different tab/iframe

**2. Test Timeouts**
- Increase timeout for slow operations
- Check if API mocks are set up correctly
- Verify navigation waits

**3. Flaky Tests**
- Add explicit waits for dynamic content
- Use `waitForLoadState('networkidle')`
- Check for race conditions

**4. Mock Not Working**
- Verify route pattern matches actual API calls
- Ensure mocks are set up before navigation
- Check mock data structure

### Debug Commands
```bash
# Show browser console logs
PWDEBUG=console npx playwright test e2e/widget/

# Trace viewer for failed tests
npx playwright show-trace trace.zip

# Take screenshots on all steps
npx playwright test e2e/widget/ --screenshot=on
```

## Continuous Integration

### GitHub Actions Example
```yaml
name: Widget E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e -- e2e/widget/
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Adding New Tests

1. **Create Test File**
   ```bash
   touch e2e/widget/new-feature.spec.ts
   ```

2. **Follow Existing Patterns**
   ```typescript
   import { test, expect } from '@playwright/test';

   test.describe('New Feature', () => {
     test.beforeEach(async ({ page }) => {
       // Setup
     });

     test('should do something', async ({ page }) => {
       // Test implementation
     });
   });
   ```

3. **Add Mocks**
   ```typescript
   await page.route('**/api/new-endpoint', mockHandler);
   ```

4. **Run Tests**
   ```bash
   npx playwright test e2e/widget/new-feature.spec.ts
   ```

5. **Update Documentation**
   - Add test coverage to this guide
   - Update e2e/widget/README.md

## Test Metrics

Current test suite includes:
- **35 total tests** across 3 files
- **~10 minutes** total execution time (all browsers)
- **~2 minutes** per browser
- **100+ user interactions** tested
- **50+ API endpoints** mocked

## Next Steps

1. **Expand Coverage**
   - Add tests for error scenarios
   - Add tests for edge cases
   - Add performance tests

2. **Improve Reliability**
   - Replace hard waits with smart waits
   - Add data-testid attributes to components
   - Implement page object models

3. **Visual Testing**
   - Add screenshot comparisons
   - Add visual regression tests
   - Add accessibility tests

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Widget System Documentation](./e2e/widget/README.md)
- [Project Playwright Config](./playwright.config.ts)
- [Test Best Practices](https://playwright.dev/docs/best-practices)

## Support

For issues or questions about the widget testing setup:
1. Check existing test examples in `e2e/widget/`
2. Review Playwright documentation
3. Check test output and error messages
4. Use Playwright UI mode for debugging
