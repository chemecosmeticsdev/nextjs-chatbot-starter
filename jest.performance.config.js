const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Performance-specific Jest configuration
const performanceJestConfig = {
  displayName: 'performance-tests',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jsdom', // Use jsdom for React component performance tests
  testMatch: [
    '<rootDir>/__tests__/performance/api-performance.test.ts',
    '<rootDir>/__tests__/performance/database-performance.test.ts',
    '<rootDir>/__tests__/performance/load-testing.test.ts'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/'
  ],
  // Performance tests should have longer timeouts
  testTimeout: 60000, // 60 seconds
  // Disable coverage for performance tests to avoid overhead
  collectCoverage: false,
  // Use fewer workers for performance tests to get more accurate measurements
  maxWorkers: 1,
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@testing-library|jose|uuid|nanoid|@aws-sdk))'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Handle static file imports and module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^~/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js'
  },
  // Performance-specific globals
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  },
  // Memory settings for performance tests
  workerIdleMemoryLimit: '512MB',
  // Verbose output for performance debugging
  verbose: true,
  // Use default reporter for performance metrics
  reporters: ['default']
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(performanceJestConfig)