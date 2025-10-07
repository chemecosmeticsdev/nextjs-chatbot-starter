import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { testData, MockUserService } from '@/lib/test-utils';

// Mock the database connection
jest.mock('@/lib/db/connection', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}));

// Mock dependencies
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mocked-hash')
  })),
  randomBytes: jest.fn(() => 'mocked-random')
}));

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mocked-nanoid')
}));

describe('ChatbotService', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = require('@/lib/db/connection').db;
    MockUserService.clearUsers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createChatbot', () => {
    it('should create a new chatbot with valid data', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      const createData = {
        name: 'Test Chatbot',
        description: 'A test chatbot',
        createdBy: user.id,
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.8
        },
        currentSystemPrompt: 'You are a helpful assistant.'
      };

      const mockChatbot = {
        id: 'chatbot-123',
        name: createData.name,
        description: createData.description,
        createdBy: createData.createdBy,
        status: 'testing',
        apiKeyHash: 'mocked-hash',
        apiKeyHint: 'nanoid',
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.8,
          maxTokens: 1000,
          language: 'en',
          responseTimeout: 30
        },
        knowledgeSourceFilters: {},
        currentSystemPrompt: createData.currentSystemPrompt,
        welcomeMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      };

      // Mock the database insert for chatbot
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      // Mock the database insert for prompt history
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([])
      });

      const result = await ChatbotService.createChatbot(createData);

      expect(result.chatbot).toMatchObject({
        id: 'chatbot-123',
        name: 'Test Chatbot',
        status: 'testing'
      });
      expect(result.apiKey).toBe('cb_mocked-nanoid');
    });

    it('should create chatbot with default configuration values', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      const createData = {
        name: 'Minimal Chatbot',
        createdBy: user.id
      };

      const mockChatbot = {
        id: 'chatbot-456',
        name: createData.name,
        createdBy: createData.createdBy,
        status: 'testing',
        configuration: {
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          temperature: 0.7,
          maxTokens: 1000,
          language: 'en',
          responseTimeout: 30
        }
      };

      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.createChatbot(createData);

      expect(result.chatbot.configuration).toMatchObject({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0.7,
        maxTokens: 1000,
        language: 'en',
        responseTimeout: 30
      });
    });
  });

  describe('listChatbots', () => {
    it('should list chatbots with pagination', async () => {
      const mockChatbots = [
        {
          id: 'chatbot-1',
          name: 'Chatbot 1',
          status: 'active',
          conversationCount: 0,
          userCount: 0,
          lastActivity: null
        },
        {
          id: 'chatbot-2',
          name: 'Chatbot 2',
          status: 'testing',
          conversationCount: 0,
          userCount: 0,
          lastActivity: null
        }
      ];

      const mockCount = [{ count: 2 }];

      // Mock the select query for chatbots
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            orderBy: jest.fn().mockReturnValueOnce({
              limit: jest.fn().mockReturnValueOnce({
                offset: jest.fn().mockResolvedValueOnce(mockChatbots)
              })
            })
          })
        })
      });

      // Mock the count query
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce(mockCount)
        })
      });

      const result = await ChatbotService.listChatbots({ page: 1, limit: 10 });

      expect(result.chatbots).toHaveLength(2);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1
      });
    });

    it('should filter chatbots by status', async () => {
      const mockActiveChatbots = [
        {
          id: 'chatbot-1',
          name: 'Active Chatbot',
          status: 'active'
        }
      ];

      const mockCount = [{ count: 1 }];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            orderBy: jest.fn().mockReturnValueOnce({
              limit: jest.fn().mockReturnValueOnce({
                offset: jest.fn().mockResolvedValueOnce(mockActiveChatbots)
              })
            })
          })
        })
      });

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce(mockCount)
        })
      });

      const result = await ChatbotService.listChatbots({ status: 'active' });

      expect(result.chatbots).toHaveLength(1);
      expect(result.chatbots[0].status).toBe('active');
    });
  });

  describe('getChatbotById', () => {
    it('should return chatbot when found', async () => {
      const mockChatbot = {
        id: 'chatbot-123',
        name: 'Test Chatbot',
        status: 'active',
        conversationCount: 5,
        userCount: 3,
        lastActivity: new Date()
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.getChatbotById('chatbot-123');

      expect(result).toMatchObject({
        id: 'chatbot-123',
        name: 'Test Chatbot',
        status: 'active'
      });
    });

    it('should return null when chatbot not found', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([])
        })
      });

      const result = await ChatbotService.getChatbotById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateChatbot', () => {
    it('should update chatbot successfully', async () => {
      const updateData = {
        name: 'Updated Chatbot',
        status: 'active' as const
      };

      const mockUpdatedChatbot = {
        id: 'chatbot-123',
        name: 'Updated Chatbot',
        status: 'active',
        updatedAt: new Date()
      };

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([mockUpdatedChatbot])
          })
        })
      });

      const result = await ChatbotService.updateChatbot('chatbot-123', updateData);

      expect(result).toMatchObject({
        id: 'chatbot-123',
        name: 'Updated Chatbot',
        status: 'active'
      });
    });

    it('should return null when chatbot not found for update', async () => {
      const updateData = { name: 'Updated Name' };

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([])
          })
        })
      });

      const result = await ChatbotService.updateChatbot('nonexistent', updateData);

      expect(result).toBeNull();
    });
  });

  describe('deleteChatbot', () => {
    it('should soft delete chatbot successfully', async () => {
      const mockDeletedChatbot = {
        id: 'chatbot-123',
        deletedAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([mockDeletedChatbot])
          })
        })
      });

      const result = await ChatbotService.deleteChatbot('chatbot-123');

      expect(result).toBe(true);
    });

    it('should return false when chatbot not found for deletion', async () => {
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([])
          })
        })
      });

      const result = await ChatbotService.deleteChatbot('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('regenerateApiKey', () => {
    it('should regenerate API key successfully', async () => {
      const mockUpdatedChatbot = {
        id: 'chatbot-123',
        apiKeyHash: 'new-mocked-hash',
        apiKeyHint: 'nanoid',
        updatedAt: new Date()
      };

      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([mockUpdatedChatbot])
          })
        })
      });

      const result = await ChatbotService.regenerateApiKey('chatbot-123');

      expect(result).toMatchObject({
        apiKey: 'cb_mocked-nanoid',
        hint: 'mocked-nanoid'
      });
    });

    it('should return null when chatbot not found for API key regeneration', async () => {
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([])
          })
        })
      });

      const result = await ChatbotService.regenerateApiKey('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('verifyApiKey', () => {
    it('should verify valid API key', async () => {
      const mockChatbot = {
        id: 'chatbot-123',
        name: 'Test Chatbot',
        apiKeyHash: 'mocked-hash'
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.verifyApiKey('valid-api-key');

      expect(result).toMatchObject({
        id: 'chatbot-123',
        name: 'Test Chatbot'
      });
    });

    it('should return null for invalid API key', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([])
        })
      });

      const result = await ChatbotService.verifyApiKey('invalid-api-key');

      expect(result).toBeNull();
    });
  });

  describe('getChatbotHealth', () => {
    it('should return health metrics for active chatbot', async () => {
      const mockChatbot = {
        id: 'chatbot-123',
        status: 'active',
        conversationCount: 10,
        lastActivity: new Date()
      };

      // Mock getChatbotById
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.getChatbotHealth('chatbot-123');

      expect(result).toMatchObject({
        status: 'healthy',
        metrics: {
          uptime: 99.9,
          responseTime: 150,
          errorRate: 0.1,
          totalRequests: 10
        }
      });
    });

    it('should return null for non-existent chatbot', async () => {
      // Mock getChatbotById returning null
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([])
        })
      });

      const result = await ChatbotService.getChatbotHealth('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('canUserAccessChatbot', () => {
    it('should allow super_admin to access any chatbot', async () => {
      const mockChatbot = {
        id: 'chatbot-123',
        createdBy: 'other-user-id'
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.canUserAccessChatbot(
        'chatbot-123',
        'admin-user-id',
        'super_admin'
      );

      expect(result).toBe(true);
    });

    it('should allow regular user to access their own chatbot', async () => {
      const mockChatbot = {
        id: 'chatbot-123',
        createdBy: 'user-id'
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.canUserAccessChatbot(
        'chatbot-123',
        'user-id',
        'user'
      );

      expect(result).toBe(true);
    });

    it('should deny regular user access to other users chatbot', async () => {
      const mockChatbot = {
        id: 'chatbot-123',
        createdBy: 'other-user-id'
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([mockChatbot])
        })
      });

      const result = await ChatbotService.canUserAccessChatbot(
        'chatbot-123',
        'user-id',
        'user'
      );

      expect(result).toBe(false);
    });
  });

  describe('canUserCreateChatbot', () => {
    it('should allow super_admin to create chatbots', () => {
      const result = ChatbotService.canUserCreateChatbot('super_admin');
      expect(result).toBe(true);
    });

    it('should not allow regular user to create chatbots', () => {
      const result = ChatbotService.canUserCreateChatbot('user');
      expect(result).toBe(false);
    });
  });
});