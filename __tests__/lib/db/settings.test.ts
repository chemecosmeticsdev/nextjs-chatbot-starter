import { testDb, withTestDatabase, setupTestData } from '@/lib/test-utils'
import { DrizzleSettingsService } from '@/lib/db/settings'

describe('DrizzleSettingsService', () => {
  // Use the test database helpers
  beforeAll(async () => {
    await testDb.initializeTestDatabase()
  })

  beforeEach(async () => {
    await testDb.cleanDatabase()
  })

  afterAll(async () => {
    await testDb.closeConnection()
  })

  describe('getAdminSettings', () => {
    it('returns all admin settings with masked sensitive values', async () => {
      await withTestDatabase(async (db) => {
        // Create test user and settings
        const { superAdmin } = await setupTestData()

        await testDb.createTestSetting({
          key: 'mistral_ocr_api_key',
          value: { apiKey: 'secret-api-key-12345' },
          description: 'Mistral OCR API key',
          updatedBy: superAdmin.id
        })

        await testDb.createTestSetting({
          key: 'aws_bedrock_credentials',
          value: {
            accessKeyId: 'AKIA1234567890',
            secretAccessKey: 'very-secret-key',
            region: 'us-east-1'
          },
          description: 'AWS Bedrock credentials',
          updatedBy: superAdmin.id
        })

        const settings = await DrizzleSettingsService.getAdminSettings()

        expect(settings).toHaveLength(2)

        const mistralSetting = settings.find(s => s.key === 'mistral_ocr_api_key')
        expect(mistralSetting).toBeDefined()
        expect(mistralSetting?.is_sensitive).toBe(true)
        expect(mistralSetting?.masked_value).toContain('***')
        expect(mistralSetting?.masked_value).not.toContain('secret-api-key-12345')

        const awsSetting = settings.find(s => s.key === 'aws_bedrock_credentials')
        expect(awsSetting).toBeDefined()
        expect(awsSetting?.is_sensitive).toBe(true)
        expect(awsSetting?.masked_value?.accessKeyId).toContain('***')
        expect(awsSetting?.masked_value?.region).toBe('us-east-1') // Region is not sensitive
      })
    })

    it('returns empty array when no settings exist', async () => {
      const settings = await DrizzleSettingsService.getAdminSettings()
      expect(settings).toEqual([])
    })

    it('includes user information for settings', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        await testDb.createTestSetting({
          key: 'default_llm_model',
          value: 'amazon.nova-micro-v1:0',
          description: 'Default LLM model',
          updatedBy: superAdmin.id
        })

        const settings = await DrizzleSettingsService.getAdminSettings()
        const setting = settings[0]

        expect(setting.updated_by_name).toBe(superAdmin.fullName)
      })
    })
  })

  describe('createOrUpdateSetting', () => {
    it('creates a new setting', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const setting = await DrizzleSettingsService.createOrUpdateSetting(
          'mistral_ocr_api_key',
          'new-api-key-123',
          'New Mistral API key',
          false,
          superAdmin.id
        )

        expect(setting).toBeDefined()
        expect(setting.key).toBe('mistral_ocr_api_key')
        expect(setting.value).toBe('new-api-key-123')
        expect(setting.description).toBe('New Mistral API key')
        expect(setting.updatedBy).toBe(superAdmin.id)
      })
    })

    it('updates an existing setting', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        // Create initial setting
        await testDb.createTestSetting({
          key: 'default_llm_model',
          value: 'old-model',
          description: 'Old model',
          updatedBy: superAdmin.id
        })

        // Update the setting
        const updatedSetting = await DrizzleSettingsService.createOrUpdateSetting(
          'default_llm_model',
          'amazon.nova-micro-v1:0',
          'Updated LLM model',
          false,
          superAdmin.id
        )

        expect(updatedSetting.value).toBe('amazon.nova-micro-v1:0')
        expect(updatedSetting.description).toBe('Updated LLM model')
        expect(updatedSetting.updatedAt).toBeDefined()
      })
    })

    it('handles complex object values', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const awsCredentials = {
          accessKeyId: 'AKIA1234567890',
          secretAccessKey: 'secret-key',
          region: 'us-east-1'
        }

        const setting = await DrizzleSettingsService.createOrUpdateSetting(
          'aws_bedrock_credentials',
          awsCredentials,
          'AWS Bedrock credentials',
          false,
          superAdmin.id
        )

        expect(setting.value).toEqual(awsCredentials)
        expect(typeof setting.value).toBe('object')
      })
    })

    it('validates admin setting keys', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        await expect(
          DrizzleSettingsService.createOrUpdateSetting(
            'invalid_key' as any,
            'value',
            'description',
            false,
            superAdmin.id
          )
        ).rejects.toThrow()
      })
    })
  })

  describe('logSettingActivity', () => {
    it('logs setting activity with proper metadata', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        await DrizzleSettingsService.logSettingActivity(
          superAdmin.id,
          'setting_update',
          'mistral_ocr_api_key',
          '192.168.1.1',
          'Mozilla/5.0 Test Browser'
        )

        // Verify activity was logged (you'd need to implement getActivityLogs or similar)
        // This is a simplified check
        const db = testDb.getDatabase()
        const activities = await db.select().from(schema.activityLogs)

        expect(activities).toHaveLength(1)
        expect(activities[0].userId).toBe(superAdmin.id)
        expect(activities[0].activityType).toBe('setting_update')
        expect(activities[0].entityType).toBe('system_setting')
        expect(activities[0].entityId).toBe('mistral_ocr_api_key')
        expect(activities[0].ipAddress).toBe('192.168.1.1')
        expect(activities[0].userAgent).toBe('Mozilla/5.0 Test Browser')
      })
    })

    it('handles missing optional parameters', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        await expect(
          DrizzleSettingsService.logSettingActivity(
            superAdmin.id,
            'setting_create',
            'default_llm_model'
            // IP and user agent are optional
          )
        ).resolves.not.toThrow()
      })
    })
  })

  describe('maskSensitiveValue', () => {
    it('masks string values correctly', async () => {
      const masked = DrizzleSettingsService.maskSensitiveValue(
        'secret-api-key-12345',
        'mistral_ocr_api_key'
      )

      expect(masked).toContain('***')
      expect(masked).not.toContain('secret-api-key-12345')
      expect(masked.length).toBeGreaterThan(3) // Should show some characters
    })

    it('masks AWS credentials object correctly', async () => {
      const credentials = {
        accessKeyId: 'AKIA1234567890',
        secretAccessKey: 'very-secret-key',
        region: 'us-east-1'
      }

      const masked = DrizzleSettingsService.maskSensitiveValue(
        credentials,
        'aws_bedrock_credentials'
      )

      expect(masked.accessKeyId).toContain('***')
      expect(masked.accessKeyId).not.toContain('AKIA1234567890')
      expect(masked.secretAccessKey).toBe('***masked***')
      expect(masked.region).toBe('us-east-1') // Region should not be masked
    })

    it('returns original value for non-sensitive settings', async () => {
      const value = 'amazon.nova-micro-v1:0'
      const masked = DrizzleSettingsService.maskSensitiveValue(value, 'default_llm_model')

      expect(masked).toBe(value)
    })

    it('handles null and undefined values', async () => {
      expect(DrizzleSettingsService.maskSensitiveValue(null, 'mistral_ocr_api_key')).toBe(null)
      expect(DrizzleSettingsService.maskSensitiveValue(undefined, 'mistral_ocr_api_key')).toBe(undefined)
    })
  })

  describe('Database Constraints and Validation', () => {
    it('enforces unique setting keys', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        // Create first setting
        await testDb.createTestSetting({
          key: 'mistral_ocr_api_key',
          value: 'first-key',
          updatedBy: superAdmin.id
        })

        // Attempt to create duplicate key should work (upsert behavior)
        await expect(
          testDb.createTestSetting({
            key: 'mistral_ocr_api_key',
            value: 'second-key',
            updatedBy: superAdmin.id
          })
        ).resolves.not.toThrow()
      })
    })

    it('requires valid user reference', async () => {
      await withTestDatabase(async (db) => {
        await expect(
          testDb.createTestSetting({
            key: 'test_setting',
            value: 'value',
            updatedBy: 'non-existent-user-id'
          })
        ).rejects.toThrow() // Foreign key constraint
      })
    })

    it('handles JSON value serialization correctly', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const complexValue = {
          nested: {
            property: 'value',
            array: [1, 2, 3],
            boolean: true,
            number: 42
          }
        }

        const setting = await testDb.createTestSetting({
          key: 'complex_setting',
          value: complexValue,
          updatedBy: superAdmin.id
        })

        expect(setting.value).toEqual(complexValue)
      })
    })
  })

  describe('Error Handling', () => {
    it('handles database connection errors', async () => {
      // Mock database connection failure
      const originalDb = testDb.getDatabase
      testDb.getDatabase = jest.fn().mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      await expect(
        DrizzleSettingsService.getAdminSettings()
      ).rejects.toThrow('Database connection failed')

      // Restore original
      testDb.getDatabase = originalDb
    })

    it('handles transaction rollback on errors', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        // This should rollback if there's an error
        await expect(async () => {
          await DrizzleSettingsService.createOrUpdateSetting(
            'mistral_ocr_api_key',
            'valid-key',
            'description',
            false,
            'invalid-user-id' // This should cause foreign key error
          )
        }).rejects.toThrow()

        // Verify no partial data was saved
        const settings = await DrizzleSettingsService.getAdminSettings()
        expect(settings).toHaveLength(0)
      })
    })
  })
})