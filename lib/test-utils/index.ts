// Export all test utilities
export * from './render'
export * from './api-helpers'
export * from './db-helpers'

// Common test data factories
export const testData = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'user',
    isActive: true,
    cognitoUserId: 'cognito-test-user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null
  },

  superAdmin: {
    id: 'test-admin-id',
    email: 'admin@example.com',
    fullName: 'Test Admin',
    role: 'super_admin',
    isActive: true,
    cognitoUserId: 'cognito-test-admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date()
  },

  adminSettings: {
    mistral_ocr_api_key: {
      key: 'mistral_ocr_api_key',
      value: 'test-api-key-123',
      description: 'Mistral API key for OCR',
      isPublic: false,
      masked_value: '***key-123'
    },
    aws_bedrock_credentials: {
      key: 'aws_bedrock_credentials',
      value: {
        accessKeyId: 'AKIA123456789',
        secretAccessKey: 'test-secret-key',
        region: 'us-east-1'
      },
      description: 'AWS Bedrock credentials',
      isPublic: false,
      masked_value: {
        accessKeyId: '***6789',
        region: 'us-east-1'
      }
    },
    default_llm_model: {
      key: 'default_llm_model',
      value: 'amazon.nova-micro-v1:0',
      description: 'Default LLM model',
      isPublic: false
    }
  }
}

// Common mock implementations
export const mockImplementations = {
  fetch: (url: string) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve('{"success":true}'),
    headers: new Headers(),
  }),

  authService: {
    verifySession: jest.fn().mockResolvedValue({
      userId: testData.user.id,
      email: testData.user.email
    }),
    createSession: jest.fn().mockResolvedValue('test-session-token')
  },

  userService: {
    getUserById: jest.fn().mockResolvedValue(testData.user),
    createUser: jest.fn().mockResolvedValue(testData.user),
    updateUser: jest.fn().mockResolvedValue(testData.user)
  }
}

// Test assertion helpers
export const testAssertions = {
  expectValidResponse: (response: any, expectedStatus: number = 200) => {
    expect(response.status).toBe(expectedStatus)
    expect(response.data).toBeDefined()
  },

  expectErrorResponse: (response: any, expectedStatus: number = 400) => {
    expect(response.status).toBe(expectedStatus)
    expect(response.data).toHaveProperty('error')
  },

  expectAuthRequired: (response: any) => {
    expect(response.status).toBe(401)
    expect(response.data).toHaveProperty('error')
    expect(response.data.code).toBe('NO_SESSION')
  },

  expectAdminRequired: (response: any) => {
    expect(response.status).toBe(403)
    expect(response.data).toHaveProperty('error')
    expect(response.data.code).toBe('ACCESS_DENIED')
  }
}