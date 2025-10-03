import { WidgetService } from '@/lib/services/widget-service';
import { WidgetAnalyticsService } from '@/lib/services/widget-analytics';
import { db } from '@/lib/db';

// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn()
      })
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn()
        })
      })
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn()
      })
    }),
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

describe('Widget Service Layer Tests', () => {
  const mockUserId = 'user-123';
  const mockChatbotId = 'chatbot-456';
  const mockApiKey = 'cb_widget_chatbot4_1699999999_randomstring';

  const mockChatbot = {
    id: mockChatbotId,
    userId: mockUserId,
    name: 'Test Chatbot',
    systemPrompt: 'Test prompt',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockWidgetConfig = {
    id: 'widget-789',
    chatbotId: mockChatbotId,
    name: 'Test Widget',
    apiKey: mockApiKey,
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
  });

  describe('WidgetService', () => {
    describe('getWidgetConfig', () => {
      it('should retrieve widget configuration successfully', async () => {
        // Mock chatbot and widget config queries
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

        const result = await WidgetService.getWidgetConfig(mockChatbotId, mockUserId);

        expect(result).toEqual(mockWidgetConfig);
        expect(db.select).toHaveBeenCalledTimes(2);
      });

      it('should return null when widget config not found', async () => {
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

        const result = await WidgetService.getWidgetConfig(mockChatbotId, mockUserId);

        expect(result).toBeNull();
      });

      it('should throw error when chatbot not found', async () => {
        // Mock chatbot not found
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        await expect(
          WidgetService.getWidgetConfig(mockChatbotId, mockUserId)
        ).rejects.toThrow('Chatbot not found or access denied');
      });

      it('should throw error when user does not own chatbot', async () => {
        // Mock chatbot belongs to different user
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        await expect(
          WidgetService.getWidgetConfig(mockChatbotId, 'different-user')
        ).rejects.toThrow('Chatbot not found or access denied');
      });
    });

    describe('saveWidgetConfig', () => {
      const validConfig = {
        chatbotId: mockChatbotId,
        name: 'Test Widget',
        apiKey: mockApiKey,
        themeConfig: mockWidgetConfig.themeConfig,
        layoutConfig: mockWidgetConfig.layoutConfig,
        behaviorConfig: mockWidgetConfig.behaviorConfig,
        securityConfig: mockWidgetConfig.securityConfig,
        brandingConfig: mockWidgetConfig.brandingConfig,
        analyticsConfig: mockWidgetConfig.analyticsConfig,
        status: 'active' as const,
        version: 1
      };

      it('should create new widget configuration', async () => {
        // Mock chatbot exists and no existing config
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

        // Mock successful insert
        (db.insert as jest.Mock).mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        });

        const result = await WidgetService.saveWidgetConfig(validConfig, mockUserId);

        expect(result).toEqual(mockWidgetConfig);
        expect(db.insert).toHaveBeenCalled();
      });

      it('should update existing widget configuration', async () => {
        // Mock chatbot exists and config exists
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

        // Mock successful update
        const updatedConfig = { ...mockWidgetConfig, version: 2 };
        (db.update as jest.Mock).mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([updatedConfig])
            })
          })
        });

        const result = await WidgetService.saveWidgetConfig(validConfig, mockUserId);

        expect(result).toEqual(updatedConfig);
        expect(result.version).toBe(2);
        expect(db.update).toHaveBeenCalled();
      });

      it('should throw error for unauthorized access', async () => {
        // Mock chatbot not found for user
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        await expect(
          WidgetService.saveWidgetConfig(validConfig, 'different-user')
        ).rejects.toThrow('Chatbot not found or access denied');
      });
    });

    describe('generateApiKey', () => {
      it('should generate new API key for existing config', async () => {
        // Mock chatbot exists and config exists
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

        // Mock successful update
        (db.update as jest.Mock).mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        });

        const result = await WidgetService.generateApiKey(mockChatbotId, mockUserId);

        expect(result).toMatch(/^cb_widget_/);
        expect(result).toContain(mockChatbotId.substring(0, 8));
        expect(db.update).toHaveBeenCalled();
      });

      it('should create default config if none exists', async () => {
        // Mock chatbot exists but no config
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

        // Mock successful insert for default config
        (db.insert as jest.Mock).mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{
              id: 'widget-789',
              chatbotId: mockChatbotId,
              name: 'Website Chat Widget',
              apiKey: 'cb_widget_test_key',
              version: 1
            }])
          })
        });

        const result = await WidgetService.generateApiKey(mockChatbotId, mockUserId);

        expect(result).toMatch(/^cb_widget_/);
        expect(db.insert).toHaveBeenCalled();
      });
    });

    describe('deleteWidgetConfig', () => {
      it('should delete widget configuration successfully', async () => {
        // Mock chatbot exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        });

        // Mock successful delete
        (db.delete as jest.Mock).mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        });

        const result = await WidgetService.deleteWidgetConfig(mockChatbotId, mockUserId);

        expect(result).toBe(true);
        expect(db.delete).toHaveBeenCalled();
      });

      it('should return false when no config to delete', async () => {
        // Mock chatbot exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockChatbot])
            })
          })
        });

        // Mock empty delete result
        (db.delete as jest.Mock).mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        });

        const result = await WidgetService.deleteWidgetConfig(mockChatbotId, mockUserId);

        expect(result).toBe(false);
      });
    });

    describe('getWidgetConfigByApiKey', () => {
      it('should retrieve config by API key', async () => {
        // Mock successful query
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetService.getWidgetConfigByApiKey(mockApiKey);

        expect(result).toEqual(mockWidgetConfig);
      });

      it('should return null for invalid API key', async () => {
        // Mock empty result
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        const result = await WidgetService.getWidgetConfigByApiKey('invalid-key');

        expect(result).toBeNull();
      });
    });

    describe('validateDomainAccess', () => {
      it('should allow access for allowed domain', async () => {
        // Mock config with allowed domains
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetService.validateDomainAccess(mockApiKey, 'example.com');

        expect(result).toBe(true);
      });

      it('should block access for disallowed domain', async () => {
        // Mock config with allowed domains
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetService.validateDomainAccess(mockApiKey, 'blocked.com');

        expect(result).toBe(false);
      });

      it('should allow all domains when no restrictions set', async () => {
        // Mock config with no domain restrictions
        const configNoDomains = {
          ...mockWidgetConfig,
          securityConfig: {
            ...mockWidgetConfig.securityConfig,
            allowed_domains: []
          }
        };

        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([configNoDomains])
            })
          })
        });

        const result = await WidgetService.validateDomainAccess(mockApiKey, 'any-domain.com');

        expect(result).toBe(true);
      });

      it('should handle wildcard subdomains', async () => {
        // Mock config with wildcard domain
        const configWildcard = {
          ...mockWidgetConfig,
          securityConfig: {
            ...mockWidgetConfig.securityConfig,
            allowed_domains: ['*.example.com']
          }
        };

        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([configWildcard])
            })
          })
        });

        const result = await WidgetService.validateDomainAccess(mockApiKey, 'subdomain.example.com');

        expect(result).toBe(true);
      });

      it('should return false for invalid API key', async () => {
        // Mock empty result
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        const result = await WidgetService.validateDomainAccess('invalid-key', 'example.com');

        expect(result).toBe(false);
      });
    });

    describe('generateEmbedCode', () => {
      it('should generate valid embed code', async () => {
        const embedCode = WidgetService.generateEmbedCode(mockApiKey, mockWidgetConfig);

        expect(embedCode).toContain('<!-- Chatbot Widget -->');
        expect(embedCode).toContain(mockApiKey);
        expect(embedCode).toContain(mockChatbotId);
        expect(embedCode).toContain('window.ChatbotWidget.init');
        expect(embedCode).toContain('script.src');
        expect(embedCode).toContain('/api/integrations/widget/');
      });

      it('should include configuration in embed code', async () => {
        const embedCode = WidgetService.generateEmbedCode(mockApiKey, mockWidgetConfig);

        // Check for key configuration values instead of exact JSON formatting
        expect(embedCode).toContain('#3b82f6'); // primary_color
        expect(embedCode).toContain('bottom-right'); // position
        expect(embedCode).toContain('Hi! How can I help you today?'); // greeting_message
        expect(embedCode).toContain('Assistant'); // bot_name
        expect(embedCode).toContain('true'); // show_powered_by as string
      });
    });

    describe('generateWidgetStats', () => {
      it('should generate mock statistics', async () => {
        const stats = WidgetService.generateWidgetStats();

        expect(stats).toHaveProperty('total_conversations');
        expect(stats).toHaveProperty('unique_visitors');
        expect(stats).toHaveProperty('conversion_rate');
        expect(stats).toHaveProperty('average_session_duration');
        expect(stats).toHaveProperty('most_active_domain');
        expect(stats).toHaveProperty('bounce_rate');

        expect(typeof stats.total_conversations).toBe('number');
        expect(typeof stats.unique_visitors).toBe('number');
        expect(typeof stats.conversion_rate).toBe('number');
        expect(typeof stats.average_session_duration).toBe('number');
        expect(typeof stats.bounce_rate).toBe('number');

        expect(stats.total_conversations).toBeGreaterThan(0);
        expect(stats.unique_visitors).toBeGreaterThan(0);
      });
    });
  });

  describe('WidgetAnalyticsService', () => {
    const mockAnalyticsQuery = {
      chatbotId: mockChatbotId,
      timeRange: '7d' as const
    };

    const mockAnalyticsEvent = {
      chatbotId: mockChatbotId,
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

    describe('trackEvent', () => {
      it('should track event when analytics enabled', async () => {
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

        const result = await WidgetAnalyticsService.trackEvent(mockAnalyticsEvent);

        expect(result).toBe(true);
      });

      it('should skip tracking when analytics disabled', async () => {
        // Mock widget config with analytics disabled
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{
                ...mockWidgetConfig,
                analyticsConfig: { track_events: false }
              }])
            })
          })
        });

        const result = await WidgetAnalyticsService.trackEvent(mockAnalyticsEvent);

        expect(result).toBe(false);
      });

      it('should return false when widget config not found', async () => {
        // Mock empty result
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        const result = await WidgetAnalyticsService.trackEvent(mockAnalyticsEvent);

        expect(result).toBe(false);
      });
    });

    describe('getAnalyticsData', () => {
      it('should retrieve analytics data successfully', async () => {
        // Mock widget config exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetAnalyticsService.getAnalyticsData(mockAnalyticsQuery);

        expect(result).toHaveProperty('timeRange', '7d');
        expect(result).toHaveProperty('startDate');
        expect(result).toHaveProperty('endDate');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('dailyData');
        expect(result).toHaveProperty('topDomains');
        expect(result).toHaveProperty('topPages');
        expect(result).toHaveProperty('realTimeMetrics');
        expect(result).toHaveProperty('userBehavior');
        expect(result).toHaveProperty('widgetConfig');

        expect(Array.isArray(result.dailyData)).toBe(true);
        expect(Array.isArray(result.topDomains)).toBe(true);
        expect(Array.isArray(result.topPages)).toBe(true);
      });

      it('should handle different time ranges', async () => {
        // Mock widget config exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const query30d = { ...mockAnalyticsQuery, timeRange: '30d' as const };
        const result = await WidgetAnalyticsService.getAnalyticsData(query30d);

        expect(result.timeRange).toBe('30d');
        expect(result.dailyData.length).toBeGreaterThan(7);
      });

      it('should throw error when widget config not found', async () => {
        // Mock empty result
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        await expect(
          WidgetAnalyticsService.getAnalyticsData(mockAnalyticsQuery)
        ).rejects.toThrow('Widget configuration not found');
      });
    });

    describe('getRealTimeMetrics', () => {
      it('should retrieve real-time metrics', async () => {
        // Mock widget config exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetAnalyticsService.getRealTimeMetrics(mockChatbotId);

        expect(result).toHaveProperty('active_sessions');
        expect(result).toHaveProperty('messages_last_hour');
        expect(result).toHaveProperty('response_time_last_hour');
        expect(result).toHaveProperty('online_status');
        expect(result).toHaveProperty('widget_loads_last_hour');

        expect(typeof result.active_sessions).toBe('number');
        expect(typeof result.messages_last_hour).toBe('number');
        expect(typeof result.response_time_last_hour).toBe('number');
        expect(result.online_status).toBe('healthy');
      });
    });

    describe('getPerformanceMetrics', () => {
      it('should retrieve performance metrics', async () => {
        // Mock widget config exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetAnalyticsService.getPerformanceMetrics(mockChatbotId);

        expect(result).toHaveProperty('load_time');
        expect(result).toHaveProperty('error_rate');
        expect(result).toHaveProperty('uptime');
        expect(result).toHaveProperty('response_time');

        expect(result.load_time).toHaveProperty('avg');
        expect(result.load_time).toHaveProperty('p95');
        expect(result.load_time).toHaveProperty('p99');
        expect(result.response_time).toHaveProperty('avg');
        expect(result.response_time).toHaveProperty('median');
      });
    });

    describe('getConversionFunnel', () => {
      it('should retrieve conversion funnel data', async () => {
        // Mock widget config exists
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockWidgetConfig])
            })
          })
        });

        const result = await WidgetAnalyticsService.getConversionFunnel(mockChatbotId);

        expect(result).toHaveProperty('steps');
        expect(result).toHaveProperty('conversion_rate');

        expect(Array.isArray(result.steps)).toBe(true);
        expect(result.steps).toHaveLength(4);

        result.steps.forEach(step => {
          expect(step).toHaveProperty('name');
          expect(step).toHaveProperty('count');
          expect(step).toHaveProperty('percentage');
          expect(typeof step.count).toBe('number');
          expect(typeof step.percentage).toBe('number');
        });
      });
    });

    describe('validateAnalyticsConfig', () => {
      it('should return true when analytics enabled', async () => {
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

        const result = await WidgetAnalyticsService.validateAnalyticsConfig(mockChatbotId);

        expect(result).toBe(true);
      });

      it('should return false when analytics disabled', async () => {
        // Mock widget config with analytics disabled
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{
                ...mockWidgetConfig,
                analyticsConfig: { track_events: false }
              }])
            })
          })
        });

        const result = await WidgetAnalyticsService.validateAnalyticsConfig(mockChatbotId);

        expect(result).toBe(false);
      });

      it('should return false when widget config not found', async () => {
        // Mock empty result
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        const result = await WidgetAnalyticsService.validateAnalyticsConfig(mockChatbotId);

        expect(result).toBe(false);
      });
    });
  });
});