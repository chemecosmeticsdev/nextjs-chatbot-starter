// Mock modules before importing
jest.mock('@/lib/db/chatbot-service');
jest.mock('@/lib/auth');

import { GET, PUT } from '@/app/api/v1/chatbots/[id]/prompt/route';
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

describe('/api/v1/chatbots/[id]/prompt', () => {
  const chatbotId = 'chatbot-123';
  const params = { id: chatbotId };

  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/chatbots/[id]/prompt', () => {
    it('successfully gets current prompt and history for authorized user', async () => {
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
        currentSystemPrompt: 'You are a helpful assistant.',
        name: 'Test Chatbot'
      };

      const mockPromptHistory = {
        prompts: [
          {
            id: 'prompt-1',
            version: 2,
            prompt: 'You are a helpful assistant.',
            description: 'Updated prompt',
            createdBy: user.id,
            createdAt: new Date('2024-01-02'),
            source: 'manual'
          },
          {
            id: 'prompt-2',
            version: 1,
            prompt: 'You are an AI assistant.',
            description: 'Initial prompt',
            createdBy: user.id,
            createdAt: new Date('2024-01-01'),
            source: 'manual'
          }
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1
        }
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockChatbot);
      MockChatbotService.getPromptHistory.mockResolvedValue(mockPromptHistory);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.currentPrompt).toBe('You are a helpful assistant.');
      expect(response.data.data.history).toHaveLength(2);
      expect(response.data.data.pagination.total).toBe(2);
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
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
  });

  describe('PUT /api/v1/chatbots/[id]/prompt', () => {
    it('successfully updates system prompt for authorized user', async () => {
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
        name: 'Test Chatbot'
      };

      const updateData = {
        prompt: 'You are a specialized customer service assistant.',
        description: 'Updated for better customer service'
      };

      const mockUpdateResult = {
        version: 3,
        prompt: updateData.prompt,
        updatedAt: new Date()
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockChatbot);
      MockChatbotService.updateSystemPrompt.mockResolvedValue(mockUpdateResult);

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData,
        headers: {
          'Content-Type': 'application/json'
        }
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.currentPrompt).toBe(updateData.prompt);
      expect(response.data.data.version).toBe(3);
      expect(response.data.data.message).toContain('updated successfully');
    });

    it('validates prompt data', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const invalidUpdateData = {
        prompt: '', // Empty prompt should fail validation
        description: 'a'.repeat(501) // Description too long
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

      const updateData = {
        prompt: 'You are a helpful assistant.'
      };

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
      MockChatbotService.getChatbotById.mockResolvedValue(null);

      const updateData = {
        prompt: 'You are a helpful assistant.'
      };

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('handles update failure', async () => {
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
        name: 'Test Chatbot'
      };

      const updateData = {
        prompt: 'You are a helpful assistant.'
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockChatbot);
      MockChatbotService.updateSystemPrompt.mockResolvedValue(null);

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('UPDATE_FAILED');
    });

    it('logs security audit for prompt updates', async () => {
      const user = MockUserService.createUser(
        'security-user-id',
        'security@example.com',
        'Security User',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockChatbot = {
        id: chatbotId,
        name: 'Security Test Chatbot'
      };

      const updateData = {
        prompt: 'You are a security-focused assistant.'
      };

      const mockUpdateResult = {
        version: 1,
        prompt: updateData.prompt,
        updatedAt: new Date()
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockChatbot);
      MockChatbotService.updateSystemPrompt.mockResolvedValue(mockUpdateResult);

      // Spy on console.log to verify security logging
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const response = await callApiRoute(PUT, {
        method: 'PUT',
        body: updateData
      }, { params });

      testAssertions.expectValidResponse(response, 200);

      // Verify security audit log was created
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`System prompt updated for chatbot ${chatbotId} by user security-user-id`)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for POST requests', async () => {
      const { POST } = await import('@/app/api/v1/chatbots/[id]/prompt/route');

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for DELETE requests', async () => {
      const { DELETE } = await import('@/app/api/v1/chatbots/[id]/prompt/route');

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PATCH requests', async () => {
      const { PATCH } = await import('@/app/api/v1/chatbots/[id]/prompt/route');

      const response = await callApiRoute(PATCH, {
        method: 'PATCH'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});