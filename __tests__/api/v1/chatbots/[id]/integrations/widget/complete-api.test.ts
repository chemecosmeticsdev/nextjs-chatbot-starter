import { NextRequest } from 'next/server';
import { GET, POST, PUT, DELETE } from '@/app/api/v1/chatbots/[id]/integrations/widget/route';
import { GET as GetApiKey, POST as PostApiKey } from '@/app/api/v1/chatbots/[id]/integrations/widget/api-key/route';
import { GET as GetAnalytics, POST as PostAnalytics } from '@/app/api/v1/chatbots/[id]/integrations/widget/analytics/route';
import { GET as GetEmbed } from '@/app/api/v1/chatbots/[id]/integrations/widget/embed/route';
import { GET as GetLoader } from '@/app/api/integrations/widget/[id]/loader.js/route';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// Mock the database and external dependencies
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

jest.mock('@/lib/middleware/api-auth', () => ({
  requireAuth: jest.fn()
}));

jest.mock('@/lib/middleware/rate-limit', () => ({
  rateLimitMiddleware: jest.fn()
}));

jest.mock('@/lib/middleware/sanitize', () => ({
  sanitizeInput: jest.fn(input => input)
}));

describe('Widget API Endpoints Complete Testing', () => {
  const mockUserId = 'user-123';
  const mockChatbotId = 'chatbot-456';
  const mockApiKey = 'cb_widget_chatbot4_1699999999_randomstring';

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    name: 'Test User'
  };

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
      position: 'bottom-right',
      width: 380,
      height: 500,
      margin: 20,
      bubble_style: 'circle'
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
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful authentication
    const { requireAuth } = require('@/lib/middleware/api-auth');
    requireAuth.mockResolvedValue({
      success: true,
      user: mockUser
    });

    // Mock successful rate limiting
    const { rateLimitMiddleware } = require('@/lib/middleware/rate-limit');
    rateLimitMiddleware.mockResolvedValue({
      success: true
    });
  });

  describe('Widget Configuration API', () => {
    describe('GET /api/v1/chatbots/[id]/integrations/widget', () => {
      it('should retrieve widget configuration successfully', async () => {
        // Mock database queries
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget');
        const params = { id: mockChatbotId };

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.config).toBeDefined();
        expect(data.stats).toBeDefined();
      });

      it('should return 404 when chatbot not found', async () => {
        // Mock empty chatbot result
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/nonexistent/integrations/widget');
        const params = { id: 'nonexistent' };

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('Chatbot not found');
      });

      it('should return 404 when widget configuration not found', async () => {
        // Mock chatbot found but no widget config
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget');
        const params = { id: mockChatbotId };

        const response = await GET(request, { params });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('Widget configuration not found');
      });
    });

    describe('POST /api/v1/chatbots/[id]/integrations/widget', () => {
      it('should create widget configuration successfully', async () => {
        // Mock chatbot exists
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
                limit: jest.fn().mockResolvedValue([]) // No existing config
              })
            })
          });

        // Mock successful insert
        (db.insert as jest.Mock).mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockWidgetConfig])
          })
        });

        const validConfig = {
          name: 'Test Widget',
          theme: mockWidgetConfig.themeConfig,
          layout: mockWidgetConfig.layoutConfig,
          behavior: mockWidgetConfig.behaviorConfig,
          security: mockWidgetConfig.securityConfig,
          branding: mockWidgetConfig.brandingConfig,
          analytics: mockWidgetConfig.analyticsConfig,
          status: 'active'
        };

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget', {
          method: 'POST',
          body: JSON.stringify(validConfig),
          headers: { 'Content-Type': 'application/json' }
        });
        const params = { id: mockChatbotId };

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.config).toBeDefined();
        expect(data.message).toBe('Widget configuration created');
      });

      it('should update existing widget configuration', async () => {
        // Mock chatbot exists and widget config exists
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
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ ...mockWidgetConfig, version: 2 }])
            })
          })
        });

        const updateConfig = {
          name: 'Updated Widget',
          theme: mockWidgetConfig.themeConfig,
          layout: mockWidgetConfig.layoutConfig,
          behavior: mockWidgetConfig.behaviorConfig,
          security: mockWidgetConfig.securityConfig,
          branding: mockWidgetConfig.brandingConfig,
          analytics: mockWidgetConfig.analyticsConfig,
          status: 'active'
        };

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget', {
          method: 'POST',
          body: JSON.stringify(updateConfig),
          headers: { 'Content-Type': 'application/json' }
        });
        const params = { id: mockChatbotId };

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe('Widget configuration updated');
      });

      it('should return 400 for invalid configuration', async () => {
        const invalidConfig = {
          name: '', // Invalid: empty name
          theme: {
            primary_color: 'invalid-color' // Invalid: not hex color
          }
        };

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget', {
          method: 'POST',
          body: JSON.stringify(invalidConfig),
          headers: { 'Content-Type': 'application/json' }
        });
        const params = { id: mockChatbotId };

        const response = await POST(request, { params });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Validation failed');
        expect(data.details).toBeDefined();
      });
    });

    describe('DELETE /api/v1/chatbots/[id]/integrations/widget', () => {
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget', {
          method: 'DELETE'
        });
        const params = { id: mockChatbotId };

        const response = await DELETE(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe('Widget configuration deleted');
      });

      it('should return 404 when no widget configuration to delete', async () => {
        // Mock chatbot exists but no widget config
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget', {
          method: 'DELETE'
        });
        const params = { id: mockChatbotId };

        const response = await DELETE(request, { params });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('Widget configuration not found');
      });
    });
  });

  describe('API Key Management', () => {
    describe('POST /api/v1/chatbots/[id]/integrations/widget/api-key', () => {
      it('should generate new API key successfully', async () => {
        // Mock chatbot exists
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/api-key', {
          method: 'POST'
        });
        const params = { id: mockChatbotId };

        const response = await PostApiKey(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.api_key).toMatch(/^cb_widget_/);
        expect(data.message).toBe('API key generated successfully');
        expect(data.generated_at).toBeDefined();
      });

      it('should create default widget config when none exists', async () => {
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

        // Mock successful insert
        (db.insert as jest.Mock).mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined)
        });

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/api-key', {
          method: 'POST'
        });
        const params = { id: mockChatbotId };

        const response = await PostApiKey(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.api_key).toMatch(/^cb_widget_/);
      });
    });

    describe('GET /api/v1/chatbots/[id]/integrations/widget/api-key', () => {
      it('should retrieve current API key successfully', async () => {
        // Mock chatbot exists
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
                limit: jest.fn().mockResolvedValue([{
                  apiKey: mockApiKey,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }])
              })
            })
          });

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/api-key');
        const params = { id: mockChatbotId };

        const response = await GetApiKey(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.api_key).toBe(mockApiKey);
        expect(data.created_at).toBeDefined();
        expect(data.last_updated).toBeDefined();
      });
    });
  });

  describe('Analytics API', () => {
    describe('GET /api/v1/chatbots/[id]/integrations/widget/analytics', () => {
      it('should retrieve analytics data successfully', async () => {
        // Mock chatbot and widget config exist
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/analytics?range=7d');
        const params = { id: mockChatbotId };

        const response = await GetAnalytics(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.timeRange).toBe('7d');
        expect(data.data.summary).toBeDefined();
        expect(data.data.dailyData).toBeInstanceOf(Array);
        expect(data.data.topDomains).toBeInstanceOf(Array);
        expect(data.data.topPages).toBeInstanceOf(Array);
        expect(data.data.realTimeMetrics).toBeDefined();
        expect(data.data.userBehavior).toBeDefined();
      });

      it('should handle different time ranges', async () => {
        // Mock chatbot and widget config exist
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/analytics?range=30d&metrics=conversations,visitors');
        const params = { id: mockChatbotId };

        const response = await GetAnalytics(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.timeRange).toBe('30d');
      });
    });

    describe('POST /api/v1/chatbots/[id]/integrations/widget/analytics', () => {
      it('should track analytics event successfully', async () => {
        // Mock widget config exists with analytics enabled
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

        const eventData = {
          event_type: 'widget_load',
          event_data: { page: '/home' },
          user_id: 'user-123',
          session_id: 'session-456',
          domain: 'example.com',
          page_url: 'https://example.com/home'
        };

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/analytics', {
          method: 'POST',
          body: JSON.stringify(eventData),
          headers: { 'Content-Type': 'application/json' }
        });
        const params = { id: mockChatbotId };

        const response = await PostAnalytics(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe('Analytics event recorded');
      });

      it('should skip tracking when analytics disabled', async () => {
        // Mock widget config exists with analytics disabled
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

        const eventData = {
          event_type: 'widget_load',
          session_id: 'session-456',
          domain: 'example.com',
          page_url: 'https://example.com/home'
        };

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/analytics', {
          method: 'POST',
          body: JSON.stringify(eventData),
          headers: { 'Content-Type': 'application/json' }
        });
        const params = { id: mockChatbotId };

        const response = await PostAnalytics(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toBe('Analytics tracking disabled');
      });
    });
  });

  describe('Embed Code Generation', () => {
    describe('GET /api/v1/chatbots/[id]/integrations/widget/embed', () => {
      it('should generate HTML embed code successfully', async () => {
        // Mock chatbot and widget config exist
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/embed?format=html');
        const params = { id: mockChatbotId };

        const response = await GetEmbed(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.format).toBe('html');
        expect(data.embed_code).toContain('<!-- Chatbot Widget -->');
        expect(data.embed_code).toContain(mockApiKey);
        expect(data.instructions).toBeDefined();
        expect(data.integration_info).toBeDefined();
        expect(data.examples).toBeDefined();
        expect(data.testing).toBeDefined();
      });

      it('should generate React embed code successfully', async () => {
        // Mock chatbot and widget config exist
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

        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/embed?format=react');
        const params = { id: mockChatbotId };

        const response = await GetEmbed(request, { params });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.format).toBe('react');
        expect(data.embed_code).toContain('import React');
        expect(data.embed_code).toContain('useEffect');
      });

      it('should return 400 for invalid format', async () => {
        const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget/embed?format=invalid');
        const params = { id: mockChatbotId };

        const response = await GetEmbed(request, { params });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Invalid format');
      });
    });
  });

  describe('Widget Loader', () => {
    describe('GET /api/integrations/widget/[id]/loader.js', () => {
      it('should serve widget loader successfully', async () => {
        // Mock widget config exists and is active
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{
                ...mockWidgetConfig,
                status: 'active'
              }])
            })
          })
        });

        // Mock file system read
        const fs = require('fs/promises');
        jest.spyOn(fs, 'readFile').mockResolvedValue('// Mock widget.js content\nwindow.ChatbotWidget = {};');

        const request = new NextRequest('http://localhost:3000/api/integrations/widget/chatbot-456/loader.js', {
          headers: {
            'referer': 'https://example.com/page'
          }
        });
        const params = { id: mockChatbotId };

        const response = await GetLoader(request, { params });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

        const content = await response.text();
        expect(content).toContain('chatbotConfig');
        expect(content).toContain(mockApiKey);
        expect(content).toContain(mockChatbotId);
      });

      it('should return 404 for non-existent widget', async () => {
        // Mock no widget config found
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

        const request = new NextRequest('http://localhost:3000/api/integrations/widget/nonexistent/loader.js');
        const params = { id: 'nonexistent' };

        const response = await GetLoader(request, { params });

        expect(response.status).toBe(404);
        expect(await response.text()).toBe('Widget not found');
      });

      it('should return 403 for inactive widget', async () => {
        // Mock widget config exists but is inactive
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{
                ...mockWidgetConfig,
                status: 'inactive'
              }])
            })
          })
        });

        const request = new NextRequest('http://localhost:3000/api/integrations/widget/chatbot-456/loader.js');
        const params = { id: mockChatbotId };

        const response = await GetLoader(request, { params });

        expect(response.status).toBe(403);
        expect(await response.text()).toBe('Widget not active');
      });

      it('should enforce domain restrictions', async () => {
        // Mock widget config with domain restrictions
        (db.select as jest.Mock).mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{
                ...mockWidgetConfig,
                status: 'active',
                securityConfig: {
                  allowed_domains: ['allowed.com'],
                  rate_limit_enabled: true,
                  rate_limit_per_minute: 30,
                  csrf_protection: true
                }
              }])
            })
          })
        });

        const request = new NextRequest('http://localhost:3000/api/integrations/widget/chatbot-456/loader.js', {
          headers: {
            'referer': 'https://blocked.com/page'
          }
        });
        const params = { id: mockChatbotId };

        const response = await GetLoader(request, { params });

        expect(response.status).toBe(403);
        expect(await response.text()).toBe('Domain not allowed');
      });
    });
  });

  describe('Authentication & Authorization', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Mock failed authentication
      const { requireAuth } = require('@/lib/middleware/api-auth');
      requireAuth.mockResolvedValue({
        success: false,
        error: 'Authentication required'
      });

      const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget');
      const params = { id: mockChatbotId };

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 429 for rate limited requests', async () => {
      // Mock rate limit exceeded
      const { rateLimitMiddleware } = require('@/lib/middleware/rate-limit');
      rateLimitMiddleware.mockResolvedValue({
        success: false
      });

      const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget');
      const params = { id: mockChatbotId };

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should verify chatbot ownership', async () => {
      // Mock chatbot belongs to different user
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget');
      const params = { id: mockChatbotId };

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Chatbot not found');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      (db.select as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget');
      const params = { id: mockChatbotId };

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle invalid JSON in POST requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/chatbots/chatbot-456/integrations/widget', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' }
      });
      const params = { id: mockChatbotId };

      const response = await POST(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});