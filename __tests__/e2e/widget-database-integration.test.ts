/**
 * Phase 2: Complete Widget Database Integration Test
 * Tests the entire user workflow from chatbot creation to widget deployment
 * This represents the real-world user experience with proper database mocking
 */

import { WidgetService } from '@/lib/services/widget-service';
import { WidgetAnalyticsService } from '@/lib/services/widget-analytics';
import crypto from 'crypto';

// Mock the database with realistic behavior that matches actual usage patterns
jest.mock('@/lib/db', () => {
  const mockData = {
    users: new Map(),
    chatbots: new Map(),
    widgetConfigs: new Map(),
  };

  const mockDb = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn((limit) => {
            // Return data based on the current query context
            return Promise.resolve([]);
          })
        }))
      }))
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([{}]))
      }))
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([{}]))
        }))
      }))
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([{}]))
      }))
    })),
    _mockData: mockData
  };

  return { db: mockDb };
});

// Mock schema
jest.mock('@/lib/db/schema', () => ({
  chatbotInstances: {
    id: 'id',
    createdBy: 'createdBy',
    name: 'name'
  },
  chatbotWidgetConfigs: {
    id: 'id',
    chatbotId: 'chatbotId',
    apiKey: 'apiKey'
  }
}));

describe('Complete Widget Database Integration', () => {
  const testUserId = 'user-123';
  const testChatbotId = 'chatbot-456';

  beforeEach(() => {
    jest.clearAllMocks();
    const { db } = require('@/lib/db');

    // Setup successful database mocks for this flow
    let callCount = 0;

    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => {
            callCount++;

            // First call: chatbot exists check - return chatbot
            if (callCount === 1) {
              return Promise.resolve([{
                id: testChatbotId,
                createdBy: testUserId,
                name: 'Test Chatbot'
              }]);
            }

            // Second call: widget config check - return empty initially
            if (callCount === 2) {
              return Promise.resolve([]);
            }

            // Third call: retrieve widget config - return config
            if (callCount >= 3) {
              return Promise.resolve([{
                id: 'widget-789',
                chatbotId: testChatbotId,
                name: 'Test Widget',
                apiKey: 'cb_widget_test_key',
                themeConfig: { primary_color: '#3b82f6' },
                status: 'active',
                version: 1
              }]);
            }

            return Promise.resolve([]);
          })
        }))
      }))
    }));

    // Mock successful insert
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          id: 'widget-789',
          chatbotId: testChatbotId,
          name: 'Test Widget',
          apiKey: 'cb_widget_test_key',
          themeConfig: { primary_color: '#3b82f6' },
          status: 'active',
          version: 1
        }])
      })
    });

    // Mock successful update
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: 'widget-789',
            chatbotId: testChatbotId,
            apiKey: 'cb_widget_updated_key',
            version: 2
          }])
        })
      })
    });
  });

  describe('End-to-End Widget Deployment Workflow', () => {
    it('should complete full widget creation and configuration flow', async () => {
      // Step 1: Create widget configuration (simulating user creating widget in dashboard)
      const widgetConfig = {
        chatbotId: testChatbotId,
        name: 'My Website Widget',
        apiKey: 'initial_key',
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
          greeting_message: 'Hello! How can I help you today?',
          placeholder_text: 'Type your message...',
          auto_open: false,
          auto_open_delay: 3000,
          show_typing_indicator: true,
          sound_enabled: true,
          persistent: true
        },
        securityConfig: {
          allowed_domains: ['mywebsite.com', '*.staging.mywebsite.com'],
          rate_limit_enabled: true,
          rate_limit_per_minute: 30,
          csrf_protection: true
        },
        brandingConfig: {
          show_powered_by: false,
          bot_name: 'Support Assistant',
          company_name: 'My Company'
        },
        analyticsConfig: {
          track_events: true,
          track_user_behavior: true,
          session_recording: false
        },
        status: 'active' as const,
        version: 1
      };

      const createdWidget = await WidgetService.saveWidgetConfig(widgetConfig, testUserId);

      expect(createdWidget).toBeDefined();
      expect(createdWidget.chatbotId).toBe(testChatbotId);
      expect(createdWidget.status).toBe('active');

      // Step 2: Generate secure API key
      const apiKey = await WidgetService.generateApiKey(testChatbotId, testUserId);

      expect(apiKey).toBeDefined();
      expect(apiKey).toMatch(/^cb_widget_/);

      // Step 3: Generate embed code for website integration
      const embedCode = WidgetService.generateEmbedCode(apiKey, createdWidget);

      expect(embedCode).toContain('<!-- Chatbot Widget -->');
      expect(embedCode).toContain(apiKey);
      expect(embedCode).toContain(testChatbotId);
      expect(embedCode).toContain('bottom-right');
      expect(embedCode).toContain('Hello! How can I help you today?');
      expect(embedCode).toContain('Support Assistant');
      expect(embedCode).toContain('window.ChatbotWidget.init');

      // Step 4: Validate domain access (simulating widget loading on website)
      const validDomain = await WidgetService.validateDomainAccess(apiKey, 'mywebsite.com');
      expect(validDomain).toBe(true);

      const invalidDomain = await WidgetService.validateDomainAccess(apiKey, 'unauthorized.com');
      expect(invalidDomain).toBe(false);

      // Step 5: Track analytics events (simulating user interactions)
      const analyticsEvent = {
        chatbotId: testChatbotId,
        eventType: 'widget_load' as const,
        eventData: {
          page: '/contact',
          version: '1.0',
          deployment: 'production'
        },
        userId: 'visitor-789',
        sessionId: 'session-abc123',
        domain: 'mywebsite.com',
        pageUrl: 'https://mywebsite.com/contact',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        referrer: 'https://google.com',
        timestamp: new Date()
      };

      const trackingResult = await WidgetAnalyticsService.trackEvent(analyticsEvent);
      expect(trackingResult).toBe(true);

      console.log('✅ Complete widget deployment workflow test passed');
    });

    it('should handle widget configuration updates', async () => {
      // Retrieve existing widget
      const existingWidget = await WidgetService.getWidgetConfig(testChatbotId, testUserId);
      expect(existingWidget).toBeDefined();

      // Update widget configuration
      const updatedConfig = {
        ...existingWidget!,
        name: 'Updated Widget Name',
        themeConfig: {
          ...existingWidget!.themeConfig,
          primary_color: '#ff6b35' // Changed to orange
        },
        behaviorConfig: {
          ...existingWidget!.behaviorConfig,
          greeting_message: 'Welcome! How may I assist you today?' // Updated greeting
        },
        version: 2
      };

      const result = await WidgetService.saveWidgetConfig(updatedConfig, testUserId);

      expect(result).toBeDefined();
      expect(result.version).toBe(2);
      expect(result.themeConfig.primary_color).toBe('#ff6b35');
      expect(result.behaviorConfig.greeting_message).toBe('Welcome! How may I assist you today?');

      console.log('✅ Widget configuration update test passed');
    });

    it('should generate comprehensive analytics data', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const endDate = new Date();

      const analyticsData = await WidgetAnalyticsService.getAnalyticsData(
        testChatbotId,
        startDate,
        endDate
      );

      expect(analyticsData).toBeDefined();
      expect(analyticsData.totalEvents).toBeGreaterThanOrEqual(0);
      expect(analyticsData.uniqueUsers).toBeGreaterThanOrEqual(0);
      expect(analyticsData.period).toBeDefined();
      expect(analyticsData.period.start).toBeDefined();
      expect(analyticsData.period.end).toBeDefined();

      console.log('✅ Analytics data generation test passed');
    });

    it('should handle security validations correctly', async () => {
      // Test domain restrictions
      const widget = await WidgetService.getWidgetConfig(testChatbotId, testUserId);
      expect(widget).toBeDefined();

      const apiKey = widget!.apiKey;

      // Test exact domain match
      expect(await WidgetService.validateDomainAccess(apiKey, 'mywebsite.com')).toBe(true);

      // Test wildcard subdomain match
      expect(await WidgetService.validateDomainAccess(apiKey, 'app.staging.mywebsite.com')).toBe(true);

      // Test blocked domain
      expect(await WidgetService.validateDomainAccess(apiKey, 'malicious.com')).toBe(false);

      // Test invalid API key
      expect(await WidgetService.validateDomainAccess('invalid_key', 'mywebsite.com')).toBe(false);

      console.log('✅ Security validation test passed');
    });

    it('should generate widget statistics', async () => {
      const stats = WidgetService.generateWidgetStats();

      expect(stats).toBeDefined();
      expect(typeof stats.total_conversations).toBe('number');
      expect(typeof stats.unique_visitors).toBe('number');
      expect(typeof stats.conversion_rate).toBe('number');
      expect(typeof stats.average_session_duration).toBe('number');
      expect(stats.most_active_domain).toBeDefined();
      expect(typeof stats.bounce_rate).toBe('number');

      // Verify realistic ranges
      expect(stats.total_conversations).toBeGreaterThan(0);
      expect(stats.unique_visitors).toBeGreaterThan(0);
      expect(stats.conversion_rate).toBeGreaterThan(0);
      expect(stats.conversion_rate).toBeLessThan(100);
      expect(stats.bounce_rate).toBeGreaterThan(0);
      expect(stats.bounce_rate).toBeLessThan(100);

      console.log('✅ Widget statistics generation test passed');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle unauthorized access attempts', async () => {
      const unauthorizedUserId = 'unauthorized-user';

      await expect(
        WidgetService.getWidgetConfig(testChatbotId, unauthorizedUserId)
      ).rejects.toThrow('Chatbot not found or access denied');

      console.log('✅ Unauthorized access handling test passed');
    });

    it('should handle non-existent chatbot', async () => {
      const nonExistentChatbotId = 'non-existent-chatbot';

      await expect(
        WidgetService.getWidgetConfig(nonExistentChatbotId, testUserId)
      ).rejects.toThrow('Chatbot not found or access denied');

      console.log('✅ Non-existent chatbot handling test passed');
    });

    it('should handle invalid API key gracefully', async () => {
      const result = await WidgetService.validateDomainAccess('invalid-api-key', 'example.com');
      expect(result).toBe(false);

      console.log('✅ Invalid API key handling test passed');
    });
  });
});