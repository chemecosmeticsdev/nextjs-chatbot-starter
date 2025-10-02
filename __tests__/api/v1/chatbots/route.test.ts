// Mock modules before importing
jest.mock('@/lib/db/chatbot-service');
jest.mock('@/lib/auth');
jest.mock('@/lib/user-sync');

import { GET, POST } from '@/app/api/v1/chatbots/route';
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils';

const MockChatbotService = jest.mocked(require('@/lib/db/chatbot-service').ChatbotService);

// Set up the mocked modules
require('@/lib/auth').AuthTokenService = MockAuthService;
require('@/lib/user-sync').UserSyncService = MockUserService;

describe('/api/v1/chatbots', () => {
  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/chatbots', () => {
    it('successfully lists chatbots for authenticated user', async () => {
      // Setup test user
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        testData.user.role
      );

      // Mock successful authentication
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      // Mock chatbot service response
      const mockChatbots = [
        {
          id: 'chatbot-1',
          name: 'Test Chatbot 1',
          description: 'A test chatbot',
          status: 'active',
          apiKeyHint: 'abc123',
          configuration: {
            model: 'anthropic.claude-3-sonnet-20240229-v1:0',
            temperature: 0.7,
            maxTokens: 1000,
            language: 'en',
            responseTimeout: 30
          },
          knowledgeSourceFilters: {},
          currentSystemPrompt: 'You are a helpful assistant',
          welcomeMessage: 'Hello!',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          conversationCount: 5,
          userCount: 3,
          lastActivity: new Date('2024-01-02')
        }
      ];

      MockChatbotService.listChatbots.mockResolvedValue({
        chatbots: mockChatbots,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1
        }
      });

      const response = await callApiRoute(GET, {
        method: 'GET',
        url: '/api/v1/chatbots?page=1&limit=20'
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.chatbots).toHaveLength(1);
      expect(response.data.data.chatbots[0]).toMatchObject({
        id: 'chatbot-1',
        name: 'Test Chatbot 1',
        status: 'active'
      });
      expect(response.data.data.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      });
    });

    it('filters chatbots for non-super admin users', async () => {
      // Setup regular user
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.listChatbots.mockResolvedValue({
        chatbots: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      // Verify that listChatbots was called with createdBy filter
      expect(MockChatbotService.listChatbots).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        searchTerm: undefined,
        createdBy: user.id
      });
    });

    it('does not filter chatbots for super admin users', async () => {
      // Setup super admin user
      const superAdmin = MockUserService.createUser(
        'super-admin-id',
        'admin@example.com',
        'Super Admin',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(superAdmin);
      MockChatbotService.listChatbots.mockResolvedValue({
        chatbots: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      // Verify that listChatbots was called without createdBy filter
      expect(MockChatbotService.listChatbots).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        searchTerm: undefined,
        createdBy: undefined
      });
    });

    it('validates query parameters', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const response = await callApiRoute(GET, {
        method: 'GET',
        url: '/api/v1/chatbots?page=invalid&limit=1000'
      });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });

    it('handles database errors gracefully', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.listChatbots.mockRejectedValue(new Error('Database connection failed'));

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/v1/chatbots', () => {
    it('successfully creates a chatbot for super admin', async () => {
      // Setup super admin user
      const superAdmin = MockUserService.createUser(
        'super-admin-id',
        'admin@example.com',
        'Super Admin',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(superAdmin);
      MockChatbotService.canUserCreateChatbot.mockReturnValue(true);

      const mockChatbot = {
        id: 'chatbot-123',
        name: 'New Chatbot',
        description: 'A new test chatbot',
        status: 'testing',
        apiKeyHint: 'abc123',
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.7,
          maxTokens: 1000,
          language: 'en',
          responseTimeout: 30
        },
        knowledgeSourceFilters: {},
        currentSystemPrompt: null,
        welcomeMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      MockChatbotService.createChatbot.mockResolvedValue({
        chatbot: mockChatbot,
        apiKey: 'cb_generated-api-key'
      });

      const createData = {
        name: 'New Chatbot',
        description: 'A new test chatbot',
        configuration: {
          temperature: 0.8
        }
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: createData,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      testAssertions.expectValidResponse(response, 201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.chatbot).toMatchObject({
        id: 'chatbot-123',
        name: 'New Chatbot',
        status: 'testing'
      });
      expect(response.data.data.apiKey).toBe('cb_generated-api-key');
    });

    it('requires super admin permissions', async () => {
      // Setup regular user
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserCreateChatbot.mockReturnValue(false);

      const createData = {
        name: 'New Chatbot',
        description: 'A new test chatbot'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: createData
      });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('validates request body', async () => {
      const superAdmin = MockUserService.createUser(
        'super-admin-id',
        'admin@example.com',
        'Super Admin',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(superAdmin);
      MockChatbotService.canUserCreateChatbot.mockReturnValue(true);

      const invalidData = {
        name: '', // Empty name should fail validation
        configuration: {
          temperature: 5 // Invalid temperature (should be 0-2)
        }
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: invalidData
      });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
      expect(response.data.details).toBeDefined();
    });

    it('handles duplicate name errors', async () => {
      const superAdmin = MockUserService.createUser(
        'super-admin-id',
        'admin@example.com',
        'Super Admin',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(superAdmin);
      MockChatbotService.canUserCreateChatbot.mockReturnValue(true);

      const duplicateError = new Error('Duplicate name');
      duplicateError.code = '23505'; // PostgreSQL unique violation
      MockChatbotService.createChatbot.mockRejectedValue(duplicateError);

      const createData = {
        name: 'Existing Chatbot',
        description: 'This name already exists'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: createData
      });

      testAssertions.expectErrorResponse(response, 409);
      expect(response.data.code).toBe('DUPLICATE_NAME');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const createData = {
        name: 'Test Chatbot'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: createData
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });

    it('handles database errors', async () => {
      const superAdmin = MockUserService.createUser(
        'super-admin-id',
        'admin@example.com',
        'Super Admin',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(superAdmin);
      MockChatbotService.canUserCreateChatbot.mockReturnValue(true);
      MockChatbotService.createChatbot.mockRejectedValue(new Error('Database error'));

      const createData = {
        name: 'Test Chatbot'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: createData
      });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for PUT requests', async () => {
      const { PUT } = await import('@/app/api/v1/chatbots/route');

      const response = await callApiRoute(PUT, {
        method: 'PUT'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for DELETE requests', async () => {
      const { DELETE } = await import('@/app/api/v1/chatbots/route');

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});