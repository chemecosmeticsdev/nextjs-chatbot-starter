import { GET, POST } from '@/app/api/v1/auth/login/route'
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils'

// Mock the auth and user services
jest.mock('@/lib/auth', () => ({
  AuthTokenService: MockAuthService
}))

jest.mock('@/lib/user-sync', () => ({
  UserSyncService: MockUserService
}))

describe('/api/v1/auth/login', () => {
  beforeEach(() => {
    MockAuthService.clearSessions()
    MockUserService.clearUsers()
    jest.clearAllMocks()
  })

  describe('POST /api/v1/auth/login', () => {
    it('successfully logs in with valid credentials', async () => {
      // Setup test user
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        testData.user.role
      )

      // Mock successful authentication
      MockAuthService.verifySession = jest.fn().mockResolvedValue({
        userId: user.id,
        email: user.email
      })

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: testData.user.email,
          password: 'validpassword123'
        },
        headers: {
          'Content-Type': 'application/json'
        }
      })

      testAssertions.expectValidResponse(response, 200)
      expect(response.data).toHaveProperty('success', true)
      expect(response.data).toHaveProperty('user')
      expect(response.data.user).toMatchObject({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      })
      expect(response.data).toHaveProperty('token')
    })

    it('rejects login with invalid credentials', async () => {
      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        }
      })

      testAssertions.expectErrorResponse(response, 401)
      expect(response.data.error).toContain('Invalid credentials')
      expect(response.data.code).toBe('INVALID_CREDENTIALS')
    })

    it('validates required fields', async () => {
      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: '',
          password: ''
        }
      })

      testAssertions.expectErrorResponse(response, 400)
      expect(response.data.code).toBe('VALIDATION_ERROR')
      expect(response.data.details).toBeDefined()
    })

    it('validates email format', async () => {
      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: 'invalid-email',
          password: 'password123'
        }
      })

      testAssertions.expectErrorResponse(response, 400)
      expect(response.data.code).toBe('VALIDATION_ERROR')
    })

    it('handles inactive users', async () => {
      // Create inactive user
      const user = MockUserService.createUser(
        'inactive-user-id',
        'inactive@example.com',
        'Inactive User',
        'user'
      )
      user.isActive = false

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: user.email,
          password: 'password123'
        }
      })

      testAssertions.expectErrorResponse(response, 403)
      expect(response.data.error).toContain('Account is disabled')
      expect(response.data.code).toBe('ACCOUNT_DISABLED')
    })

    it('returns appropriate error for missing request body', async () => {
      const response = await callApiRoute(POST, {
        method: 'POST'
        // No body
      })

      testAssertions.expectErrorResponse(response, 400)
    })

    it('handles database connection errors', async () => {
      // Mock database error
      MockUserService.getUserById = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: testData.user.email,
          password: 'password123'
        }
      })

      testAssertions.expectErrorResponse(response, 500)
      expect(response.data.code).toBe('INTERNAL_ERROR')
    })

    it('sets secure session cookies on successful login', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName
      )

      MockAuthService.createSession = jest.fn().mockResolvedValue('session-token-123')

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: {
          email: user.email,
          password: 'password123'
        }
      })

      testAssertions.expectValidResponse(response, 200)

      // Check Set-Cookie header
      const setCookieHeader = response.headers.get('set-cookie')
      expect(setCookieHeader).toContain('session=')
      expect(setCookieHeader).toContain('HttpOnly')
      expect(setCookieHeader).toContain('Secure')
      expect(setCookieHeader).toContain('SameSite=Strict')
    })

    it('limits login attempts', async () => {
      const responses = []

      // Attempt multiple logins with invalid credentials
      for (let i = 0; i < 6; i++) {
        const response = await callApiRoute(POST, {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'wrongpassword'
          }
        })
        responses.push(response)
      }

      // Last response should indicate too many attempts
      const lastResponse = responses[responses.length - 1]
      expect(lastResponse.status).toBe(429)
      expect(lastResponse.data.code).toBe('TOO_MANY_ATTEMPTS')
    })
  })

  describe('GET /api/v1/auth/login', () => {
    it('returns method not allowed for GET requests', async () => {
      const response = await callApiRoute(GET, {
        method: 'GET'
      })

      expect(response.status).toBe(405)
      expect(response.data?.error).toContain('Method not allowed')
    })
  })
})