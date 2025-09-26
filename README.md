# Chatbot v1

A Next.js chatbot application with AWS Bedrock integration and comprehensive testing suite.

## Testing

This project includes comprehensive testing coverage:

### Unit & Integration Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests for CI (no watch, with coverage)
npm run test:ci
```

### End-to-End Tests
```bash
# Install Playwright browsers (first time only)
npm run playwright:install

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e-ui

# Debug E2E tests
npm run test:e2e-debug
```

### Performance Tests
```bash
# Run performance-specific tests
npm run test:performance
```

### Run All Tests
```bash
# Run both unit/integration and E2E tests
npm run test:all
```

## Test Structure

- `__tests__/` - Unit and integration tests
  - `components/` - React component tests
  - `api/` - API route tests
  - `lib/` - Utility and service tests
  - `performance/` - Performance benchmarks
  - `security/` - Security tests
- `e2e/` - End-to-end tests
  - `auth/` - Authentication flows
  - `dashboard/` - Dashboard navigation and features
  - `admin/` - Admin-specific functionality
- `lib/test-utils/` - Shared test utilities and helpers

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Type check
npm run type-check
```

## CI/CD

The project includes GitHub Actions workflows for:
- Linting and type checking
- Unit and integration tests with coverage
- End-to-end tests with Playwright
- Performance testing
- Security scanning