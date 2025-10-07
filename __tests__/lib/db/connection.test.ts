import { testDb } from '@/lib/test-utils'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Mock postgres and drizzle
jest.mock('postgres')
jest.mock('drizzle-orm/postgres-js')

const mockSql = {
  end: jest.fn(),
  options: {},
  query: jest.fn(),
  unsafe: jest.fn()
}

const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  execute: jest.fn()
}

describe('Database Connection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(postgres as jest.MockedFunction<typeof postgres>).mockReturnValue(mockSql as any)
    ;(drizzle as jest.MockedFunction<typeof drizzle>).mockReturnValue(mockDb as any)
  })

  describe('Connection Management', () => {
    it('establishes connection with correct parameters', () => {
      const databaseUrl = 'postgresql://test:test@localhost:5432/test_db'
      process.env.DATABASE_URL = databaseUrl

      // Mock the connection module
      const connection = require('@/lib/db/connection')

      expect(postgres).toHaveBeenCalledWith(
        databaseUrl,
        expect.objectContaining({
          ssl: expect.any(Object),
          max: expect.any(Number),
          idle_timeout: expect.any(Number),
          connect_timeout: expect.any(Number)
        })
      )

      expect(drizzle).toHaveBeenCalledWith(mockSql, expect.any(Object))
    })

    it('uses SSL configuration for production', () => {
      process.env.NODE_ENV = 'production'
      process.env.DATABASE_URL = 'postgresql://prod:prod@prod-host:5432/prod_db'

      const connection = require('@/lib/db/connection')

      expect(postgres).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ssl: { rejectUnauthorized: false }
        })
      )
    })

    it('disables SSL for development', () => {
      process.env.NODE_ENV = 'development'
      process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5432/dev_db'

      const connection = require('@/lib/db/connection')

      expect(postgres).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ssl: false
        })
      )
    })

    it('throws error when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL

      expect(() => {
        require('@/lib/db/connection')
      }).toThrow('DATABASE_URL environment variable is required')
    })

    it('configures connection pool correctly', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'

      const connection = require('@/lib/db/connection')

      expect(postgres).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          max: 20, // Default max connections
          idle_timeout: 30, // Seconds
          connect_timeout: 10 // Seconds
        })
      )
    })
  })

  describe('Connection Health', () => {
    it('can test connection health', async () => {
      mockDb.execute.mockResolvedValue([{ now: new Date() }])

      // Assuming there's a health check function
      const { testConnection } = require('@/lib/db/connection')

      const isHealthy = await testConnection()

      expect(isHealthy).toBe(true)
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('SELECT'))
    })

    it('handles connection failures gracefully', async () => {
      mockDb.execute.mockRejectedValue(new Error('Connection failed'))

      const { testConnection } = require('@/lib/db/connection')

      const isHealthy = await testConnection()

      expect(isHealthy).toBe(false)
    })

    it('retries connection on initial failure', async () => {
      let callCount = 0
      mockDb.execute
        .mockImplementationOnce(() => {
          callCount++
          return Promise.reject(new Error('Connection timeout'))
        })
        .mockImplementationOnce(() => {
          callCount++
          return Promise.resolve([{ now: new Date() }])
        })

      const { testConnection } = require('@/lib/db/connection')

      const isHealthy = await testConnection()

      expect(isHealthy).toBe(true)
      expect(callCount).toBe(2)
    })
  })

  describe('Connection Cleanup', () => {
    it('properly closes connection on shutdown', async () => {
      const { closeConnection } = require('@/lib/db/connection')

      await closeConnection()

      expect(mockSql.end).toHaveBeenCalled()
    })

    it('handles cleanup errors gracefully', async () => {
      mockSql.end.mockRejectedValue(new Error('Cleanup failed'))

      const { closeConnection } = require('@/lib/db/connection')

      await expect(closeConnection()).resolves.not.toThrow()
    })

    it('prevents multiple cleanup calls', async () => {
      const { closeConnection } = require('@/lib/db/connection')

      await closeConnection()
      await closeConnection()

      expect(mockSql.end).toHaveBeenCalledTimes(1)
    })
  })

  describe('Environment-specific Configuration', () => {
    it('uses different pool sizes for different environments', () => {
      const testCases = [
        { env: 'test', expectedMax: 5 },
        { env: 'development', expectedMax: 10 },
        { env: 'production', expectedMax: 20 }
      ]

      testCases.forEach(({ env, expectedMax }) => {
        jest.clearAllMocks()
        process.env.NODE_ENV = env
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'

        const connection = require('@/lib/db/connection')

        expect(postgres).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            max: expectedMax
          })
        )
      })
    })

    it('enables query logging in development', () => {
      process.env.NODE_ENV = 'development'
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'

      const connection = require('@/lib/db/connection')

      expect(drizzle).toHaveBeenCalledWith(
        mockSql,
        expect.objectContaining({
          logger: expect.any(Object)
        })
      )
    })

    it('disables query logging in production', () => {
      process.env.NODE_ENV = 'production'
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'

      const connection = require('@/lib/db/connection')

      expect(drizzle).toHaveBeenCalledWith(
        mockSql,
        expect.objectContaining({
          logger: false
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('handles invalid connection strings', () => {
      process.env.DATABASE_URL = 'invalid-connection-string'

      expect(() => {
        require('@/lib/db/connection')
      }).toThrow()
    })

    it('handles network timeouts', async () => {
      mockDb.execute.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ETIMEDOUT')), 100)
        )
      )

      const { testConnection } = require('@/lib/db/connection')

      const startTime = Date.now()
      const isHealthy = await testConnection()
      const duration = Date.now() - startTime

      expect(isHealthy).toBe(false)
      expect(duration).toBeGreaterThan(50) // Should have waited for timeout
    })

    it('handles SSL certificate errors', async () => {
      mockSql.query.mockRejectedValue(new Error('SSL certificate problem'))

      const { testConnection } = require('@/lib/db/connection')

      const isHealthy = await testConnection()

      expect(isHealthy).toBe(false)
    })
  })

  describe('Connection Monitoring', () => {
    it('tracks connection metrics', async () => {
      const { getConnectionMetrics } = require('@/lib/db/connection')

      mockDb.execute.mockResolvedValue([{
        active_connections: 5,
        idle_connections: 2,
        max_connections: 20
      }])

      const metrics = await getConnectionMetrics()

      expect(metrics).toMatchObject({
        active: 5,
        idle: 2,
        max: 20,
        utilization: expect.any(Number)
      })
    })

    it('calculates connection utilization correctly', async () => {
      const { getConnectionMetrics } = require('@/lib/db/connection')

      mockDb.execute.mockResolvedValue([{
        active_connections: 10,
        idle_connections: 5,
        max_connections: 20
      }])

      const metrics = await getConnectionMetrics()

      expect(metrics.utilization).toBe(0.75) // (10 + 5) / 20 = 0.75
    })
  })
})