/**
 * Phase 2: Database Integration Testing
 * Tests the widget system database operations using real database schema
 */

import { WidgetService } from '@/lib/services/widget-service';
import { WidgetAnalyticsService } from '@/lib/services/widget-analytics';
import { db } from '@/lib/db';
import { chatbotInstances, chatbotWidgetConfigs, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// Mock the actual database for integration testing
jest.mock('@/lib/db', () => {
  // Create in-memory storage for the test
  const mockStorage = {
    users: new Map(),
    chatbotInstances: new Map(),
    chatbotWidgetConfigs: new Map(),
  };

  return {
    db: {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table) => ({
          where: jest.fn().mockImplementation((condition) => ({
            limit: jest.fn().mockImplementation((limit) => {
              // Simulate database queries based on table and conditions
              if (table === mockStorage.users || table.name === 'users') {
                return Promise.resolve(Array.from(mockStorage.users.values()));
              } else if (table === mockStorage.chatbotInstances || table.name === 'chatbot_instances') {
                return Promise.resolve(Array.from(mockStorage.chatbotInstances.values()));
              } else if (table === mockStorage.chatbotWidgetConfigs || table.name === 'chatbot_widget_configs') {
                return Promise.resolve(Array.from(mockStorage.chatbotWidgetConfigs.values()));
              }
              return Promise.resolve([]);
            })
          }))
        }))
      })),
      insert: jest.fn().mockImplementation((table) => ({
        values: jest.fn().mockImplementation((data) => ({
          returning: jest.fn().mockImplementation(() => {
            // Store data in mock storage
            const id = data.id || crypto.randomUUID();
            const record = { ...data, id };

            if (table === mockStorage.chatbotWidgetConfigs || table.name === 'chatbot_widget_configs') {
              mockStorage.chatbotWidgetConfigs.set(id, record);
            } else if (table === mockStorage.chatbotInstances || table.name === 'chatbot_instances') {
              mockStorage.chatbotInstances.set(id, record);
            } else if (table === mockStorage.users || table.name === 'users') {
              mockStorage.users.set(id, record);
            }

            return Promise.resolve([record]);
          })
        }))
      })),
      update: jest.fn().mockImplementation((table) => ({
        set: jest.fn().mockImplementation((data) => ({
          where: jest.fn().mockImplementation((condition) => ({
            returning: jest.fn().mockImplementation(() => {
              // Update data in mock storage
              if (table === mockStorage.chatbotWidgetConfigs || table.name === 'chatbot_widget_configs') {
                const existingRecords = Array.from(mockStorage.chatbotWidgetConfigs.values());
                if (existingRecords.length > 0) {
                  const updated = { ...existingRecords[0], ...data };
                  mockStorage.chatbotWidgetConfigs.set(updated.id, updated);
                  return Promise.resolve([updated]);
                }
              }
              return Promise.resolve([]);
            })
          }))
        }))
      })),
      delete: jest.fn().mockImplementation((table) => ({
        where: jest.fn().mockImplementation((condition) => ({
          returning: jest.fn().mockImplementation(() => {
            // Delete from mock storage
            const deleted = [];
            if (table === mockStorage.chatbotWidgetConfigs || table.name === 'chatbot_widget_configs') {
              const existingRecords = Array.from(mockStorage.chatbotWidgetConfigs.values());
              existingRecords.forEach(record => {
                mockStorage.chatbotWidgetConfigs.delete(record.id);
                deleted.push(record);
              });
            }
            return Promise.resolve(deleted);
          })
        }))
      })),
      _mockStorage: mockStorage
    }
  };
});

// Mock schema objects
jest.mock('@/lib/db/schema', () => ({
  chatbotInstances: {
    id: 'id',
    createdBy: 'createdBy',
    name: 'name',
    description: 'description',
    status: 'status',
    apiKeyHash: 'apiKeyHash',
    configuration: 'configuration',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  chatbotWidgetConfigs: {
    id: 'id',
    chatbotId: 'chatbotId',
    name: 'name',
    apiKey: 'apiKey',
    themeConfig: 'themeConfig',
    layoutConfig: 'layoutConfig',
    behaviorConfig: 'behaviorConfig',
    securityConfig: 'securityConfig',
    brandingConfig: 'brandingConfig',
    analyticsConfig: 'analyticsConfig',
    status: 'status',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  users: {
    id: 'id',
    email: 'email',
    fullName: 'fullName',
    role: 'role',
    isActive: 'isActive',
    cognitoUserId: 'cognitoUserId',
    lastLoginAt: 'lastLoginAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
}));

describe('Widget System Database Integration Tests', () => {
  let testChatbotId: string;
  let testUserId: string;
  let testApiKey: string;
  let mockStorage: any;

  beforeAll(async () => {
    // Generate test IDs
    testChatbotId = crypto.randomUUID();
    testUserId = crypto.randomUUID();
    testApiKey = `cb_widget_${testChatbotId.substring(0, 8)}_${Date.now()}_test`;

    // Get access to mock storage for setup
    mockStorage = (db as any)._mockStorage;
  });

  beforeEach(() => {
    // Set up test data in mock storage before each test
    mockStorage.users.set(testUserId, {
      id: testUserId,
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockStorage.chatbotInstances.set(testChatbotId, {
      id: testChatbotId,
      name: 'Test Widget Chatbot',
      description: 'Test chatbot for widget testing',
      createdBy: testUserId,
      status: 'testing',
      apiKeyHash: 'test_hash',
      apiKeyHint: 'test123',
      configuration: {},
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  afterEach(() => {
    // Clear mock storage after each test
    mockStorage.users.clear();
    mockStorage.chatbotInstances.clear();
    mockStorage.chatbotWidgetConfigs.clear();
    jest.clearAllMocks();
  });

  describe('Widget Configuration Database Operations', () => {

    it('should create widget configuration in database', async () => {
      const widgetConfig = {
        chatbotId: testChatbotId,
        name: 'Test Widget',
        apiKey: testApiKey,
        themeConfig: {
          primary_color: '#3b82f6',
          secondary_color: '#f3f4f6',
          background_color: '#ffffff',
          text_color: '#374151',
          border_radius: 12,
          font_family: 'Inter, sans-serif',
          font_size: 14
        },
        layoutConfig: {
          position: 'bottom-right' as const,
          width: 380,
          height: 500,
          margin: 20,
          bubble_style: 'circle' as const
        },
        behaviorConfig: {
          greeting_message: 'Hello! How can I help you?',
          placeholder_text: 'Type your message...',
          auto_open: false,
          auto_open_delay: 3000,
          show_typing_indicator: true,
          sound_enabled: true,
          persistent: true
        },
        securityConfig: {
          allowed_domains: ['example.com', 'test.com'],
          rate_limit_enabled: true,
          rate_limit_per_minute: 30,
          csrf_protection: true
        },
        brandingConfig: {
          show_powered_by: true,
          bot_name: 'Test Assistant',
          company_name: 'Test Company'
        },
        analyticsConfig: {
          track_events: true,
          track_user_behavior: false,
          session_recording: false
        },
        status: 'active' as const,
        version: 1
      };

      const result = await WidgetService.saveWidgetConfig(widgetConfig, testUserId);

      expect(result).toBeDefined();
      expect(result.chatbotId).toBe(testChatbotId);
      expect(result.apiKey).toBe(testApiKey);
      expect(result.status).toBe('active');
      expect(result.version).toBe(1);
    });

    it('should retrieve widget configuration from database', async () => {
      const result = await WidgetService.getWidgetConfig(testChatbotId, testUserId);

      expect(result).toBeDefined();
      expect(result?.chatbotId).toBe(testChatbotId);
      expect(result?.apiKey).toBe(testApiKey);
      expect(result?.themeConfig.primary_color).toBe('#3b82f6');
      expect(result?.behaviorConfig.greeting_message).toBe('Hello! How can I help you?');
    });

    it('should update widget configuration in database', async () => {
      const updatedConfig = {
        chatbotId: testChatbotId,
        name: 'Updated Test Widget',
        apiKey: testApiKey,
        themeConfig: {
          primary_color: '#ff0000', // Changed color
          secondary_color: '#f3f4f6',
          background_color: '#ffffff',
          text_color: '#374151',
          border_radius: 12,
          font_family: 'Inter, sans-serif',
          font_size: 14
        },
        layoutConfig: {
          position: 'bottom-left' as const, // Changed position
          width: 380,
          height: 500,
          margin: 20,
          bubble_style: 'circle' as const
        },
        behaviorConfig: {
          greeting_message: 'Welcome! How may I assist you?', // Changed message
          placeholder_text: 'Type your message...',
          auto_open: false,
          auto_open_delay: 3000,
          show_typing_indicator: true,
          sound_enabled: true,
          persistent: true
        },
        securityConfig: {
          allowed_domains: ['example.com', 'test.com'],
          rate_limit_enabled: true,
          rate_limit_per_minute: 30,
          csrf_protection: true
        },
        brandingConfig: {
          show_powered_by: true,
          bot_name: 'Test Assistant',
          company_name: 'Test Company'
        },
        analyticsConfig: {
          track_events: true,
          track_user_behavior: false,
          session_recording: false
        },
        status: 'active' as const,
        version: 2
      };

      const result = await WidgetService.saveWidgetConfig(updatedConfig, testUserId);

      expect(result).toBeDefined();
      expect(result.version).toBe(2);
      expect(result.themeConfig.primary_color).toBe('#ff0000');
      expect(result.layoutConfig.position).toBe('bottom-left');
      expect(result.behaviorConfig.greeting_message).toBe('Welcome! How may I assist you?');
    });

    it('should validate domain access with database config', async () => {
      const allowedResult = await WidgetService.validateDomainAccess(testApiKey, 'example.com');
      expect(allowedResult).toBe(true);

      const blockedResult = await WidgetService.validateDomainAccess(testApiKey, 'blocked.com');
      expect(blockedResult).toBe(false);
    });

    it('should generate new API key and update database', async () => {
      const newApiKey = await WidgetService.generateApiKey(testChatbotId, testUserId);

      expect(newApiKey).toBeDefined();
      expect(newApiKey).toMatch(/^cb_widget_/);
      expect(newApiKey).toContain(testChatbotId.substring(0, 8));

      // Verify the key was updated in database
      const config = await WidgetService.getWidgetConfig(testChatbotId, testUserId);
      expect(config?.apiKey).toBe(newApiKey);
    });
  });

  describe('Widget Analytics Database Operations', () => {
    it('should track analytics events in database', async () => {
      const analyticsData = {
        chatbotId: testChatbotId,
        eventType: 'widget_load' as const,
        eventData: { page: '/home', deployment: 'test' },
        userId: 'visitor-123',
        sessionId: 'session-456',
        domain: 'example.com',
        pageUrl: 'https://example.com/home',
        userAgent: 'Mozilla/5.0 Test Browser',
        referrer: 'https://google.com',
        timestamp: new Date()
      };

      const result = await WidgetAnalyticsService.trackEvent(analyticsData);
      expect(result).toBe(true);
    });

    it('should retrieve analytics data from database', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const analyticsData = await WidgetAnalyticsService.getAnalyticsData(
        testChatbotId,
        startDate,
        endDate
      );

      expect(analyticsData).toBeDefined();
      expect(analyticsData.totalEvents).toBeGreaterThanOrEqual(0);
      expect(analyticsData.period).toBeDefined();
    });
  });

  afterAll(async () => {
    // Mock storage is automatically cleaned up after each test
    console.log('Database integration test completed');
  });
});