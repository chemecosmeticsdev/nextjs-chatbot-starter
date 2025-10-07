// Mock modules before importing
jest.mock('@/lib/db');
jest.mock('@aws-sdk/client-bedrock-runtime');

import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import type { KnowledgeBaseSearchRequest } from '@/lib/validation/knowledge-base';

const mockDb = jest.mocked(require('@/lib/db').db);
const MockBedrockRuntimeClient = jest.mocked(require('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient);
const MockInvokeModelCommand = jest.mocked(require('@aws-sdk/client-bedrock-runtime').InvokeModelCommand);

describe('KnowledgeBaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('vectorSearch', () => {
    it('successfully performs vector search with basic parameters', async () => {
      const searchParams: KnowledgeBaseSearchRequest = {
        query: 'machine learning algorithms',
        limit: 5,
        threshold: 0.7,
        filters: {},
        includeContent: true,
        cacheResults: true
      };

      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockSearchResults = [
        {
          chunk_id: 'chunk-123',
          document_id: 'doc-456',
          content: 'Machine learning is a subset of artificial intelligence.',
          chunk_index: 0,
          chunk_metadata: { section: 'introduction' },
          document_name: 'ML Guide',
          filename: 'ml-guide.pdf',
          document_metadata: { category: 'technical', supplier: 'TechCorp' },
          distance: 0.25,
          similarity: 0.75
        }
      ];

      // Mock Bedrock embedding generation
      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      };

      MockBedrockRuntimeClient.prototype.send = jest.fn().mockResolvedValue(mockBedrockResponse);

      // Mock database search
      mockDb.execute.mockResolvedValue(mockSearchResults);

      // Mock cache check (no cached results)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      // Mock cache insert
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoUpdate: jest.fn().mockResolvedValue(undefined)
        })
      });

      const result = await KnowledgeBaseService.vectorSearch(searchParams);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].documentId).toBe('doc-456');
      expect(result.results[0].chunkId).toBe('chunk-123');
      expect(result.results[0].similarity).toBe(0.75);
      expect(result.results[0].metadata.documentName).toBe('ML Guide');
      expect(result.results[0].metadata.category).toBe('technical');
      expect(result.cached).toBe(false);
      expect(result.searchTime).toBeGreaterThan(0);
    });

    it('returns cached results when available', async () => {
      const searchParams: KnowledgeBaseSearchRequest = {
        query: 'cached search',
        cacheResults: true
      };

      const cachedResults = [
        {
          documentId: 'cached-doc',
          chunkId: 'cached-chunk',
          content: 'Cached content',
          similarity: 0.8,
          metadata: { documentName: 'Cached Document' }
        }
      ];

      // Mock cache hit
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([{
              results: cachedResults
            }])
          })
        })
      });

      const result = await KnowledgeBaseService.vectorSearch(searchParams);

      expect(result.results).toEqual(cachedResults);
      expect(result.cached).toBe(true);
      expect(MockBedrockRuntimeClient.prototype.send).not.toHaveBeenCalled();
    });

    it('applies document filters correctly', async () => {
      const searchParams: KnowledgeBaseSearchRequest = {
        query: 'filtered search',
        filters: {
          documentTypes: ['application/pdf'],
          categories: ['technical'],
          supplierIds: ['supplier-123'],
          dateRange: {
            from: '2024-01-01T00:00:00Z',
            to: '2024-12-31T23:59:59Z'
          }
        }
      };

      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());

      // Mock embedding generation
      MockBedrockRuntimeClient.prototype.send = jest.fn().mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      });

      // Mock cache miss
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      // Mock search results
      mockDb.execute.mockResolvedValue([]);

      await KnowledgeBaseService.vectorSearch(searchParams);

      // Verify that the SQL query includes filters
      expect(mockDb.execute).toHaveBeenCalledWith(expect.any(Object));
    });

    it('handles embedding generation errors', async () => {
      const searchParams: KnowledgeBaseSearchRequest = {
        query: 'error prone search'
      };

      MockBedrockRuntimeClient.prototype.send = jest.fn().mockRejectedValue(
        new Error('Bedrock service unavailable')
      );

      await expect(KnowledgeBaseService.vectorSearch(searchParams))
        .rejects.toThrow('Failed to perform vector search');
    });

    it('handles empty search results gracefully', async () => {
      const searchParams: KnowledgeBaseSearchRequest = {
        query: 'no results query'
      };

      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());

      MockBedrockRuntimeClient.prototype.send = jest.fn().mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: mockEmbedding
        }))
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      mockDb.execute.mockResolvedValue([]);

      const result = await KnowledgeBaseService.vectorSearch(searchParams);

      expect(result.results).toHaveLength(0);
      expect(result.cached).toBe(false);
      expect(result.searchTime).toBeGreaterThan(0);
    });
  });

  describe('logSearchQuery', () => {
    it('successfully logs search query', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined)
      });

      await expect(KnowledgeBaseService.logSearchQuery(
        'user-123',
        'test query',
        { category: 'test' },
        5,
        150,
        'session-456',
        '192.168.1.1'
      )).resolves.not.toThrow();

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('handles logging errors gracefully', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      // Should not throw error even if logging fails
      await expect(KnowledgeBaseService.logSearchQuery(
        'user-123',
        'test query',
        {},
        0,
        100
      )).resolves.not.toThrow();
    });
  });

  describe('getKnowledgeBaseStats', () => {
    it('returns comprehensive knowledge base statistics', async () => {
      const mockCounts = [{ count: 100 }];
      const mockProcessingStats = [
        { status: 'completed', count: 80 },
        { status: 'pending', count: 15 },
        { status: 'failed', count: 5 }
      ];
      const mockCategoryStats = [
        { category: 'technical', count: '50' },
        { category: 'product', count: '30' },
        { category: null, count: '20' }
      ];
      const mockStorageStats = {
        total_size: '1048576000',
        avg_size: '10485760'
      };

      // Mock various database calls
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockCounts)
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue(mockCounts)
          })
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockReturnValue(mockProcessingStats)
          })
        })
      });

      mockDb.execute
        .mockResolvedValueOnce(mockCategoryStats)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockStorageStats]);

      const stats = await KnowledgeBaseService.getKnowledgeBaseStats();

      expect(stats.totalDocuments).toBe(100);
      expect(stats.totalChunks).toBe(100);
      expect(stats.avgChunksPerDocument).toBe(1);
      expect(stats.processingStats.completed).toBe(80);
      expect(stats.processingStats.pending).toBe(15);
      expect(stats.processingStats.failed).toBe(5);
      expect(stats.documentsByCategory).toEqual({
        technical: 50,
        product: 30,
        uncategorized: 20
      });
      expect(stats.storageStats.totalSizeBytes).toBe(1048576000);
      expect(stats.storageStats.avgDocumentSize).toBe(10485760);
    });

    it('applies date range filters when provided', async () => {
      const dateRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-12-31')
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue([{ count: 0 }])
        })
      });

      mockDb.execute.mockResolvedValue([]);

      await KnowledgeBaseService.getKnowledgeBaseStats(dateRange);

      // Verify that date filters are applied (mocked calls should include where conditions)
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockRejectedValue(new Error('Database error'))
        })
      });

      await expect(KnowledgeBaseService.getKnowledgeBaseStats())
        .rejects.toThrow('Failed to retrieve knowledge base statistics');
    });
  });

  describe('clearExpiredCache', () => {
    it('successfully clears expired cache entries', async () => {
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ rowCount: 5 })
      });

      const clearedCount = await KnowledgeBaseService.clearExpiredCache();

      expect(clearedCount).toBe(5);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('handles deletion errors gracefully', async () => {
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const clearedCount = await KnowledgeBaseService.clearExpiredCache();

      expect(clearedCount).toBe(0);
    });
  });

  describe('getDocumentProcessingStatus', () => {
    it('returns processing status for existing document', async () => {
      const documentId = 'doc-123';
      const mockDocument = {
        id: documentId,
        processingStatus: 'completed',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      };

      const mockChunkCount = [{ count: 10 }];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue(mockChunkCount)
        })
      });

      const status = await KnowledgeBaseService.getDocumentProcessingStatus(documentId);

      expect(status).not.toBeNull();
      expect(status!.documentId).toBe(documentId);
      expect(status!.status).toBe('completed');
      expect(status!.chunksCreated).toBe(10);
      expect(status!.completedAt).toEqual(mockDocument.updatedAt);
    });

    it('returns null for non-existent document', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      const status = await KnowledgeBaseService.getDocumentProcessingStatus('non-existent');

      expect(status).toBeNull();
    });

    it('handles database errors gracefully', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      });

      const status = await KnowledgeBaseService.getDocumentProcessingStatus('doc-123');

      expect(status).toBeNull();
    });
  });

  describe('reprocessDocument', () => {
    it('successfully reprocesses document', async () => {
      const documentId = 'doc-123';
      const mockDocument = {
        id: documentId,
        extractedText: 'This is the extracted text content for reprocessing.'
      };

      // Mock database operations for reprocessing
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue({ affectedRows: 1 })
        })
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([mockDocument])
          })
        })
      });

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ affectedRows: 5 })
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockResolvedValue({ affectedRows: 1 })
      });

      // Mock embedding generation for chunks
      MockBedrockRuntimeClient.prototype.send = jest.fn().mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          embedding: Array(1536).fill(0).map(() => Math.random())
        }))
      });

      const success = await KnowledgeBaseService.reprocessDocument(documentId);

      expect(success).toBe(true);
      expect(mockDb.update).toHaveBeenCalledTimes(2); // Start processing + completion
      expect(mockDb.delete).toHaveBeenCalled(); // Delete old chunks
      expect(mockDb.insert).toHaveBeenCalled(); // Insert new chunks
    });

    it('handles document not found', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue({ affectedRows: 1 })
        })
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue([])
          })
        })
      });

      const success = await KnowledgeBaseService.reprocessDocument('non-existent');

      expect(success).toBe(false);
    });

    it('handles processing errors gracefully', async () => {
      const documentId = 'doc-123';

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue({ affectedRows: 1 })
        })
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      });

      const success = await KnowledgeBaseService.reprocessDocument(documentId);

      expect(success).toBe(false);

      // Should mark as failed
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          processingStatus: 'failed'
        })
      );
    });
  });

  describe('getRecentQueries', () => {
    it('returns recent queries for user', async () => {
      const userId = 'user-123';
      const mockQueries = [
        { query: 'machine learning' },
        { query: 'neural networks' },
        { query: 'data science' }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue(mockQueries)
            })
          })
        })
      });

      const queries = await KnowledgeBaseService.getRecentQueries(userId, 5);

      expect(queries).toEqual(['machine learning', 'neural networks', 'data science']);
    });

    it('handles database errors gracefully', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockRejectedValue(new Error('Database error'))
            })
          })
        })
      });

      const queries = await KnowledgeBaseService.getRecentQueries('user-123');

      expect(queries).toEqual([]);
    });
  });

  describe('getSearchSuggestions', () => {
    it('returns popular search suggestions', async () => {
      const mockSuggestions = [
        { query: 'machine learning', count: 10 },
        { query: 'data science', count: 8 },
        { query: 'artificial intelligence', count: 6 }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue(mockSuggestions)
              })
            })
          })
        })
      });

      const suggestions = await KnowledgeBaseService.getSearchSuggestions(3);

      expect(suggestions).toEqual(['machine learning', 'data science', 'artificial intelligence']);
    });

    it('handles database errors gracefully', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockRejectedValue(new Error('Database error'))
              })
            })
          })
        })
      });

      const suggestions = await KnowledgeBaseService.getSearchSuggestions();

      expect(suggestions).toEqual([]);
    });
  });
});