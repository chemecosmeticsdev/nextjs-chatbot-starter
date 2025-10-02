import { GET, PUT, DELETE } from '@/app/api/v1/chatbots/[id]/route';
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils';

// Mock the ChatbotService
jest.mock('@/lib/db/chatbot-service');
const MockChatbotService = jest.mocked(require('@/lib/db/chatbot-service').ChatbotService);

// Mock the auth service
jest.mock('@/lib/auth', () => ({
  AuthTokenService: MockAuthService
}));

describe('/api/v1/chatbots/[id]', () => {
  const chatbotId = 'chatbot-123';
  const params = { id: chatbotId };

  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/chatbots/[id]', () => {
    it('successfully gets chatbot details for authorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockChatbot = {
        id: chatbotId,
        name: 'Test Chatbot',
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
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockChatbot);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toMatchObject({
        id: chatbotId,
        name: 'Test Chatbot',
        status: 'active'
      });
    });

    it('returns 403 for unauthorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(false);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent chatbot', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);
      MockChatbotService.getChatbotById.mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('validates chatbot ID parameter', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params: { id: 'invalid-uuid' } });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /api/v1/chatbots/[id]', () => {
    it('successfully updates chatbot for authorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const updateData = {
        name: 'Updated Chatbot',
        status: 'active' as const,
        configuration: {
          temperature: 0.8
        }
      };

      const mockUpdatedChatbot = {
        id: chatbotId,
        name: 'Updated Chatbot',
        status: 'active',
        updatedAt: new Date()
      };

      const mockChatbotWithStats = {
        ...mockUpdatedChatbot,
        description: 'Updated description',
        apiKeyHint: 'abc123',
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.8,
          maxTokens: 1000,
          language: 'en',
          responseTimeout: 30
        },
        knowledgeSourceFilters: {},
        currentSystemPrompt: null,
        welcomeMessage: null,
        createdAt: new Date('2024-01-01'),
        conversationCount: 0,
        userCount: 0,
        lastActivity: null
      };

      MockChatbotService.updateChatbot.mockResolvedValue(mockUpdatedChatbot);
      MockChatbotService.getChatbotById.mockResolvedValue(mockChatbotWithStats);

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData,
        headers: {
          'Content-Type': 'application/json'
        }
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toMatchObject({
        id: chatbotId,
        name: 'Updated Chatbot',
        status: 'active'
      });
    });

    it('validates update data', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const invalidUpdateData = {
        status: 'invalid-status', // Invalid status
        configuration: {
          temperature: 5 // Invalid temperature
        }
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: invalidUpdateData
      }, { params });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('returns 403 for unauthorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(false);

      const updateData = { name: 'Updated Name' };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent chatbot', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);
      MockChatbotService.updateChatbot.mockResolvedValue(null);

      const updateData = { name: 'Updated Name' };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('handles duplicate name errors', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const duplicateError = new Error('Duplicate name');
      duplicateError.code = '23505';
      MockChatbotService.updateChatbot.mockRejectedValue(duplicateError);

      const updateData = { name: 'Existing Name' };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 409);
      expect(response.data.code).toBe('DUPLICATE_NAME');
    });
  });

  describe('DELETE /api/v1/chatbots/[id]', () => {
    it('successfully deletes chatbot for authorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockExistingChatbot = {
        id: chatbotId,
        name: 'Test Chatbot',
        status: 'active'
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockExistingChatbot);
      MockChatbotService.deleteChatbot.mockResolvedValue(true);

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.message).toContain('deleted successfully');
    });

    it('returns 403 for unauthorized user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'user'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(false);

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectErrorResponse(response, 403);
      expect(response.data.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent chatbot', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);
      MockChatbotService.getChatbotById.mockResolvedValue(null);

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('handles deletion failure', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockExistingChatbot = {
        id: chatbotId,
        name: 'Test Chatbot'
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockExistingChatbot);
      MockChatbotService.deleteChatbot.mockResolvedValue(false);

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('DELETE_FAILED');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for POST requests', async () => {
      const { POST } = await import('@/app/api/v1/chatbots/[id]/route');

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PATCH requests', async () => {
      const { PATCH } = await import('@/app/api/v1/chatbots/[id]/route');

      const response = await callApiRoute(PATCH, {
        method: 'PATCH'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});