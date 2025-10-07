/**
 * Integration Tests for Widget Deployment System
 * Tests the complete widget system without Next.js environment dependencies
 */

import { WidgetService } from '@/lib/services/widget-service';
import { WidgetAnalyticsService } from '@/lib/services/widget-analytics';

// Mock database for integration testing
const mockDb = {
  chatbotInstances: new Map(),
  widgetConfigs: new Map(),
  users: new Map()
};

// Mock the database module
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }
}));

// Mock the schema objects
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
  }
}));

describe('Widget System Integration Tests', () => {
  const testUserId = 'test-user-123';
  const testChatbotId = 'test-chatbot-456';
  const testApiKey = 'cb_widget_test456_1699999999_abc123';

  const mockChatbot = {
    id: testChatbotId,
    userId: testUserId,
    name: 'Test Chatbot',
    systemPrompt: 'Test prompt',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockWidgetConfig = {
    id: 'widget-789',
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
      greeting_message: 'Hi! How can I help you today?',
      placeholder_text: 'Type your message...',
      auto_open: false,
      auto_open_delay: 3000,
      show_typing_indicator: true,
      sound_enabled: true,
      persistent: true
    },
    securityConfig: {
      allowed_domains: ['example.com'],
      rate_limit_enabled: true,
      rate_limit_per_minute: 30,
      csrf_protection: true
    },
    brandingConfig: {
      show_powered_by: true,
      bot_name: 'Assistant',
      company_name: 'Test Company'
    },
    analyticsConfig: {
      track_events: true,
      track_user_behavior: false,
      session_recording: false
    },
    status: 'active' as const,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock database
    mockDb.chatbotInstances.set(testChatbotId, mockChatbot);
    mockDb.widgetConfigs.set(testChatbotId, mockWidgetConfig);
    mockDb.users.set(testUserId, { id: testUserId, email: 'test@example.com' });
  });

  describe('Widget Configuration Management', () => {
    it('should complete widget configuration workflow', async () => {
      const { db } = require('@/lib/db');

      // Mock database operations for widget creation
      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockWidgetConfig])
        })
      });

      // Test widget configuration creation
      const newConfig = {
        chatbotId: testChatbotId,
        name: 'Test Widget',
        apiKey: testApiKey,
        themeConfig: mockWidgetConfig.themeConfig,
        layoutConfig: mockWidgetConfig.layoutConfig,
        behaviorConfig: mockWidgetConfig.behaviorConfig,
        securityConfig: mockWidgetConfig.securityConfig,
        brandingConfig: mockWidgetConfig.brandingConfig,
        analyticsConfig: mockWidgetConfig.analyticsConfig,
        status: 'active' as const,
        version: 1
      };

      const result = await WidgetService.saveWidgetConfig(newConfig, testUserId);

      expect(result).toBeDefined();
      expect(result.chatbotId).toBe(testChatbotId);
      expect(result.name).toBe('Test Widget');
      expect(result.status).toBe('active');
    });

    it('should generate valid API keys', async () => {
      const { db } = require('@/lib/db');

      // Mock database operations for API key generation
      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });

      const apiKey = await WidgetService.generateApiKey(testChatbotId, testUserId);

      expect(apiKey).toMatch(/^cb_widget_/);
      expect(apiKey).toContain(testChatbotId.substring(0, 8));
      expect(apiKey.length).toBeGreaterThan(20);
    });

    it('should validate domain access correctly', async () => {
      const { db } = require('@/lib/db');

      // Mock successful config retrieval
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        })
      });

      // Test allowed domain
      const isAllowed = await WidgetService.validateDomainAccess(testApiKey, 'example.com');
      expect(isAllowed).toBe(true);

      // Test blocked domain
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        })
      });

      const isBlocked = await WidgetService.validateDomainAccess(testApiKey, 'blocked.com');
      expect(isBlocked).toBe(false);
    });

    it('should generate valid embed code', async () => {
      const embedCode = WidgetService.generateEmbedCode(testApiKey, mockWidgetConfig);

      // Validate embed code structure
      expect(embedCode).toContain('<!-- Chatbot Widget -->');
      expect(embedCode).toContain('chatbotConfig');
      expect(embedCode).toContain(testApiKey);
      expect(embedCode).toContain(testChatbotId);
      expect(embedCode).toContain('window.ChatbotWidget.init');

      // Validate configuration inclusion (accounting for formatting differences)
      expect(embedCode).toContain('#3b82f6');
      expect(embedCode).toContain('bottom-right');
      expect(embedCode).toContain('Hi! How can I help you today?');
    });
  });

  describe('Analytics System Integration', () => {
    it('should track analytics events properly', async () => {
      const { db } = require('@/lib/db');

      // Mock widget config with analytics enabled
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{
              ...mockWidgetConfig,
              analyticsConfig: { track_events: true }
            }])
          })
        })
      });

      const testEvent = {
        chatbotId: testChatbotId,
        eventType: 'widget_load' as const,
        eventData: { page: '/home' },
        userId: 'user-123',
        sessionId: 'session-456',
        domain: 'example.com',
        pageUrl: 'https://example.com/home',
        userAgent: 'Mozilla/5.0',
        referrer: '',
        timestamp: new Date()
      };

      const tracked = await WidgetAnalyticsService.trackEvent(testEvent);
      expect(tracked).toBe(true);
    });

    it('should retrieve analytics data', async () => {
      const { db } = require('@/lib/db');

      // Mock widget config exists
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        })
      });

      const analyticsQuery = {
        chatbotId: testChatbotId,
        timeRange: '7d' as const
      };

      const analyticsData = await WidgetAnalyticsService.getAnalyticsData(analyticsQuery);

      expect(analyticsData).toHaveProperty('timeRange', '7d');
      expect(analyticsData).toHaveProperty('summary');
      expect(analyticsData).toHaveProperty('dailyData');
      expect(analyticsData).toHaveProperty('topDomains');
      expect(analyticsData).toHaveProperty('topPages');
      expect(analyticsData).toHaveProperty('realTimeMetrics');
      expect(analyticsData).toHaveProperty('userBehavior');

      expect(Array.isArray(analyticsData.dailyData)).toBe(true);
      expect(analyticsData.dailyData.length).toBe(7);
      expect(analyticsData.summary.total_conversations).toBeGreaterThan(0);
    });

    it('should generate performance metrics', async () => {
      const { db } = require('@/lib/db');

      // Mock widget config exists
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        })
      });

      const performanceMetrics = await WidgetAnalyticsService.getPerformanceMetrics(testChatbotId);

      expect(performanceMetrics).toHaveProperty('load_time');
      expect(performanceMetrics).toHaveProperty('error_rate');
      expect(performanceMetrics).toHaveProperty('uptime');
      expect(performanceMetrics).toHaveProperty('response_time');

      expect(performanceMetrics.load_time).toHaveProperty('avg');
      expect(performanceMetrics.load_time).toHaveProperty('p95');
      expect(performanceMetrics.load_time).toHaveProperty('p99');
      expect(typeof performanceMetrics.load_time.avg).toBe('number');
      expect(typeof performanceMetrics.error_rate).toBe('number');
      expect(typeof performanceMetrics.uptime).toBe('number');
    });
  });

  describe('Widget Security Integration', () => {
    it('should enforce domain restrictions', async () => {
      const { db } = require('@/lib/db');

      // Test with specific allowed domains
      const restrictedConfig = {
        ...mockWidgetConfig,
        securityConfig: {
          ...mockWidgetConfig.securityConfig,
          allowed_domains: ['allowed.com', '*.subdomain.com']
        }
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([restrictedConfig])
          })
        })
      });

      // Test allowed domain
      let isValid = await WidgetService.validateDomainAccess(testApiKey, 'allowed.com');
      expect(isValid).toBe(true);

      // Test wildcard subdomain
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([restrictedConfig])
          })
        })
      });

      isValid = await WidgetService.validateDomainAccess(testApiKey, 'test.subdomain.com');
      expect(isValid).toBe(true);

      // Test blocked domain
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([restrictedConfig])
          })
        })
      });

      isValid = await WidgetService.validateDomainAccess(testApiKey, 'blocked.com');
      expect(isValid).toBe(false);
    });

    it('should handle invalid API keys securely', async () => {
      const { db } = require('@/lib/db');

      // Mock empty result for invalid API key
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      const config = await WidgetService.getWidgetConfigByApiKey('invalid-key');
      expect(config).toBeNull();

      const isValid = await WidgetService.validateDomainAccess('invalid-key', 'any.com');
      expect(isValid).toBe(false);
    });
  });

  describe('End-to-End Widget Workflow', () => {
    it('should complete full widget creation and deployment workflow', async () => {
      const { db } = require('@/lib/db');

      // Step 1: Create widget configuration
      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockWidgetConfig])
        })
      });

      const newConfig = {
        chatbotId: testChatbotId,
        name: 'Production Widget',
        apiKey: testApiKey,
        themeConfig: mockWidgetConfig.themeConfig,
        layoutConfig: mockWidgetConfig.layoutConfig,
        behaviorConfig: mockWidgetConfig.behaviorConfig,
        securityConfig: mockWidgetConfig.securityConfig,
        brandingConfig: mockWidgetConfig.brandingConfig,
        analyticsConfig: mockWidgetConfig.analyticsConfig,
        status: 'active' as const,
        version: 1
      };

      const createdConfig = await WidgetService.saveWidgetConfig(newConfig, testUserId);
      expect(createdConfig).toBeDefined();

      // Step 2: Generate API key
      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([createdConfig])
            })
          })
        });

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });

      const apiKey = await WidgetService.generateApiKey(testChatbotId, testUserId);
      expect(apiKey).toMatch(/^cb_widget_/);

      // Step 3: Generate embed code
      const embedCode = WidgetService.generateEmbedCode(apiKey, createdConfig);
      expect(embedCode).toContain('<!-- Chatbot Widget -->');
      expect(embedCode).toContain(apiKey);

      // Step 4: Validate deployment
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([createdConfig])
          })
        })
      });

      const isValidDomain = await WidgetService.validateDomainAccess(apiKey, 'example.com');
      expect(isValidDomain).toBe(true);

      // Step 5: Track analytics event
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([createdConfig])
          })
        })
      });

      const testEvent = {
        chatbotId: testChatbotId,
        eventType: 'widget_load' as const,
        eventData: { deployment: 'production' },
        userId: 'visitor-123',
        sessionId: 'session-789',
        domain: 'example.com',
        pageUrl: 'https://example.com/product',
        userAgent: 'Mozilla/5.0',
        referrer: 'https://google.com',
        timestamp: new Date()
      };

      const eventTracked = await WidgetAnalyticsService.trackEvent(testEvent);
      expect(eventTracked).toBe(true);

      // Step 6: Retrieve analytics
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([createdConfig])
          })
        })
      });

      const analyticsData = await WidgetAnalyticsService.getAnalyticsData({
        chatbotId: testChatbotId,
        timeRange: '7d'
      });

      expect(analyticsData.summary.total_conversations).toBeGreaterThan(0);
      expect(analyticsData.dailyData.length).toBe(7);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database errors gracefully', async () => {
      const { db } = require('@/lib/db');

      // Mock database error
      (db.select as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(
        WidgetService.getWidgetConfig(testChatbotId, testUserId)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle unauthorized access attempts', async () => {
      const { db } = require('@/lib/db');

      // Mock empty result (user doesn't own chatbot)
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      await expect(
        WidgetService.getWidgetConfig(testChatbotId, 'unauthorized-user')
      ).rejects.toThrow('Chatbot not found or access denied');
    });

    it('should handle widget configuration not found', async () => {
      const { db } = require('@/lib/db');

      // Mock chatbot exists but no widget config
      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

      const result = await WidgetService.getWidgetConfig(testChatbotId, testUserId);
      expect(result).toBeNull();
    });

    it('should validate widget statistics generation', async () => {
      const stats = WidgetService.generateWidgetStats();

      expect(stats).toHaveProperty('total_conversations');
      expect(stats).toHaveProperty('unique_visitors');
      expect(stats).toHaveProperty('conversion_rate');
      expect(stats).toHaveProperty('average_session_duration');
      expect(stats).toHaveProperty('bounce_rate');

      // Validate data types and ranges
      expect(typeof stats.total_conversations).toBe('number');
      expect(typeof stats.unique_visitors).toBe('number');
      expect(typeof stats.conversion_rate).toBe('number');
      expect(typeof stats.average_session_duration).toBe('number');
      expect(typeof stats.bounce_rate).toBe('number');

      expect(stats.total_conversations).toBeGreaterThanOrEqual(100);
      expect(stats.unique_visitors).toBeGreaterThanOrEqual(50);
      expect(stats.conversion_rate).toBeGreaterThanOrEqual(5);
      expect(stats.conversion_rate).toBeLessThanOrEqual(25);
      expect(stats.average_session_duration).toBeGreaterThanOrEqual(60);
      expect(stats.bounce_rate).toBeGreaterThanOrEqual(20);
      expect(stats.bounce_rate).toBeLessThanOrEqual(50);
    });
  });
});