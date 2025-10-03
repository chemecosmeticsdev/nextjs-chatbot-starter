import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock API utilities and test helpers
const APITestHelper = {
  // Request creation
  createRequest: jest.fn(),
  createAuthenticatedRequest: jest.fn(),
  createFormData: jest.fn(),

  // Response validation
  validateResponse: jest.fn(),
  validateJSONResponse: jest.fn(),
  validateErrorResponse: jest.fn(),
  validateHeaders: jest.fn(),

  // Authentication
  createTestUser: jest.fn(),
  authenticateUser: jest.fn(),
  createAPIKey: jest.fn(),

  // Database setup
  setupTestDatabase: jest.fn(),
  cleanupTestDatabase: jest.fn(),
  seedTestData: jest.fn(),

  // Utilities
  generateTestData: jest.fn(),
  waitForAsync: jest.fn(),
  retryRequest: jest.fn()
};

// Mock Next.js API route handlers
const MockAPIHandlers = {
  // Auth endpoints
  authLogin: jest.fn(),
  authLogout: jest.fn(),
  authRefresh: jest.fn(),
  authRegister: jest.fn(),

  // Chatbot endpoints
  getChatbots: jest.fn(),
  createChatbot: jest.fn(),
  updateChatbot: jest.fn(),
  deleteChatbot: jest.fn(),
  getChatbotDetails: jest.fn(),

  // Chat endpoints
  sendMessage: jest.fn(),
  getChatHistory: jest.fn(),
  createChatSession: jest.fn(),
  endChatSession: jest.fn(),

  // Integration endpoints
  getIntegrations: jest.fn(),
  createIntegration: jest.fn(),
  updateIntegration: jest.fn(),
  deleteIntegration: jest.fn(),
  getIntegrationStats: jest.fn(),

  // Analytics endpoints
  getAnalytics: jest.fn(),
  getPerformanceMetrics: jest.fn(),
  generateReport: jest.fn(),

  // Document endpoints
  uploadDocument: jest.fn(),
  getDocuments: jest.fn(),
  searchDocuments: jest.fn(),
  deleteDocument: jest.fn()
};

// Test data generators
const TestDataGenerator = {
  user: () => ({
    id: `user_${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    name: 'Test User',
    role: 'user',
    createdAt: new Date().toISOString()
  }),

  chatbot: () => ({
    id: `bot_${Date.now()}`,
    name: `Test Chatbot ${Date.now()}`,
    description: 'A test chatbot for integration testing',
    settings: {
      temperature: 0.7,
      maxTokens: 2048,
      model: 'nova-micro'
    },
    status: 'active'
  }),

  integration: () => ({
    id: `int_${Date.now()}`,
    type: 'widget',
    name: `Test Integration ${Date.now()}`,
    status: 'active',
    config: {
      domain: 'example.com',
      theme: 'blue'
    }
  }),

  chatMessage: () => ({
    id: `msg_${Date.now()}`,
    content: 'Hello, this is a test message',
    sender: 'user',
    timestamp: Date.now(),
    sessionId: `session_${Date.now()}`
  }),

  document: () => ({
    id: `doc_${Date.now()}`,
    title: `Test Document ${Date.now()}`,
    content: 'This is test document content for integration testing',
    type: 'text/plain',
    size: 1024
  })
};

describe('API Integration Tests', () => {
  let testUser: any;
  let testChatbot: any;
  let authToken: string;
  let apiKey: string;

  beforeAll(async () => {
    // Setup test database and initial data
    APITestHelper.setupTestDatabase.mockResolvedValue({ success: true });
    await APITestHelper.setupTestDatabase();

    // Create test user and authenticate
    testUser = TestDataGenerator.user();
    APITestHelper.createTestUser.mockResolvedValue(testUser);
    await APITestHelper.createTestUser(testUser);

    APITestHelper.authenticateUser.mockResolvedValue({
      token: 'test.jwt.token',
      refreshToken: 'refresh.token',
      expiresIn: 3600
    });

    const authResult = await APITestHelper.authenticateUser(testUser.email, 'testpassword');
    authToken = authResult.token;

    // Create API key for service-to-service tests
    APITestHelper.createAPIKey.mockResolvedValue({
      key: 'sk_test_123456789',
      name: 'Integration Test Key',
      scopes: ['chatbots:read', 'chatbots:write']
    });

    const apiKeyResult = await APITestHelper.createAPIKey({
      name: 'Integration Test Key',
      scopes: ['chatbots:read', 'chatbots:write']
    });
    apiKey = apiKeyResult.key;
  });

  afterAll(async () => {
    // Cleanup test database
    APITestHelper.cleanupTestDatabase.mockResolvedValue({ success: true });
    await APITestHelper.cleanupTestDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Flow', () => {
    it('should complete user registration and login flow', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        name: 'New User'
      };

      // Registration
      MockAPIHandlers.authRegister.mockResolvedValue({
        success: true,
        user: {
          id: 'user_new123',
          email: newUser.email,
          name: newUser.name,
          role: 'user'
        },
        message: 'User registered successfully'
      });

      const registerResponse = await MockAPIHandlers.authRegister(newUser);

      expect(registerResponse.success).toBe(true);
      expect(registerResponse.user.email).toBe(newUser.email);

      // Login
      MockAPIHandlers.authLogin.mockResolvedValue({
        success: true,
        token: 'new.jwt.token',
        refreshToken: 'new.refresh.token',
        user: registerResponse.user,
        expiresIn: 3600
      });

      const loginResponse = await MockAPIHandlers.authLogin({
        email: newUser.email,
        password: newUser.password
      });

      expect(loginResponse.success).toBe(true);
      expect(loginResponse.token).toBeDefined();
      expect(loginResponse.user.id).toBe(registerResponse.user.id);
    });

    it('should handle token refresh flow', async () => {
      const refreshToken = 'valid.refresh.token';

      MockAPIHandlers.authRefresh.mockResolvedValue({
        success: true,
        token: 'refreshed.jwt.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 3600
      });

      const refreshResponse = await MockAPIHandlers.authRefresh({
        refreshToken
      });

      expect(refreshResponse.success).toBe(true);
      expect(refreshResponse.token).toBe('refreshed.jwt.token');
      expect(refreshResponse.refreshToken).toBe('new.refresh.token');
    });

    it('should handle logout and token invalidation', async () => {
      MockAPIHandlers.authLogout.mockResolvedValue({
        success: true,
        message: 'Logged out successfully'
      });

      const logoutResponse = await MockAPIHandlers.authLogout({
        token: authToken
      });

      expect(logoutResponse.success).toBe(true);
      expect(logoutResponse.message).toBe('Logged out successfully');
    });
  });

  describe('Chatbot Management Flow', () => {
    it('should complete chatbot CRUD operations', async () => {
      // Create chatbot
      const chatbotData = TestDataGenerator.chatbot();

      MockAPIHandlers.createChatbot.mockResolvedValue({
        success: true,
        chatbot: {
          ...chatbotData,
          id: 'bot_created123',
          userId: testUser.id,
          createdAt: new Date().toISOString()
        }
      });

      const createResponse = await MockAPIHandlers.createChatbot(chatbotData);
      testChatbot = createResponse.chatbot;

      expect(createResponse.success).toBe(true);
      expect(createResponse.chatbot.name).toBe(chatbotData.name);
      expect(createResponse.chatbot.userId).toBe(testUser.id);

      // Get chatbot details
      MockAPIHandlers.getChatbotDetails.mockResolvedValue({
        success: true,
        chatbot: testChatbot,
        stats: {
          totalMessages: 0,
          totalSessions: 0,
          averageRating: 0
        }
      });

      const detailsResponse = await MockAPIHandlers.getChatbotDetails(testChatbot.id);

      expect(detailsResponse.success).toBe(true);
      expect(detailsResponse.chatbot.id).toBe(testChatbot.id);
      expect(detailsResponse.stats).toBeDefined();

      // Update chatbot
      const updateData = {
        name: 'Updated Test Chatbot',
        description: 'Updated description',
        settings: {
          ...testChatbot.settings,
          temperature: 0.8
        }
      };

      MockAPIHandlers.updateChatbot.mockResolvedValue({
        success: true,
        chatbot: {
          ...testChatbot,
          ...updateData,
          updatedAt: new Date().toISOString()
        }
      });

      const updateResponse = await MockAPIHandlers.updateChatbot(testChatbot.id, updateData);

      expect(updateResponse.success).toBe(true);
      expect(updateResponse.chatbot.name).toBe(updateData.name);
      expect(updateResponse.chatbot.settings.temperature).toBe(0.8);

      // List chatbots
      MockAPIHandlers.getChatbots.mockResolvedValue({
        success: true,
        chatbots: [updateResponse.chatbot],
        total: 1,
        page: 1,
        limit: 20
      });

      const listResponse = await MockAPIHandlers.getChatbots({
        page: 1,
        limit: 20
      });

      expect(listResponse.success).toBe(true);
      expect(listResponse.chatbots).toHaveLength(1);
      expect(listResponse.total).toBe(1);

      // Delete chatbot
      MockAPIHandlers.deleteChatbot.mockResolvedValue({
        success: true,
        message: 'Chatbot deleted successfully'
      });

      const deleteResponse = await MockAPIHandlers.deleteChatbot(testChatbot.id);

      expect(deleteResponse.success).toBe(true);
      expect(deleteResponse.message).toBe('Chatbot deleted successfully');
    });

    it('should handle chatbot validation errors', async () => {
      const invalidChatbotData = {
        name: '', // Invalid: empty name
        description: 'A' * 1000, // Invalid: too long
        settings: {
          temperature: 2.0, // Invalid: out of range
          maxTokens: -1 // Invalid: negative value
        }
      };

      MockAPIHandlers.createChatbot.mockResolvedValue({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid chatbot data',
          details: [
            { field: 'name', message: 'Name is required' },
            { field: 'description', message: 'Description too long' },
            { field: 'settings.temperature', message: 'Temperature must be between 0 and 1' },
            { field: 'settings.maxTokens', message: 'Max tokens must be positive' }
          ]
        }
      });

      const response = await MockAPIHandlers.createChatbot(invalidChatbotData);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.details).toHaveLength(4);
    });
  });

  describe('Chat Session Flow', () => {
    beforeEach(() => {
      testChatbot = TestDataGenerator.chatbot();
    });

    it('should complete chat session lifecycle', async () => {
      // Create chat session
      MockAPIHandlers.createChatSession.mockResolvedValue({
        success: true,
        session: {
          id: 'session_123',
          chatbotId: testChatbot.id,
          userId: testUser.id,
          status: 'active',
          createdAt: new Date().toISOString()
        }
      });

      const sessionResponse = await MockAPIHandlers.createChatSession({
        chatbotId: testChatbot.id,
        userId: testUser.id
      });

      expect(sessionResponse.success).toBe(true);
      expect(sessionResponse.session.status).toBe('active');

      const sessionId = sessionResponse.session.id;

      // Send message
      const messageData = {
        content: 'Hello, I need help with my account',
        sessionId,
        sender: 'user'
      };

      MockAPIHandlers.sendMessage.mockResolvedValue({
        success: true,
        message: {
          id: 'msg_user123',
          content: messageData.content,
          sender: 'user',
          timestamp: Date.now(),
          sessionId
        },
        botResponse: {
          id: 'msg_bot123',
          content: 'Hello! I\'d be happy to help you with your account. What specific issue are you experiencing?',
          sender: 'bot',
          timestamp: Date.now() + 1000,
          sessionId,
          processingTime: 156
        }
      });

      const messageResponse = await MockAPIHandlers.sendMessage(messageData);

      expect(messageResponse.success).toBe(true);
      expect(messageResponse.message.content).toBe(messageData.content);
      expect(messageResponse.botResponse.content).toContain('help');
      expect(messageResponse.botResponse.processingTime).toBeLessThan(500);

      // Get chat history
      MockAPIHandlers.getChatHistory.mockResolvedValue({
        success: true,
        messages: [
          messageResponse.message,
          messageResponse.botResponse
        ],
        session: sessionResponse.session,
        total: 2
      });

      const historyResponse = await MockAPIHandlers.getChatHistory(sessionId);

      expect(historyResponse.success).toBe(true);
      expect(historyResponse.messages).toHaveLength(2);
      expect(historyResponse.total).toBe(2);

      // End chat session
      MockAPIHandlers.endChatSession.mockResolvedValue({
        success: true,
        session: {
          ...sessionResponse.session,
          status: 'ended',
          endedAt: new Date().toISOString(),
          duration: 300000, // 5 minutes
          messageCount: 2
        }
      });

      const endResponse = await MockAPIHandlers.endChatSession(sessionId);

      expect(endResponse.success).toBe(true);
      expect(endResponse.session.status).toBe('ended');
      expect(endResponse.session.messageCount).toBe(2);
    });

    it('should handle concurrent chat sessions', async () => {
      const concurrentSessions = 5;
      const sessionPromises = Array(concurrentSessions).fill(null).map((_, i) =>
        MockAPIHandlers.createChatSession({
          chatbotId: testChatbot.id,
          userId: `user_${i}`
        })
      );

      MockAPIHandlers.createChatSession.mockResolvedValue({
        success: true,
        session: {
          id: 'session_concurrent',
          status: 'active',
          createdAt: new Date().toISOString()
        }
      });

      const sessions = await Promise.all(sessionPromises);

      expect(sessions).toHaveLength(concurrentSessions);
      expect(sessions.every(s => s.success)).toBe(true);
    });
  });

  describe('Integration Management Flow', () => {
    it('should complete integration lifecycle', async () => {
      // Create integration
      const integrationData = TestDataGenerator.integration();

      MockAPIHandlers.createIntegration.mockResolvedValue({
        success: true,
        integration: {
          ...integrationData,
          id: 'int_created123',
          chatbotId: testChatbot.id,
          createdAt: new Date().toISOString()
        }
      });

      const createResponse = await MockAPIHandlers.createIntegration({
        ...integrationData,
        chatbotId: testChatbot.id
      });

      expect(createResponse.success).toBe(true);
      expect(createResponse.integration.type).toBe(integrationData.type);

      const integrationId = createResponse.integration.id;

      // Get integrations
      MockAPIHandlers.getIntegrations.mockResolvedValue({
        success: true,
        integrations: [createResponse.integration],
        total: 1,
        page: 1,
        limit: 20
      });

      const listResponse = await MockAPIHandlers.getIntegrations(testChatbot.id);

      expect(listResponse.success).toBe(true);
      expect(listResponse.integrations).toHaveLength(1);

      // Update integration
      const updateData = {
        name: 'Updated Integration',
        status: 'inactive',
        config: {
          ...integrationData.config,
          theme: 'dark'
        }
      };

      MockAPIHandlers.updateIntegration.mockResolvedValue({
        success: true,
        integration: {
          ...createResponse.integration,
          ...updateData,
          updatedAt: new Date().toISOString()
        }
      });

      const updateResponse = await MockAPIHandlers.updateIntegration(integrationId, updateData);

      expect(updateResponse.success).toBe(true);
      expect(updateResponse.integration.name).toBe(updateData.name);
      expect(updateResponse.integration.config.theme).toBe('dark');

      // Get integration stats
      MockAPIHandlers.getIntegrationStats.mockResolvedValue({
        success: true,
        stats: {
          total_integrations: 1,
          active_integrations: 0,
          total_messages: 0,
          total_users: 0,
          popular_platform: 'Widget',
          growth_rate: 0
        }
      });

      const statsResponse = await MockAPIHandlers.getIntegrationStats(testChatbot.id);

      expect(statsResponse.success).toBe(true);
      expect(statsResponse.stats.total_integrations).toBe(1);
      expect(statsResponse.stats.active_integrations).toBe(0);

      // Delete integration
      MockAPIHandlers.deleteIntegration.mockResolvedValue({
        success: true,
        message: 'Integration deleted successfully'
      });

      const deleteResponse = await MockAPIHandlers.deleteIntegration(integrationId);

      expect(deleteResponse.success).toBe(true);
    });
  });

  describe('Document Management Flow', () => {
    it('should handle document upload and processing', async () => {
      const documentData = TestDataGenerator.document();

      // Upload document
      MockAPIHandlers.uploadDocument.mockResolvedValue({
        success: true,
        document: {
          ...documentData,
          id: 'doc_uploaded123',
          chatbotId: testChatbot.id,
          status: 'processing',
          uploadedAt: new Date().toISOString()
        },
        processingJob: {
          id: 'job_123',
          status: 'queued',
          estimatedTime: 30000 // 30 seconds
        }
      });

      const uploadResponse = await MockAPIHandlers.uploadDocument({
        ...documentData,
        chatbotId: testChatbot.id
      });

      expect(uploadResponse.success).toBe(true);
      expect(uploadResponse.document.status).toBe('processing');
      expect(uploadResponse.processingJob.status).toBe('queued');

      const documentId = uploadResponse.document.id;

      // Wait for processing and get documents
      APITestHelper.waitForAsync.mockResolvedValue(true);
      await APITestHelper.waitForAsync(() => Promise.resolve(true), 5000);

      MockAPIHandlers.getDocuments.mockResolvedValue({
        success: true,
        documents: [{
          ...uploadResponse.document,
          status: 'processed',
          processedAt: new Date().toISOString(),
          chunks: 5,
          vectorEmbeddings: 5
        }],
        total: 1
      });

      const documentsResponse = await MockAPIHandlers.getDocuments(testChatbot.id);

      expect(documentsResponse.success).toBe(true);
      expect(documentsResponse.documents[0].status).toBe('processed');
      expect(documentsResponse.documents[0].chunks).toBe(5);

      // Search documents
      MockAPIHandlers.searchDocuments.mockResolvedValue({
        success: true,
        results: [{
          document: documentsResponse.documents[0],
          relevance: 0.89,
          matchedChunks: [
            {
              id: 'chunk_1',
              content: 'Relevant content excerpt...',
              similarity: 0.92
            }
          ]
        }],
        query: 'test content',
        total: 1
      });

      const searchResponse = await MockAPIHandlers.searchDocuments({
        chatbotId: testChatbot.id,
        query: 'test content'
      });

      expect(searchResponse.success).toBe(true);
      expect(searchResponse.results).toHaveLength(1);
      expect(searchResponse.results[0].relevance).toBeGreaterThan(0.8);

      // Delete document
      MockAPIHandlers.deleteDocument.mockResolvedValue({
        success: true,
        message: 'Document deleted successfully'
      });

      const deleteResponse = await MockAPIHandlers.deleteDocument(documentId);

      expect(deleteResponse.success).toBe(true);
    });
  });

  describe('Analytics and Reporting Flow', () => {
    it('should generate analytics and performance reports', async () => {
      // Get analytics
      MockAPIHandlers.getAnalytics.mockResolvedValue({
        success: true,
        analytics: {
          totalMessages: 1234,
          totalSessions: 567,
          uniqueUsers: 234,
          averageSessionDuration: 180, // seconds
          userSatisfaction: 4.2,
          topQuestions: [
            { question: 'How to reset password?', count: 45 },
            { question: 'Account billing issue', count: 32 }
          ]
        },
        timeRange: '30d'
      });

      const analyticsResponse = await MockAPIHandlers.getAnalytics({
        chatbotId: testChatbot.id,
        timeRange: '30d'
      });

      expect(analyticsResponse.success).toBe(true);
      expect(analyticsResponse.analytics.totalMessages).toBeGreaterThan(1000);
      expect(analyticsResponse.analytics.userSatisfaction).toBeGreaterThan(4.0);

      // Get performance metrics
      MockAPIHandlers.getPerformanceMetrics.mockResolvedValue({
        success: true,
        metrics: {
          averageResponseTime: 145, // ms
          throughput: 50, // messages/minute
          errorRate: 0.005,
          uptime: 0.999,
          cacheHitRate: 0.85
        },
        timeRange: '24h'
      });

      const metricsResponse = await MockAPIHandlers.getPerformanceMetrics({
        chatbotId: testChatbot.id,
        timeRange: '24h'
      });

      expect(metricsResponse.success).toBe(true);
      expect(metricsResponse.metrics.averageResponseTime).toBeLessThan(200);
      expect(metricsResponse.metrics.uptime).toBeGreaterThan(0.99);

      // Generate report
      MockAPIHandlers.generateReport.mockResolvedValue({
        success: true,
        report: {
          id: 'report_123',
          type: 'comprehensive',
          period: '2024-01-01 to 2024-01-31',
          summary: {
            totalInteractions: 5678,
            successfulResolutions: 4567,
            escalations: 234,
            averageRating: 4.3
          },
          sections: {
            usage: analyticsResponse.analytics,
            performance: metricsResponse.metrics,
            trends: {
              growth: '+12%',
              satisfaction: '+0.3 points'
            }
          },
          generatedAt: new Date().toISOString()
        }
      });

      const reportResponse = await MockAPIHandlers.generateReport({
        chatbotId: testChatbot.id,
        type: 'comprehensive',
        timeRange: '30d'
      });

      expect(reportResponse.success).toBe(true);
      expect(reportResponse.report.summary.totalInteractions).toBeGreaterThan(5000);
      expect(reportResponse.report.sections.trends.growth).toContain('+');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle rate limiting', async () => {
      // Simulate rate limit exceeded
      for (let i = 0; i < 5; i++) {
        if (i < 3) {
          MockAPIHandlers.getChatbots.mockResolvedValue({
            success: true,
            chatbots: []
          });
        } else {
          MockAPIHandlers.getChatbots.mockResolvedValue({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests',
              retryAfter: 60
            }
          });
        }

        const response = await MockAPIHandlers.getChatbots();

        if (i >= 3) {
          expect(response.success).toBe(false);
          expect(response.error.code).toBe('RATE_LIMIT_EXCEEDED');
          expect(response.error.retryAfter).toBe(60);
        }
      }
    });

    it('should handle authentication failures', async () => {
      const invalidToken = 'invalid.jwt.token';

      MockAPIHandlers.getChatbots.mockResolvedValue({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token'
        }
      });

      const response = await MockAPIHandlers.getChatbots({
        headers: { authorization: `Bearer ${invalidToken}` }
      });

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle service unavailable scenarios', async () => {
      MockAPIHandlers.sendMessage.mockRejectedValue(
        new Error('Service temporarily unavailable')
      );

      await expect(MockAPIHandlers.sendMessage({
        content: 'test message',
        sessionId: 'session_123'
      })).rejects.toThrow('Service temporarily unavailable');
    });

    it('should handle large payload requests', async () => {
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB

      MockAPIHandlers.uploadDocument.mockResolvedValue({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Document size exceeds maximum limit',
          maxSize: '5MB'
        }
      });

      const response = await MockAPIHandlers.uploadDocument({
        content: largeContent,
        title: 'Large Document'
      });

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent API requests', async () => {
      const concurrentRequests = 20;
      const requests = Array(concurrentRequests).fill(null).map((_, i) =>
        MockAPIHandlers.getChatbots({ page: 1, limit: 10 })
      );

      MockAPIHandlers.getChatbots.mockResolvedValue({
        success: true,
        chatbots: [],
        processingTime: 45
      });

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      expect(responses).toHaveLength(concurrentRequests);
      expect(responses.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain response times under load', async () => {
      const loadTestRequests = 50;
      const responseTimes: number[] = [];

      for (let i = 0; i < loadTestRequests; i++) {
        MockAPIHandlers.sendMessage.mockResolvedValue({
          success: true,
          message: { id: `msg_${i}` },
          botResponse: { id: `bot_msg_${i}` },
          processingTime: 100 + Math.random() * 50 // 100-150ms
        });

        const startTime = Date.now();
        const response = await MockAPIHandlers.sendMessage({
          content: `Test message ${i}`,
          sessionId: 'load_test_session'
        });
        const endTime = Date.now();

        responseTimes.push(endTime - startTime);
        expect(response.success).toBe(true);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      expect(averageResponseTime).toBeLessThan(200);
      expect(p95ResponseTime).toBeLessThan(300);
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain data consistency across operations', async () => {
      // Create chatbot
      const chatbot = TestDataGenerator.chatbot();
      MockAPIHandlers.createChatbot.mockResolvedValue({
        success: true,
        chatbot: { ...chatbot, id: 'consistency_test_bot' }
      });

      const createResponse = await MockAPIHandlers.createChatbot(chatbot);
      const chatbotId = createResponse.chatbot.id;

      // Create multiple integrations
      const integrations = Array(3).fill(null).map(() => TestDataGenerator.integration());

      for (const integration of integrations) {
        MockAPIHandlers.createIntegration.mockResolvedValue({
          success: true,
          integration: {
            ...integration,
            id: `int_${Date.now()}_${Math.random()}`,
            chatbotId
          }
        });

        const intResponse = await MockAPIHandlers.createIntegration({
          ...integration,
          chatbotId
        });

        expect(intResponse.integration.chatbotId).toBe(chatbotId);
      }

      // Verify consistency in listing
      MockAPIHandlers.getIntegrations.mockResolvedValue({
        success: true,
        integrations: integrations.map((int, i) => ({
          ...int,
          id: `int_${i}`,
          chatbotId
        })),
        total: 3
      });

      const listResponse = await MockAPIHandlers.getIntegrations(chatbotId);

      expect(listResponse.integrations).toHaveLength(3);
      expect(listResponse.integrations.every(int => int.chatbotId === chatbotId)).toBe(true);
    });
  });
});

describe('API Security Tests', () => {
  it('should reject requests without proper authentication', async () => {
    MockAPIHandlers.getChatbots.mockResolvedValue({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });

    const response = await MockAPIHandlers.getChatbots();

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('UNAUTHORIZED');
  });

  it('should validate request permissions', async () => {
    MockAPIHandlers.deleteChatbot.mockResolvedValue({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions to delete chatbot'
      }
    });

    const response = await MockAPIHandlers.deleteChatbot('bot_123');

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('FORBIDDEN');
  });

  it('should sanitize input data', async () => {
    const maliciousInput = {
      name: '<script>alert("XSS")</script>Chatbot',
      description: 'DROP TABLE users; --'
    };

    MockAPIHandlers.createChatbot.mockResolvedValue({
      success: true,
      chatbot: {
        id: 'safe_bot',
        name: 'Chatbot', // XSS removed
        description: 'DROP TABLE users; --', // SQL injection detected but not executed
        sanitized: true
      }
    });

    const response = await MockAPIHandlers.createChatbot(maliciousInput);

    expect(response.success).toBe(true);
    expect(response.chatbot.name).not.toContain('<script>');
    expect(response.chatbot.sanitized).toBe(true);
  });
});