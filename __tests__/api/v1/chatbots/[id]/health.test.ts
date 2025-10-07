import { GET } from '@/app/api/v1/chatbots/[id]/health/route';
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

describe('/api/v1/chatbots/[id]/health', () => {
  const chatbotId = 'chatbot-123';
  const params = { id: chatbotId };

  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/chatbots/[id]/health', () => {
    it('returns healthy status for active chatbot', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockHealthData = {
        status: 'healthy' as const,
        metrics: {
          uptime: 99.9,
          responseTime: 150,
          errorRate: 0.1,
          totalRequests: 100,
          lastRequest: new Date('2024-01-02T10:00:00Z')
        }
      };

      MockChatbotService.getChatbotHealth.mockResolvedValue(mockHealthData);

      // Mock successful health checks
      MockChatbotService.listChatbots.mockResolvedValue({
        chatbots: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 }
      });

      MockChatbotService.getChatbotById.mockResolvedValue({
        id: chatbotId,
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.7,
          maxTokens: 1000
        }
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toMatchObject({
        status: 'healthy',
        chatbotStatus: 'healthy',
        metrics: {
          uptime: 99.9,
          responseTime: 150,
          errorRate: 0.1,
          totalRequests: 100
        },
        healthChecks: {
          database: true,
          configuration: true,
          api: true
        }
      });
      expect(response.data.data.summary).toContain('running normally');
    });

    it('returns warning status for inactive chatbot', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockHealthData = {
        status: 'warning' as const,
        metrics: {
          uptime: 0,
          responseTime: 150,
          errorRate: 2.5,
          totalRequests: 50,
          lastRequest: new Date('2024-01-01T10:00:00Z')
        }
      };

      MockChatbotService.getChatbotHealth.mockResolvedValue(mockHealthData);

      // Mock successful health checks
      MockChatbotService.listChatbots.mockResolvedValue({
        chatbots: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 }
      });

      MockChatbotService.getChatbotById.mockResolvedValue({
        id: chatbotId,
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.7,
          maxTokens: 1000
        }
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.status).toBe('warning');
      expect(response.data.data.chatbotStatus).toBe('warning');
      expect(response.data.data.summary).toContain('minor issues');
    });

    it('returns error status when health checks fail', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockHealthData = {
        status: 'healthy' as const,
        metrics: {
          uptime: 99.9,
          responseTime: 150,
          errorRate: 0.1,
          totalRequests: 100,
          lastRequest: new Date()
        }
      };

      MockChatbotService.getChatbotHealth.mockResolvedValue(mockHealthData);

      // Mock failed database health check
      MockChatbotService.listChatbots.mockRejectedValue(new Error('Database connection failed'));

      // Mock successful configuration check
      MockChatbotService.getChatbotById.mockResolvedValue({
        id: chatbotId,
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.7,
          maxTokens: 1000
        }
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.status).toBe('error');
      expect(response.data.data.healthChecks.database).toBe(false);
      expect(response.data.data.healthChecks.configuration).toBe(true);
      expect(response.data.data.summary).toContain('critical issues');
      expect(response.data.data.summary).toContain('Database connection failed');
    });

    it('detects configuration problems', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);

      const mockHealthData = {
        status: 'healthy' as const,
        metrics: {
          uptime: 99.9,
          responseTime: 150,
          errorRate: 0.1,
          totalRequests: 100,
          lastRequest: new Date()
        }
      };

      MockChatbotService.getChatbotHealth.mockResolvedValue(mockHealthData);

      // Mock successful database check
      MockChatbotService.listChatbots.mockResolvedValue({
        chatbots: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 }
      });

      // Mock chatbot with incomplete configuration
      MockChatbotService.getChatbotById.mockResolvedValue({
        id: chatbotId,
        configuration: {
          model: null, // Missing required field
          temperature: 0.7
          // Missing maxTokens
        }
      });

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.status).toBe('error');
      expect(response.data.data.healthChecks.configuration).toBe(false);
      expect(response.data.data.summary).toContain('Configuration failed');
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
      MockChatbotService.getChatbotHealth.mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      testAssertions.expectErrorResponse(response, 404);
      expect(response.data.code).toBe('NOT_FOUND');
    });

    it('handles internal errors and returns error health status', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockChatbotService.canUserAccessChatbot.mockResolvedValue(true);
      MockChatbotService.getChatbotHealth.mockRejectedValue(new Error('Internal health check error'));

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, { params });

      expect(response.status).toBe(500);
      expect(response.data.data.status).toBe('error');
      expect(response.data.data.chatbotStatus).toBe('error');
      expect(response.data.data.metrics.uptime).toBe(0);
      expect(response.data.data.metrics.errorRate).toBe(100);
      expect(response.data.data.summary).toBe('Health check failed due to internal error');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for POST requests', async () => {
      const { POST } = await import('@/app/api/v1/chatbots/[id]/health/route');

      const response = await callApiRoute(POST, {
        method: 'POST'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PUT requests', async () => {
      const { PUT } = await import('@/app/api/v1/chatbots/[id]/health/route');

      const response = await callApiRoute(PUT, {
        method: 'PUT'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for DELETE requests', async () => {
      const { DELETE } = await import('@/app/api/v1/chatbots/[id]/health/route');

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      }, { params });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});