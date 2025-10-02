// Mock modules before importing
jest.mock('@/lib/services/knowledge-base');
jest.mock('@/lib/auth');

import { POST, GET } from '@/app/api/v1/knowledge-base/search/route';
import {
  callApiRoute,
  MockAuthService,
  MockUserService,
  testData,
  testAssertions
} from '@/lib/test-utils';

const MockKnowledgeBaseService = jest.mocked(require('@/lib/services/knowledge-base').KnowledgeBaseService);

// Set up the mocked modules
require('@/lib/auth').AuthTokenService = MockAuthService;

describe('/api/v1/knowledge-base/search', () => {
  beforeEach(() => {
    MockAuthService.clearSessions();
    MockUserService.clearUsers();
    jest.clearAllMocks();
  });

  describe('POST /api/v1/knowledge-base/search', () => {
    it('successfully performs vector search for authorized admin user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockSearchResults = {
        results: [
          {
            documentId: 'doc-123',
            chunkId: 'chunk-456',
            content: 'This is a sample document chunk about machine learning algorithms.',
            similarity: 0.85,
            metadata: {
              documentName: 'ML Guide.pdf',
              category: 'technical',
              supplier: 'TechCorp',
              tags: ['machine-learning', 'algorithms'],
              chunkIndex: 0
            }
          },
          {
            documentId: 'doc-789',
            chunkId: 'chunk-012',
            content: 'Advanced techniques for neural network optimization and training.',
            similarity: 0.78,
            metadata: {
              documentName: 'Neural Networks.pdf',
              category: 'technical',
              supplier: 'TechCorp',
              tags: ['neural-networks', 'optimization'],
              chunkIndex: 2
            }
          }
        ],
        searchTime: 150,
        cached: false
      };

      MockKnowledgeBaseService.vectorSearch.mockResolvedValue(mockSearchResults);
      MockKnowledgeBaseService.logSearchQuery.mockResolvedValue(undefined);

      const searchData = {
        query: 'machine learning algorithms',
        limit: 10,
        threshold: 0.7,
        filters: {
          categories: ['technical'],
          documentTypes: ['application/pdf']
        },
        includeContent: true,
        cacheResults: true
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: searchData,
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '192.168.1.1',
          'x-session-id': 'session-123'
        }
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.query).toBe(searchData.query);
      expect(response.data.data.results).toHaveLength(2);
      expect(response.data.data.results[0].similarity).toBe(0.85);
      expect(response.data.data.searchTime).toBe(150);
      expect(response.data.data.cached).toBe(false);
      expect(response.data.data.filters).toEqual(searchData.filters);

      // Verify service calls
      expect(MockKnowledgeBaseService.vectorSearch).toHaveBeenCalledWith(searchData);
      expect(MockKnowledgeBaseService.logSearchQuery).toHaveBeenCalledWith(
        user.id,
        searchData.query,
        searchData.filters,
        2, // results length
        150, // search time
        'session-123',
        '192.168.1.1'
      );
    });

    it('successfully performs search with minimal parameters', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'super_admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockSearchResults = {
        results: [],
        searchTime: 50,
        cached: true
      };

      MockKnowledgeBaseService.vectorSearch.mockResolvedValue(mockSearchResults);
      MockKnowledgeBaseService.logSearchQuery.mockResolvedValue(undefined);

      const searchData = {
        query: 'simple search'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: searchData
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.results).toHaveLength(0);
      expect(response.data.data.cached).toBe(true);

      // Verify default values were applied
      expect(MockKnowledgeBaseService.vectorSearch).toHaveBeenCalledWith({
        query: 'simple search',
        limit: 10,
        threshold: 0.7,
        filters: {},
        includeContent: true,
        cacheResults: true
      });
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: { query: 'test search' }
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });

    it('validates search parameters', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const invalidSearchData = {
        query: '', // Empty query
        limit: 200, // Exceeds maximum
        threshold: 1.5, // Exceeds maximum
        filters: {
          supplierIds: ['invalid-uuid'] // Invalid UUID format
        }
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: invalidSearchData
      });

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('handles search service errors gracefully', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockKnowledgeBaseService.vectorSearch.mockRejectedValue(new Error('Vector search failed'));

      const searchData = {
        query: 'test search'
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: searchData
      });

      testAssertions.expectErrorResponse(response, 500);
      expect(response.data.code).toBe('INTERNAL_ERROR');
    });

    it('logs security audit for sensitive searches', async () => {
      const user = MockUserService.createUser(
        'security-user-id',
        'security@example.com',
        'Security User',
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockSearchResults = {
        results: [
          {
            documentId: 'classified-doc',
            chunkId: 'classified-chunk',
            content: 'Classified information document chunk.',
            similarity: 0.95,
            metadata: {
              documentName: 'Classified.pdf',
              category: 'confidential',
              supplier: 'SecureCorp'
            }
          }
        ],
        searchTime: 100,
        cached: false
      };

      MockKnowledgeBaseService.vectorSearch.mockResolvedValue(mockSearchResults);
      MockKnowledgeBaseService.logSearchQuery.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const searchData = {
        query: 'classified information',
        filters: { categories: ['confidential'] }
      };

      const response = await callApiRoute(POST, {
        method: 'POST',
        body: searchData
      });

      testAssertions.expectValidResponse(response, 200);

      // Verify security audit log was created
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Knowledge base search - User: security-user-id')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('GET /api/v1/knowledge-base/search', () => {
    it('returns recent queries for authenticated user', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockRecentQueries = [
        'machine learning algorithms',
        'neural networks',
        'data processing techniques'
      ];

      MockKnowledgeBaseService.getRecentQueries.mockResolvedValue(mockRecentQueries);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, {}, new URLSearchParams({ type: 'recent', limit: '5' }));

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.type).toBe('recent_queries');
      expect(response.data.data.queries).toEqual(mockRecentQueries);

      expect(MockKnowledgeBaseService.getRecentQueries).toHaveBeenCalledWith(user.id, 5);
    });

    it('returns search suggestions', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const mockSuggestions = [
        'popular search term',
        'common query',
        'frequently asked'
      ];

      MockKnowledgeBaseService.getSearchSuggestions.mockResolvedValue(mockSuggestions);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, {}, new URLSearchParams({ type: 'suggestions', limit: '3' }));

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.type).toBe('suggestions');
      expect(response.data.data.suggestions).toEqual(mockSuggestions);

      expect(MockKnowledgeBaseService.getSearchSuggestions).toHaveBeenCalledWith(3);
    });

    it('defaults to recent queries when type is not specified', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);
      MockKnowledgeBaseService.getRecentQueries.mockResolvedValue([]);

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      testAssertions.expectValidResponse(response, 200);
      expect(response.data.data.type).toBe('recent_queries');
      expect(MockKnowledgeBaseService.getRecentQueries).toHaveBeenCalledWith(user.id, 10);
    });

    it('returns error for invalid type parameter', async () => {
      const user = MockUserService.createUser(
        testData.user.id,
        testData.user.email,
        testData.user.fullName,
        'admin'
      );

      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(user);

      const response = await callApiRoute(GET, {
        method: 'GET'
      }, {}, new URLSearchParams({ type: 'invalid' }));

      testAssertions.expectErrorResponse(response, 400);
      expect(response.data.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      MockAuthService.verifyRequest = jest.fn().mockResolvedValue(null);

      const response = await callApiRoute(GET, {
        method: 'GET'
      });

      testAssertions.expectErrorResponse(response, 401);
      expect(response.data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Unsupported HTTP methods', () => {
    it('returns 405 for PUT requests', async () => {
      const { PUT } = await import('@/app/api/v1/knowledge-base/search/route');

      const response = await callApiRoute(PUT, {
        method: 'PUT'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for DELETE requests', async () => {
      const { DELETE } = await import('@/app/api/v1/knowledge-base/search/route');

      const response = await callApiRoute(DELETE, {
        method: 'DELETE'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for PATCH requests', async () => {
      const { PATCH } = await import('@/app/api/v1/knowledge-base/search/route');

      const response = await callApiRoute(PATCH, {
        method: 'PATCH'
      });

      expect(response.status).toBe(405);
      expect(response.data.code).toBe('METHOD_NOT_ALLOWED');
    });
  });
});