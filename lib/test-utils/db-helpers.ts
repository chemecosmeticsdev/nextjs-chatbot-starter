import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as schema from '../db/schema'

export interface TestDatabaseConfig {
  projectId?: string
  branchId?: string
  databaseUrl?: string
}

export class TestDatabaseManager {
  private static instance: TestDatabaseManager
  private db: any
  private sql: any
  private testBranchId?: string

  private constructor() {}

  static getInstance(): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = new TestDatabaseManager()
    }
    return TestDatabaseManager.instance
  }

  async initializeTestDatabase(config?: TestDatabaseConfig) {
    try {
      // Use test database URL or create test branch
      const databaseUrl = config?.databaseUrl || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

      if (!databaseUrl) {
        throw new Error('No test database URL configured')
      }

      // Create database connection
      this.sql = postgres(databaseUrl, { max: 1 })
      this.db = drizzle(this.sql, { schema })

      // Run migrations if needed (in a real scenario)
      // await migrate(this.db, { migrationsFolder: './drizzle' })

      console.log('✅ Test database initialized')
      return this.db
    } catch (error) {
      console.error('❌ Failed to initialize test database:', error)
      throw error
    }
  }

  getDatabase() {
    if (!this.db) {
      throw new Error('Test database not initialized. Call initializeTestDatabase() first.')
    }
    return this.db
  }

  async cleanDatabase() {
    if (!this.db) return

    try {
      // Clean up test data (in order to respect foreign keys)
      await this.db.delete(schema.activityLogs)
      await this.db.delete(schema.searchQueries)
      await this.db.delete(schema.searchResultsCache)
      await this.db.delete(schema.documentChunks)
      await this.db.delete(schema.documents)
      await this.db.delete(schema.products)
      await this.db.delete(schema.suppliers)
      await this.db.delete(schema.systemSettings)
      await this.db.delete(schema.users)

      console.log('✅ Test database cleaned')
    } catch (error) {
      console.error('❌ Failed to clean test database:', error)
      throw error
    }
  }

  async closeConnection() {
    if (this.sql) {
      await this.sql.end()
      console.log('✅ Test database connection closed')
    }
  }

  // Test data factories
  async createTestUser(userData: Partial<typeof schema.users.$inferInsert> = {}) {
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
      fullName: 'Test User',
      role: 'user',
      isActive: true,
      ...userData
    }

    const [user] = await this.db.insert(schema.users).values(defaultUser).returning()
    return user
  }

  async createTestSuperAdmin(userData: Partial<typeof schema.users.$inferInsert> = {}) {
    return this.createTestUser({
      role: 'super_admin',
      fullName: 'Test Super Admin',
      ...userData
    })
  }

  async createTestSetting(settingData: Partial<typeof schema.systemSettings.$inferInsert> = {}) {
    const defaultSetting = {
      key: `test-setting-${Date.now()}`,
      value: { test: 'value' },
      description: 'Test setting',
      isPublic: false,
      ...settingData
    }

    const [setting] = await this.db.insert(schema.systemSettings).values(defaultSetting).returning()
    return setting
  }

  async createTestDocument(documentData: Partial<typeof schema.documents.$inferInsert>, userId: string) {
    const defaultDocument = {
      title: `Test Document ${Date.now()}`,
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      content: 'Test document content',
      processingStatus: 'completed',
      uploadedBy: userId,
      ...documentData
    }

    const [document] = await this.db.insert(schema.documents).values(defaultDocument).returning()
    return document
  }
}

// Singleton instance for tests
export const testDb = TestDatabaseManager.getInstance()

// Helper functions for common test scenarios
export async function withTestDatabase<T>(
  testFn: (db: any) => Promise<T>,
  config?: TestDatabaseConfig
): Promise<T> {
  const db = await testDb.initializeTestDatabase(config)

  try {
    return await testFn(db)
  } finally {
    await testDb.cleanDatabase()
  }
}

export async function setupTestData() {
  const user = await testDb.createTestUser()
  const superAdmin = await testDb.createTestSuperAdmin()

  return {
    user,
    superAdmin
  }
}

// Mock the Neon MCP functions for testing
export const mockNeonMcp = {
  async createBranch(params: any) {
    return {
      branch: {
        id: `test-branch-${Date.now()}`,
        name: params.branchName || 'test-branch',
        primary: false,
        protected: false
      }
    }
  },

  async runSql(params: { sql: string, projectId: string, branchId?: string }) {
    // Mock SQL execution
    return {
      success: true,
      results: [{ rows: [], fields: [] }]
    }
  },

  async deleteBranch(params: any) {
    return {
      success: true,
      message: `Branch ${params.branchId} deleted`
    }
  }
}

// Jest setup and teardown helpers
export function setupDatabaseTests() {
  beforeAll(async () => {
    await testDb.initializeTestDatabase()
  })

  beforeEach(async () => {
    await testDb.cleanDatabase()
  })

  afterAll(async () => {
    await testDb.closeConnection()
  })
}