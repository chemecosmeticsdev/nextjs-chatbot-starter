import { POST } from '@/app/api/v1/chatbots/[id]/regenerate-token/route';
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

describe('/api/v1/chatbots/[id]/regenerate-token', () => {
  const chatbotId = 'chatbot-123';
  const params = { id: chatbotId };

  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('POST /api/v1/chatbots/[id]/regenerate-token', () => {
    it('successfully regenerates API key for authorized user', async () => {
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

      const mockRegenerateResult = {
        apiKey: 'cb_new-generated-key-12345',
        hint: 'new12345'
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockExistingChatbot);
      MockChatbotService.regenerateApiKey.mockResolvedValue(mockRegenerateResult);

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toMatchObject({
        apiKey: 'cb_new-generated-key-12345',
        hint: 'new12345',
        message: 'API key regenerated successfully'
      });
      expect(response.data.data.warning).toContain('old key is now invalid');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(POST, {
        method: 'POST'
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

      const response = await callApiRoute(POST, {
        method: 'POST'
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

      const response = await callApiRoute(POST, {
        method: 'POST'
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

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('handles regeneration failure', async () => {
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
      MockChatbotService.regenerateApiKey.mockResolvedValue(null);

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('REGENERATION_FAILED');
    });

    it('logs security event for API key regeneration', async () => {
      const user = MockUserService.createUser(
        'security-user-id',
        'security@example.com',
        'Security User',
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockExistingChatbot = {
        id: chatbotId,
        name: 'Security Test Chatbot'
      };

      const mockRegenerateResult = {
        apiKey: 'cb_security-key-12345',
        hint: 'sec12345'
      };

      MockChatbotService.getChatbotById.mockResolvedValue(mockExistingChatbot);
      MockChatbotService.regenerateApiKey.mockResolvedValue(mockRegenerateResult);

      // Spy on console.log to verify security logging
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      testAssertions.expectValidResponse(response, 200);

      // Verify security audit log was created
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`API key regenerated for chatbot ${chatbotId} by user security-user-id`)
      );

      consoleSpy.mockRestore();
    });

    it('handles database errors gracefully', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);
      MockChatbotService.getChatbotById.mockRejectedValue(new Error('Database connection failed'));

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for GET requests', async () => {
      const { GET } = await import('@/app/api/v1/chatbots/[id]/regenerate-token/route');

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PUT requests', async () => {
      const { PUT } = await import('@/app/api/v1/chatbots/[id]/regenerate-token/route');

      const response = await callApiRoute(PUT, {
        method: 'PUT'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for DELETE requests', async () => {
      const { DELETE } = await import('@/app/api/v1/chatbots/[id]/regenerate-token/route');

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});