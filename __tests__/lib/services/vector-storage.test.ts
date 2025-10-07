// Mock modules before importing
jest.mock('@/lib/db/connection');
jest.mock('@/lib/embeddings/titan-embedder');
jest.mock('@/lib/services/analytics');

import { VectorStorage } from '@/lib/services/vector-storage';
import { db } from '@/lib/db/connection';
import { titanEmbedder } from '@/lib/embeddings/titan-embedder';
import { analyticsService } from '@/lib/services/analytics';

const mockDb = jest.mocked(db);
const mockTitanEmbedder = jest.mocked(titanEmbedder);
const mockAnalyticsService = jest.mocked(analyticsService);

describe('VectorStorage', () => {
  let vectorStorage: VectorStorage;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database methods
    mockDb.insert = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
      onConflictDoUpdate: jest.fn().mockReturnValue({
        set: jest.fn().mockResolvedValue(undefined)
      })
    });

    mockDb.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      })
    });

    mockDb.execute = jest.fn();
    mockDb.transaction = jest.fn();

    vectorStorage = new VectorStorage();
  });

  describe('storeDocumentChunks', () => {
    it('successfully stores document chunks with embeddings', async () => {
      const chunks = [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_123',
          chunkIndex: 0,
          content: 'First chunk content',
          tokenCount: 10,
          startPosition: 0,
          endPosition: 18,
          metadata: {
            strategy: 'semantic',
            chunkType: 'paragraph',
            hasOverlap: false
          }
        },
        {
          chunkId: 'chunk_2',
          documentId: 'doc_123',
          chunkIndex: 1,
          content: 'Second chunk content',
          tokenCount: 12,
          startPosition: 18,
          endPosition: 38,
          metadata: {
            strategy: 'semantic',
            chunkType: 'paragraph',
            hasOverlap: false
          }
        }
      ];

      const mockEmbeddings = [
        Array(1024).fill(0).map(() => Math.random()),
        Array(1024).fill(0).map(() => Math.random())
      ];

      // Mock embedding generation
      mockTitanEmbedder.generateEmbeddingsBatch.mockResolvedValue([
        {
          success: true,
          embedding: mockEmbeddings[0],
          dimensions: 1024,
          inputText: 'First chunk content',
          inputTokens: 10,
          processingTime: 100,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        },
        {
          success: true,
          embedding: mockEmbeddings[1],
          dimensions: 1024,
          inputText: 'Second chunk content',
          inputTokens: 12,
          processingTime: 120,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        }
      ]);

      const result = await vectorStorage.storeDocumentChunks(chunks);

      expect(result).toEqual({
        success: true,
        stored: 2,
        failed: 0,
        totalTokensUsed: 22,
        totalProcessingTime: expect.any(Number),
        errors: [],
        chunkIds: ['chunk_1', 'chunk_2']
      });

      expect(mockTitanEmbedder.generateEmbeddingsBatch).toHaveBeenCalledWith([
        'First chunk content',
        'Second chunk content'
      ]);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('handles embedding failures gracefully', async () => {
      const chunks = [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_123',
          chunkIndex: 0,
          content: 'Valid chunk content',
          tokenCount: 10,
          startPosition: 0,
          endPosition: 18,
          metadata: {
            strategy: 'semantic',
            chunkType: 'paragraph',
            hasOverlap: false
          }
        },
        {
          chunkId: 'chunk_2',
          documentId: 'doc_123',
          chunkIndex: 1,
          content: '', // Empty content that will fail
          tokenCount: 0,
          startPosition: 18,
          endPosition: 18,
          metadata: {
            strategy: 'semantic',
            chunkType: 'paragraph',
            hasOverlap: false
          }
        }
      ];

      // Mock mixed success/failure
      mockTitanEmbedder.generateEmbeddingsBatch.mockResolvedValue([
        {
          success: true,
          embedding: Array(1024).fill(0).map(() => Math.random()),
          dimensions: 1024,
          inputText: 'Valid chunk content',
          inputTokens: 10,
          processingTime: 100,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        },
        {
          success: false,
          error: 'Input text cannot be empty',
          embedding: null,
          dimensions: 0,
          inputText: '',
          inputTokens: 0,
          processingTime: 10,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        }
      ]);

      const result = await vectorStorage.storeDocumentChunks(chunks);

      expect(result).toEqual({
        success: false,
        stored: 1,
        failed: 1,
        totalTokensUsed: 10,
        totalProcessingTime: expect.any(Number),
        errors: ['chunk_2: Input text cannot be empty'],
        chunkIds: ['chunk_1']
      });
    });

    it('handles database insertion errors', async () => {
      const chunks = [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_123',
          chunkIndex: 0,
          content: 'Test content',
          tokenCount: 5,
          startPosition: 0,
          endPosition: 12,
          metadata: {
            strategy: 'semantic',
            chunkType: 'paragraph',
            hasOverlap: false
          }
        }
      ];

      mockTitanEmbedder.generateEmbeddingsBatch.mockResolvedValue([
        {
          success: true,
          embedding: Array(1024).fill(0).map(() => Math.random()),
          dimensions: 1024,
          inputText: 'Test content',
          inputTokens: 5,
          processingTime: 100,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        }
      ]);

      // Mock database error
      mockDb.insert.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await vectorStorage.storeDocumentChunks(chunks);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Database insertion failed: Database connection failed');
    });

    it('handles empty chunks array', async () => {
      const result = await vectorStorage.storeDocumentChunks([]);

      expect(result).toEqual({
        success: true,
        stored: 0,
        failed: 0,
        totalTokensUsed: 0,
        totalProcessingTime: expect.any(Number),
        errors: [],
        chunkIds: []
      });
    });
  });

  describe('searchSimilar', () => {
    it('successfully finds similar documents', async () => {
      const queryText = 'Search query for similar documents';
      const queryEmbedding = Array(1024).fill(0).map(() => Math.random());

      // Mock embedding generation for query
      mockTitanEmbedder.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: queryEmbedding,
        dimensions: 1024,
        inputText: queryText,
        inputTokens: 6,
        processingTime: 80,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      // Mock database search results
      const mockSearchResults = [
        {
          documentId: 'doc_1',
          chunkId: 'chunk_1',
          content: 'Similar content found',
          similarity: 0.95,
          chunkIndex: 0,
          metadata: { strategy: 'semantic', chunkType: 'paragraph' },
          document: {
            filename: 'document1.pdf',
            metadata: { documentType: 'sds' }
          }
        },
        {
          documentId: 'doc_2',
          chunkId: 'chunk_2',
          content: 'Another similar content',
          similarity: 0.88,
          chunkIndex: 0,
          metadata: { strategy: 'semantic', chunkType: 'section' },
          document: {
            filename: 'document2.pdf',
            metadata: { documentType: 'specification' }
          }
        }
      ];

      mockDb.execute.mockResolvedValue(mockSearchResults);

      const result = await vectorStorage.searchSimilar(queryText, {
        limit: 10,
        similarityThreshold: 0.8,
        documentTypes: ['sds', 'specification']
      });

      expect(result).toEqual({
        success: true,
        results: mockSearchResults,
        queryEmbedding,
        processingTime: expect.any(Number),
        totalResults: 2,
        searchMetadata: {
          queryTokens: 6,
          embeddingTime: 80,
          searchTime: expect.any(Number),
          similarityThreshold: 0.8,
          limit: 10
        }
      });

      expect(mockTitanEmbedder.generateEmbedding).toHaveBeenCalledWith(queryText);
    });

    it('handles query embedding generation failure', async () => {
      const queryText = 'Test query';

      mockTitanEmbedder.generateEmbedding.mockResolvedValue({
        success: false,
        error: 'Embedding generation failed',
        embedding: null,
        dimensions: 0,
        inputText: queryText,
        inputTokens: 0,
        processingTime: 10,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      const result = await vectorStorage.searchSimilar(queryText);

      expect(result).toEqual({
        success: false,
        error: 'Failed to generate query embedding: Embedding generation failed',
        results: [],
        queryEmbedding: null,
        processingTime: expect.any(Number),
        totalResults: 0,
        searchMetadata: {
          queryTokens: 0,
          embeddingTime: 10,
          searchTime: 0,
          similarityThreshold: 0.7,
          limit: 20
        }
      });
    });

    it('applies filters correctly', async () => {
      const queryText = 'Filtered search';
      const queryEmbedding = Array(1024).fill(0).map(() => Math.random());

      mockTitanEmbedder.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: queryEmbedding,
        dimensions: 1024,
        inputText: queryText,
        inputTokens: 4,
        processingTime: 70,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      mockDb.execute.mockResolvedValue([]);

      await vectorStorage.searchSimilar(queryText, {
        limit: 5,
        similarityThreshold: 0.9,
        documentTypes: ['sds'],
        supplierIds: ['supplier_1', 'supplier_2'],
        ingredientIds: ['ingredient_1']
      });

      // Verify that the SQL query was called with proper filters
      const sqlCall = mockDb.execute.mock.calls[0];
      expect(sqlCall).toBeDefined();

      // The SQL should include filters for document types, suppliers, and ingredients
      const sql = sqlCall[0];
      expect(sql).toContain('similarity');
      expect(sql).toContain('0.9'); // similarity threshold
      expect(sql).toContain('LIMIT 5');
    });

    it('handles database search errors', async () => {
      const queryText = 'Search query';
      const queryEmbedding = Array(1024).fill(0).map(() => Math.random());

      mockTitanEmbedder.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: queryEmbedding,
        dimensions: 1024,
        inputText: queryText,
        inputTokens: 4,
        processingTime: 70,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      mockDb.execute.mockRejectedValue(new Error('Database query failed'));

      const result = await vectorStorage.searchSimilar(queryText);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Vector search failed');
    });
  });

  describe('getStorageStats', () => {
    it('returns comprehensive storage statistics', async () => {
      const mockStats = [
        {
          total_chunks: 1000,
          total_documents: 50,
          avg_chunk_size: 512,
          total_embeddings_size: 52428800, // 50MB
          documents_by_type: [
            { document_type: 'sds', count: 25 },
            { document_type: 'specification', count: 15 },
            { document_type: 'certificate', count: 10 }
          ],
          chunks_by_strategy: [
            { strategy: 'semantic', count: 600 },
            { strategy: 'sds_sections', count: 300 },
            { strategy: 'certificate', count: 100 }
          ]
        }
      ];

      mockDb.execute.mockResolvedValue(mockStats);

      const result = await vectorStorage.getStorageStats();

      expect(result).toEqual({
        success: true,
        stats: {
          totalChunks: 1000,
          totalDocuments: 50,
          averageChunkSize: 512,
          totalStorageSize: 52428800,
          documentsByType: expect.any(Array),
          chunksByStrategy: expect.any(Array),
          lastUpdated: expect.any(Date)
        },
        timestamp: expect.any(Date)
      });
    });

    it('handles database errors in stats retrieval', async () => {
      mockDb.execute.mockRejectedValue(new Error('Stats query failed'));

      const result = await vectorStorage.getStorageStats();

      expect(result).toEqual({
        success: false,
        error: 'Failed to retrieve storage stats: Stats query failed',
        stats: null,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('deleteDocumentChunks', () => {
    it('successfully deletes all chunks for a document', async () => {
      mockDb.execute.mockResolvedValue({ rowCount: 5 });

      const result = await vectorStorage.deleteDocumentChunks('doc_123');

      expect(result).toEqual({
        success: true,
        deletedChunks: 5,
        documentId: 'doc_123'
      });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM document_chunks'),
        ['doc_123']
      );
    });

    it('handles deletion of non-existent document', async () => {
      mockDb.execute.mockResolvedValue({ rowCount: 0 });

      const result = await vectorStorage.deleteDocumentChunks('nonexistent_doc');

      expect(result).toEqual({
        success: true,
        deletedChunks: 0,
        documentId: 'nonexistent_doc'
      });
    });

    it('handles database deletion errors', async () => {
      mockDb.execute.mockRejectedValue(new Error('Deletion failed'));

      const result = await vectorStorage.deleteDocumentChunks('doc_123');

      expect(result).toEqual({
        success: false,
        error: 'Failed to delete document chunks: Deletion failed',
        deletedChunks: 0,
        documentId: 'doc_123'
      });
    });
  });

  describe('reindexEmbeddings', () => {
    it('successfully reindexes embeddings with new model', async () => {
      const mockChunks = [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          content: 'Content to reindex',
          chunkIndex: 0
        },
        {
          chunkId: 'chunk_2',
          documentId: 'doc_1',
          content: 'More content to reindex',
          chunkIndex: 1
        }
      ];

      const mockEmbeddings = [
        Array(1024).fill(0).map(() => Math.random()),
        Array(1024).fill(0).map(() => Math.random())
      ];

      // Mock chunk retrieval
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockChunks)
          })
        })
      });

      // Mock embedding generation
      mockTitanEmbedder.generateEmbeddingsBatch.mockResolvedValue([
        {
          success: true,
          embedding: mockEmbeddings[0],
          dimensions: 1024,
          inputText: 'Content to reindex',
          inputTokens: 8,
          processingTime: 100,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        },
        {
          success: true,
          embedding: mockEmbeddings[1],
          dimensions: 1024,
          inputText: 'More content to reindex',
          inputTokens: 10,
          processingTime: 120,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        }
      ]);

      // Mock update operation
      mockDb.execute.mockResolvedValue({ rowCount: 2 });

      const result = await vectorStorage.reindexEmbeddings({
        documentIds: ['doc_1'],
        batchSize: 10
      });

      expect(result).toEqual({
        success: true,
        processedChunks: 2,
        failedChunks: 0,
        totalBatches: 1,
        processingTime: expect.any(Number),
        errors: []
      });
    });

    it('handles reindexing with some failures', async () => {
      const mockChunks = [
        {
          chunkId: 'chunk_1',
          documentId: 'doc_1',
          content: 'Valid content',
          chunkIndex: 0
        },
        {
          chunkId: 'chunk_2',
          documentId: 'doc_1',
          content: '', // Empty content that will fail
          chunkIndex: 1
        }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockChunks)
          })
        })
      });

      mockTitanEmbedder.generateEmbeddingsBatch.mockResolvedValue([
        {
          success: true,
          embedding: Array(1024).fill(0).map(() => Math.random()),
          dimensions: 1024,
          inputText: 'Valid content',
          inputTokens: 5,
          processingTime: 100,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        },
        {
          success: false,
          error: 'Input text cannot be empty',
          embedding: null,
          dimensions: 0,
          inputText: '',
          inputTokens: 0,
          processingTime: 10,
          model: 'amazon.titan-embed-text-v2:0',
          cached: false
        }
      ]);

      const result = await vectorStorage.reindexEmbeddings({
        documentIds: ['doc_1'],
        batchSize: 10
      });

      expect(result.success).toBe(false);
      expect(result.processedChunks).toBe(1);
      expect(result.failedChunks).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('getHealth', () => {
    it('returns healthy status when all operations work', async () => {
      // Mock successful embedding generation
      mockTitanEmbedder.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: Array(1024).fill(0).map(() => Math.random()),
        dimensions: 1024,
        inputText: 'health check',
        inputTokens: 2,
        processingTime: 50,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      // Mock successful database query
      mockDb.execute.mockResolvedValue([{ count: 100 }]);

      const health = await vectorStorage.getHealth();

      expect(health).toEqual({
        healthy: true,
        service: 'vector-storage',
        lastChecked: expect.any(Date),
        responseTime: expect.any(Number),
        checks: {
          embeddings: true,
          database: true,
          vectorIndex: true
        },
        stats: {
          totalChunks: 100,
          avgResponseTime: expect.any(Number)
        }
      });
    });

    it('returns unhealthy status when components fail', async () => {
      // Mock embedding failure
      mockTitanEmbedder.generateEmbedding.mockResolvedValue({
        success: false,
        error: 'Embedding service unavailable',
        embedding: null,
        dimensions: 0,
        inputText: 'health check',
        inputTokens: 0,
        processingTime: 10,
        model: 'amazon.titan-embed-text-v2:0',
        cached: false
      });

      // Mock database failure
      mockDb.execute.mockRejectedValue(new Error('Database unavailable'));

      const health = await vectorStorage.getHealth();

      expect(health.healthy).toBe(false);
      expect(health.checks.embeddings).toBe(false);
      expect(health.checks.database).toBe(false);
    });
  });

  describe('validateSearchOptions', () => {
    it('validates correct search options', () => {
      const validOptions = {
        limit: 10,
        similarityThreshold: 0.8,
        documentTypes: ['sds', 'specification'],
        supplierIds: ['supplier_1'],
        ingredientIds: ['ingredient_1']
      };

      const result = vectorStorage.validateSearchOptions(validOptions);
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid search options', () => {
      const invalidOptions = {
        limit: -5, // Invalid limit
        similarityThreshold: 1.5, // Invalid threshold > 1
        documentTypes: [], // Empty array
        supplierIds: null // Invalid type
      };

      const result = vectorStorage.validateSearchOptions(invalidOptions as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeTruthy();
    });
  });
});