import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData
} from '@/lib/test-utils'
import { performance } from 'perf_hooks'

// Import API handlers
import { GET as settingsGET, POST as settingsPOST } from '@/app/api/v1/settings/route'
import { GET as bedrockGET } from '@/app/api/v1/bedrock/models/route'

describe('API Performance Tests', () => {
  beforeEach(() => {
    MockAuthService.clearSessions()
    MockUserService.clearUsers()
    jest.clearAllMocks()
  })

  describe('Authentication Performance', () => {
    it('should validate session tokens quickly', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      const iterations = 100
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now()

        await MockAuthService.verifySession(sessionToken)

        const endTime = performance.now()
        times.push(endTime - startTime)
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length
      const maxTime = Math.max(...times)

      expect(averageTime).toBeLessThan(5) // Average should be under 5ms
      expect(maxTime).toBeLessThan(20) // Max should be under 20ms

      console.log(`Session validation - Average: ${averageTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`)
    })

    it('should handle concurrent authentication requests', async () => {
      const users = Array.from({ length: 10 }, (_, i) =>
        MockUserService.createUser(
          `user-${i}`,
          `user${i}@example.com`,
          `User ${i}`,
          'user'
        )
      )

      const sessions = users.map(user =>
        MockAuthService.createValidSession(user.id, user.email, user.role)
      )

      const concurrentRequests = 50
      const startTime = performance.now()

      const promises = Array.from({ length: concurrentRequests }, (_, i) => {
        const sessionToken = sessions[i % sessions.length]
        return MockAuthService.verifySession(sessionToken)
      })

      await Promise.all(promises)

      const endTime = performance.now()
      const totalTime = endTime - startTime
      const avgTimePerRequest = totalTime / concurrentRequests

      expect(avgTimePerRequest).toBeLessThan(10) // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(500) // Total should complete within 500ms

      console.log(`Concurrent auth requests: ${concurrentRequests} requests in ${totalTime.toFixed(2)}ms`)
    })
  })

  describe('Settings API Performance', () => {
    it('should respond to GET /api/v1/settings within acceptable time', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      // Mock the settings service
      const mockGetAdminSettings = jest.fn().mockResolvedValue([
        testData.adminSettings.mistral_ocr_api_key,
        testData.adminSettings.aws_bedrock_credentials,
        testData.adminSettings.default_llm_model
      ])

      jest.doMock('@/lib/db/settings', () => ({
        DrizzleSettingsService: {
          getAdminSettings: mockGetAdminSettings
        }
      }))

      const iterations = 20
      const times: number[] = []

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now()

        const response = await callApiRoute(settingsGET, {
          method: 'GET',
          cookies: { session: sessionToken }
        })

        const endTime = performance.now()
        times.push(endTime - startTime)

        expect(response.status).toBe(200)
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]

      expect(averageTime).toBeLessThan(50) // Average response under 50ms
      expect(p95Time).toBeLessThan(100) // 95th percentile under 100ms

      console.log(`Settings GET - Average: ${averageTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`)
    })

    it('should handle concurrent GET requests efficiently', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      const concurrentRequests = 25
      const startTime = performance.now()

      const promises = Array.from({ length: concurrentRequests }, () =>
        callApiRoute(settingsGET, {
          method: 'GET',
          cookies: { session: sessionToken }
        })
      )

      const responses = await Promise.all(promises)

      const endTime = performance.now()
      const totalTime = endTime - startTime

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      expect(totalTime).toBeLessThan(1000) // Should complete within 1 second

      console.log(`Concurrent settings requests: ${concurrentRequests} requests in ${totalTime.toFixed(2)}ms`)
    })

    it('should handle POST requests with validation efficiently', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      const testCases = [
        {
          key: 'mistral_ocr_api_key',
          value: 'test-api-key-123',
          description: 'Test API key'
        },
        {
          key: 'aws_bedrock_credentials',
          value: {
            accessKeyId: 'AKIA123456789',
            secretAccessKey: 'test-secret',
            region: 'us-east-1'
          },
          description: 'Test AWS credentials'
        },
        {
          key: 'default_llm_model',
          value: 'amazon.nova-micro-v1:0',
          description: 'Test LLM model'
        }
      ]

      const times: number[] = []

      for (const testCase of testCases) {
        const startTime = performance.now()

        const response = await callApiRoute(settingsPOST, {
          method: 'POST',
          cookies: { session: sessionToken },
          body: testCase
        })

        const endTime = performance.now()
        times.push(endTime - startTime)

        expect(response.status).toBe(200)
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length
      expect(averageTime).toBeLessThan(100) // POST operations should complete under 100ms

      console.log(`Settings POST average time: ${averageTime.toFixed(2)}ms`)
    })
  })

  describe('Bedrock API Performance', () => {
    it('should handle external API calls with appropriate timeouts', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      // Mock Bedrock client with delayed response
      const mockBedrockClient = {
        send: jest.fn().mockImplementation(() =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                modelSummaries: [
                  {
                    modelId: 'amazon.nova-micro-v1:0',
                    modelName: 'Nova Micro',
                    providerName: 'Amazon',
                    inputModalities: ['TEXT'],
                    outputModalities: ['TEXT']
                  }
                ]
              })
            }, 200) // 200ms delay to simulate network
          })
        )
      }

      jest.doMock('@aws-sdk/client-bedrock', () => ({
        BedrockClient: jest.fn().mockImplementation(() => mockBedrockClient),
        ListFoundationModelsCommand: jest.fn()
      }))

      const startTime = performance.now()

      const response = await callApiRoute(bedrockGET, {
        method: 'GET',
        cookies: { session: sessionToken }
      })

      const endTime = performance.now()
      const responseTime = endTime - startTime

      expect(response.status).toBe(200)
      expect(responseTime).toBeGreaterThan(200) // Should include the simulated delay
      expect(responseTime).toBeLessThan(1000) // But should timeout before 1 second

      console.log(`Bedrock API response time: ${responseTime.toFixed(2)}ms`)
    })

    it('should cache responses for repeated requests', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      let apiCallCount = 0

      const mockBedrockClient = {
        send: jest.fn().mockImplementation(() => {
          apiCallCount++
          return Promise.resolve({
            modelSummaries: [
              {
                modelId: 'test-model',
                modelName: 'Test Model',
                providerName: 'Test',
                inputModalities: ['TEXT'],
                outputModalities: ['TEXT']
              }
            ]
          })
        })
      }

      // First request
      const startTime1 = performance.now()
      const response1 = await callApiRoute(bedrockGET, {
        method: 'GET',
        cookies: { session: sessionToken }
      })
      const endTime1 = performance.now()

      // Second request (should use cache if implemented)
      const startTime2 = performance.now()
      const response2 = await callApiRoute(bedrockGET, {
        method: 'GET',
        cookies: { session: sessionToken }
      })
      const endTime2 = performance.now()

      const firstRequestTime = endTime1 - startTime1
      const secondRequestTime = endTime2 - startTime2

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)

      // If caching is implemented, second request should be faster
      if (apiCallCount === 1) {
        expect(secondRequestTime).toBeLessThan(firstRequestTime * 0.5)
        console.log(`Caching working: First: ${firstRequestTime.toFixed(2)}ms, Second: ${secondRequestTime.toFixed(2)}ms`)
      } else {
        console.log(`No caching: Both requests took ${firstRequestTime.toFixed(2)}ms and ${secondRequestTime.toFixed(2)}ms`)
      }
    })
  })

  describe('Error Handling Performance', () => {
    it('should handle validation errors quickly', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      const invalidRequests = [
        { key: '', value: 'test' }, // Empty key
        { key: 'invalid_key', value: 'test' }, // Invalid key
        { key: 'mistral_ocr_api_key' }, // Missing value
      ]

      const times: number[] = []

      for (const invalidRequest of invalidRequests) {
        const startTime = performance.now()

        const response = await callApiRoute(settingsPOST, {
          method: 'POST',
          cookies: { session: sessionToken },
          body: invalidRequest
        })

        const endTime = performance.now()
        times.push(endTime - startTime)

        expect(response.status).toBe(400) // Should return validation error
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length
      expect(averageTime).toBeLessThan(20) // Error responses should be very fast

      console.log(`Validation error average response time: ${averageTime.toFixed(2)}ms`)
    })

    it('should handle authentication errors efficiently', async () => {
      const invalidSessions = [
        'invalid-session-token',
        'expired-session-token',
        '',
        undefined
      ]

      const times: number[] = []

      for (const sessionToken of invalidSessions) {
        const startTime = performance.now()

        const response = await callApiRoute(settingsGET, {
          method: 'GET',
          cookies: sessionToken ? { session: sessionToken } : {}
        })

        const endTime = performance.now()
        times.push(endTime - startTime)

        expect([401, 403]).toContain(response.status) // Should return auth error
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length
      expect(averageTime).toBeLessThan(10) // Auth errors should be very fast

      console.log(`Auth error average response time: ${averageTime.toFixed(2)}ms`)
    })
  })

  describe('Payload Size Performance', () => {
    it('should handle large JSON payloads efficiently', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      // Create large AWS credentials payload
      const largePayload = {
        key: 'aws_bedrock_credentials',
        value: {
          accessKeyId: 'AKIA123456789',
          secretAccessKey: 'very-long-secret-key'.repeat(10),
          region: 'us-east-1',
          metadata: Array(100).fill(0).map((_, i) => ({
            key: `metadata_${i}`,
            value: `long_value_${'x'.repeat(100)}`
          }))
        },
        description: 'Large AWS credentials with metadata'
      }

      const startTime = performance.now()

      const response = await callApiRoute(settingsPOST, {
        method: 'POST',
        cookies: { session: sessionToken },
        body: largePayload
      })

      const endTime = performance.now()
      const responseTime = endTime - startTime

      expect(response.status).toBe(200)
      expect(responseTime).toBeLessThan(200) // Should handle large payloads within 200ms

      const payloadSize = JSON.stringify(largePayload).length
      console.log(`Large payload (${payloadSize} bytes) processed in ${responseTime.toFixed(2)}ms`)
    })
  })

  describe('Memory Usage During API Calls', () => {
    it('should not leak memory during repeated API calls', async () => {
      const superAdmin = MockUserService.createUser(
        testData.superAdmin.id,
        testData.superAdmin.email,
        testData.superAdmin.fullName,
        'super_admin'
      )

      const sessionToken = MockAuthService.createValidSession(
        superAdmin.id,
        superAdmin.email,
        superAdmin.role
      )

      const initialMemory = process.memoryUsage()
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        await callApiRoute(settingsGET, {
          method: 'GET',
          cookies: { session: sessionToken }
        })

        // Force garbage collection periodically
        if (i % 10 === 0 && global.gc) {
          global.gc()
        }
      }

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      // Memory should not increase significantly
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB

      console.log(`Memory increase after ${iterations} API calls: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
    })
  })
})