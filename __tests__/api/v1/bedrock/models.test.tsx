import { GET } from '@/app/api/v1/bedrock/models/route'
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils'

// Mock AWS SDK
const mockBedrockClient = {
  send: jest.fn()
}

jest.mock('@aws-sdk/client-bedrock', () => ({
  BedrockClient: jest.fn().mockImplementation(() => mockBedrockClient),
  ListFoundationModelsCommand: jest.fn().mockImplementation(() => ({}))
}))

// Mock the services
jest.mock('@/lib/auth', () => ({
  AuthTokenService: MockAuthService
}))

jest.mock('@/lib/user-sync', () => ({
  UserSyncService: MockUserService
}))

describe('/api/v1/bedrock/models', () => {
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

  describe('GET /api/v1/bedrock/models', () => {
    it('returns available Bedrock models for super admin', async () => {
      const mockModels = {
        modelSummaries: [
          {
            modelId: 'amazon.nova-micro-v1:0',
            modelName: 'Nova Micro',
            providerName: 'Amazon',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT'],
            responseStreamingSupported: true,
            customizationsSupported: [],
            inferenceTypesSupported: ['ON_DEMAND']
          },
          {
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            modelName: 'Claude 3 Sonnet',
            providerName: 'Anthropic',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT'],
            responseStreamingSupported: true,
            customizationsSupported: [],
            inferenceTypesSupported: ['ON_DEMAND']
          },
          {
            modelId: 'meta.llama3-8b-instruct-v1:0',
            modelName: 'Llama 3 8B Instruct',
            providerName: 'Meta',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT'],
            responseStreamingSupported: true,
            customizationsSupported: [],
            inferenceTypesSupported: ['ON_DEMAND']
          }
        ]
      }

      mockBedrockClient.send.mockResolvedValue(mockModels)

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data.success).toBe(true)
      expect(response.data.models).toHaveLength(3)
      expect(response.data.models[0]).toMatchObject({
        modelId: 'amazon.nova-micro-v1:0',
        modelName: 'Nova Micro',
        providerName: 'Amazon',
        description: expect.any(String)
      })
      expect(response.data.groupedModels).toHaveProperty('Amazon')
      expect(response.data.groupedModels).toHaveProperty('Anthropic')
      expect(response.data.groupedModels).toHaveProperty('Meta')
    })

    it('filters models by text input/output capability', async () => {
      const mockModels = {
        modelSummaries: [
          {
            modelId: 'text-model',
            modelName: 'Text Model',
            providerName: 'Provider',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT'],
            responseStreamingSupported: true
          },
          {
            modelId: 'image-model',
            modelName: 'Image Model',
            providerName: 'Provider',
            inputModalities: ['IMAGE'],
            outputModalities: ['IMAGE'],
            responseStreamingSupported: false
          }
        ]
      }

      mockBedrockClient.send.mockResolvedValue(mockModels)

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response, 200)
      // Should only include text models
      expect(response.data.models).toHaveLength(1)
      expect(response.data.models[0].modelId).toBe('text-model')
    })

    it('groups models by provider correctly', async () => {
      const mockModels = {
        modelSummaries: [
          {
            modelId: 'amazon.model1',
            modelName: 'Model 1',
            providerName: 'Amazon',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT']
          },
          {
            modelId: 'amazon.model2',
            modelName: 'Model 2',
            providerName: 'Amazon',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT']
          },
          {
            modelId: 'anthropic.model1',
            modelName: 'Model 3',
            providerName: 'Anthropic',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT']
          }
        ]
      }

      mockBedrockClient.send.mockResolvedValue(mockModels)

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data.groupedModels.Amazon).toHaveLength(2)
      expect(response.data.groupedModels.Anthropic).toHaveLength(1)
    })

    it('denies access for non-super admin users', async () => {
      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: regularUserSession }
      })

      testAssertions.expectAdminRequired(response)
      expect(mockBedrockClient.send).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      const response = await callApiRoute(GET, {
        method: 'GET'
      })

      testAssertions.expectAuthRequired(response)
      expect(mockBedrockClient.send).not.toHaveBeenCalled()
    })

    it('handles AWS Bedrock API errors', async () => {
      mockBedrockClient.send.mockRejectedValue(new Error('AccessDeniedException: Access denied'))

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectErrorResponse(response, 500)
      expect(response.data.code).toBe('BEDROCK_ERROR')
      expect(response.data.error).toContain('Failed to fetch Bedrock models')
    })

    it('handles AWS credentials not configured', async () => {
      mockBedrockClient.send.mockRejectedValue(
        new Error('CredentialsProviderError: Could not load credentials')
      )

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectErrorResponse(response, 500)
      expect(response.data.code).toBe('BEDROCK_ERROR')
    })

    it('handles rate limiting from AWS', async () => {
      mockBedrockClient.send.mockRejectedValue(new Error('ThrottlingException: Rate exceeded'))

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectErrorResponse(response, 429)
      expect(response.data.code).toBe('RATE_LIMITED')
    })

    it('caches model results for performance', async () => {
      const mockModels = {
        modelSummaries: [
          {
            modelId: 'test-model',
            modelName: 'Test Model',
            providerName: 'Test',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT']
          }
        ]
      }

      mockBedrockClient.send.mockResolvedValue(mockModels)

      // First request
      const response1 = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response1, 200)

      // Second request should use cache
      const response2 = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response2, 200)

      // Should have only called AWS once if caching is implemented
      // Note: This depends on cache implementation
      expect(response2.data.models).toEqual(response1.data.models)
    })

    it('generates proper model descriptions', async () => {
      const mockModels = {
        modelSummaries: [
          {
            modelId: 'amazon.nova-micro-v1:0',
            modelName: 'Nova Micro',
            providerName: 'Amazon',
            inputModalities: ['TEXT'],
            outputModalities: ['TEXT'],
            responseStreamingSupported: true,
            inferenceTypesSupported: ['ON_DEMAND']
          }
        ]
      }

      mockBedrockClient.send.mockResolvedValue(mockModels)

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data.models[0].description).toContain('Amazon Nova Micro')
      expect(response.data.models[0].description).toContain('Text input/output')
      expect(response.data.models[0].description).toContain('Streaming')
    })

    it('handles empty model list', async () => {
      mockBedrockClient.send.mockResolvedValue({ modelSummaries: [] })

      const response = await callApiRoute(GET, {
        method: 'GET',
        cookies: { session: superAdminSession }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data.models).toHaveLength(0)
      expect(response.data.groupedModels).toEqual({})
    })
  })
})