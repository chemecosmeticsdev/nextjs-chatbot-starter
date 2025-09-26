import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => {
  const actual = jest.requireActual('next/navigation')
  return {
    ...actual,
    useRouter: jest.fn(() => ({
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    })),
    useSearchParams: jest.fn(() => ({
      get: jest.fn(),
      getAll: jest.fn(),
    })),
    usePathname: jest.fn(() => '/'),
    redirect: jest.fn(),
    notFound: jest.fn(),
  }
})

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    theme: 'light',
    setTheme: jest.fn(),
    systemTheme: 'light',
    themes: ['light', 'dark'],
  })),
  ThemeProvider: ({ children }) => children,
}))

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.NEXTAUTH_SECRET = 'test-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.NODE_ENV = 'test'

// Global test utilities
global.fetch = jest.fn()

// Mock console methods in tests to reduce noise
const originalError = console.error
const originalWarn = console.warn

beforeEach(() => {
  console.error = jest.fn()
  console.warn = jest.fn()
})

afterEach(() => {
  console.error = originalError
  console.warn = originalWarn
  jest.clearAllMocks()
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback
  }
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock scroll methods
global.scrollTo = jest.fn()
global.scroll = jest.fn()

// Extend Jest matchers
expect.extend({
  toBeInTheDocument(received) {
    const pass = received && received.ownerDocument && received.ownerDocument.body.contains(received)

    if (pass) {
      return {
        message: () => `expected element not to be in the document`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected element to be in the document`,
        pass: false,
      }
    }
  },
})