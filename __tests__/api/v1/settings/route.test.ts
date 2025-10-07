import { GET, POST } from '@/app/api/v1/settings/route'
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils'

// Mock the services
jest.mock('@/lib/auth', () => ({
  AuthTokenService: MockAuthService
}))

jest.mock('@/lib/user-sync', () => ({
  UserSyncService: MockUserService
}))

// Mock DrizzleSettingsService
const mockSettingsService = {
  getAdminSettings: jest.fn(),
  createOrUpdateSetting: jest.fn(),
  logSettingActivity: jest.fn()
}

jest.mock('@/lib/db/settings', () => ({
  DrizzleSettingsService: mockSettingsService
}))

describe('/api/v1/settings', () => {
  let superAdminSession: string
  let regularUserSession: string

  beforeEach(() => {
    MockAuthService.clearSessions()
    MockUserService.clearUsers()
    jest.clearAllMocks()

    // Setup test users
    const superAdmin = MockUserService.createUser(
      testData.superAdmin.id,
      testData.superAdmin.email,
      testData.superAdmin.fullName,
      'super_admin'
    )

    const regularUser = MockUserService.createUser(
      testData.user.id,
      testData.user.email,
      testData.user.fullName,
      'user'
    )

    // Create sessions
    superAdminSession = MockAuthService.createValidSession(
      superAdmin.id,
      superAdmin.email,
      superAdmin.role
    )

    regularUserSession = MockAuthService.createValidSession(
      regularUser.id,
      regularUser.email,
      regularUser.role
    )
  })

  describe('GET /api/v1/settings', () => {
    it('returns admin settings for super admin', async () => {
      const mockSettings = [
        testData.adminSettings.mistral_ocr_api_key,
        testData.adminSettings.aws_bedrock_credentials,
        testData.adminSettings.default_llm_model
      ]

      mockSettingsService.getAdminSettings.mockResolvedValue(mockSettings)

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data.success).toBe(true)
      expect(response.data.settings).toHaveLength(3)
      expect(response.data.settings[0]).toHaveProperty('masked_value')
      expect(mockSettingsService.getAdminSettings).toHaveBeenCalled()
    })

    it('denies access for non-super admin users', async () => {
      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: regularUserSession }
      })

      testAssertions.expectAdminRequired(response)
      expect(mockSettingsService.getAdminSettings).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      const response = await callApiRoute(GET, {
        method: 'GET'
        // No session cookie
      })

      testAssertions.expectAuthRequired(response)
      expect(mockSettingsService.getAdminSettings).not.toHaveBeenCalled()
    })

    it('handles invalid session', async () => {
      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: 'invalid-session-token' }
      })

      expect(response.status).toBe(401)
      expect(response.data.code).toBe('INVALID_SESSION')
    })

    it('handles database errors gracefully', async () => {
      mockSettingsService.getAdminSettings.mockRejectedValue(
        new Error('Database connection failed')
      )

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectErrorResponse(response, 500)
      expect(response.data.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/v1/settings', () => {
    it('creates new admin setting with valid data', async () => {
      const newSetting = {
        key: 'mistral_ocr_api_key',
        value: 'new-api-key-123',
        description: 'Updated Mistral API key',
        is_public: false
      }

      const mockCreatedSetting = {
        ...newSetting,
        updatedBy: testData.superAdmin.id,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      mockSettingsService.createOrUpdateSetting.mockResolvedValue(mockCreatedSetting)

      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: superAdminSession },
        body: newSetting
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data.success).toBe(true)
      expect(response.data.setting).toMatchObject(mockCreatedSetting)
      expect(mockSettingsService.createOrUpdateSetting).toHaveBeenCalledWith(
        newSetting.key,
        newSetting.value,
        newSetting.description,
        newSetting.is_public,
        testData.superAdmin.id
      )
      expect(mockSettingsService.logSettingActivity).toHaveBeenCalled()
    })

    it('validates setting key against allowed admin keys', async () => {
      const invalidSetting = {
        key: 'invalid_setting_key',
        value: 'some-value',
        description: 'Invalid setting'
      }

      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: superAdminSession },
        body: invalidSetting
      })

      testAssertions.expectErrorResponse(response, 400)
      expect(response.data.code).toBe('VALIDATION_ERROR')
    })

    it('validates required fields', async () => {
      const incompleteData = {
        key: 'mistral_ocr_api_key'
        // Missing value
      }

      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: superAdminSession },
        body: incompleteData
      })

      testAssertions.expectErrorResponse(response, 400)
      expect(response.data.code).toBe('VALIDATION_ERROR')
    })

    it('denies access for non-super admin users', async () => {
      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: regularUserSession },
        body: {
          key: 'mistral_ocr_api_key',
          value: 'test-value'
        }
      })

      testAssertions.expectAdminRequired(response)
    })

    it('requires authentication', async () => {
      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          key: 'mistral_ocr_api_key',
          value: 'test-value'
        }
      })

      testAssertions.expectAuthRequired(response)
    })

    it('handles AWS Bedrock credentials setting', async () => {
      const awsCredentials = {
        key: 'aws_bedrock_credentials',
        value: {
          accessKeyId: 'AKIA123456789',
          secretAccessKey: 'test-secret-key',
          region: 'us-east-1'
        },
        description: 'AWS Bedrock credentials'
      }

      mockSettingsService.createOrUpdateSetting.mockResolvedValue({
        ...awsCredentials,
        updatedBy: testData.superAdmin.id
      })

      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: superAdminSession },
        body: awsCredentials
      })

      testAssertions.expectValidResponse(response, 200)
      expect(mockSettingsService.createOrUpdateSetting).toHaveBeenCalledWith(
        'aws_bedrock_credentials',
        awsCredentials.value,
        awsCredentials.description,
        false,
        testData.superAdmin.id
      )
    })

    it('logs activity for setting creation', async () => {
      const newSetting = {
        key: 'default_llm_model',
        value: 'amazon.nova-micro-v1:0',
        description: 'Default LLM model'
      }

      mockSettingsService.createOrUpdateSetting.mockResolvedValue({
        ...newSetting,
        updatedBy: testData.superAdmin.id
      })

      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: superAdminSession },
        body: newSetting,
        headers: {
          'user-agent': 'Test User Agent',
          'x-forwarded-for': '192.168.1.1'
        }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(mockSettingsService.logSettingActivity).toHaveBeenCalledWith(
        testData.superAdmin.id,
        'setting_create',
        newSetting.key,
        '192.168.1.1',
        'Test User Agent'
      )
    })

    it('handles database errors during setting creation', async () => {
      mockSettingsService.createOrUpdateSetting.mockRejectedValue(
        new Error('Database constraint violation')
      )

      const response = await callApiRoute(POST, {
        method: 'POST',
        cookies: { session: superAdminSession },
        body: {
          key: 'mistral_ocr_api_key',
          value: 'test-value'
        }
      })

      testAssertions.expectErrorResponse(response, 500)
      expect(response.data.code).toBe('INTERNAL_ERROR')
    })
  })
})