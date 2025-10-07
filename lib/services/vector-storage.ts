import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { documents, documentChunks, DocumentChunk, NewDocumentChunk, Document } from '../db/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { ChunkingResult } from './document-chunker';

/**
 * Vector Storage Service
 *
 * Provides comprehensive vector storage and retrieval capabilities using PostgreSQL
 * with pgvector extension for 1024-dimensional AWS Titan v2 embeddings.
 */

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  documentIds?: string[];
  documentTypes?: string[];
  supplierIds?: string[];
  includeMetadata?: boolean;
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
  chunkIndex: number;
  metadata?: any;
  document?: {
    id: string;
    title?: string;
    originalFilename: string;
    supplierName?: string;
    ingredientName?: string;
    ragDocumentType?: string;
    processingStatus: string;
    createdAt: Date;
  };
}

export interface VectorSearchStats {
  totalResults: number;
  queryTime: number;
  avgSimilarity: number;
  documentsMatched: number;
  filters: VectorSearchOptions;
}

export interface BatchStorageResult {
  success: boolean;
  stored: number;
  failed: number;
  totalChunks: number;
  errors: Array<{ chunkIndex: number; error: string }>;
  documentId: string;
  processingTime: number;
}

export interface DocumentChunkWithMetadata extends DocumentChunk {
  document?: Document;
}

export class VectorStorageService {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;
  private readonly maxRetries = 3;
  private readonly batchSize = 100;

  constructor() {
    // Initialize PostgreSQL connection pool
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.db = drizzle(this.pool);
  }

  /**
   * Store document chunks with embeddings in batch
   *
   * @param documentId - ID of the parent document
   * @param chunks - Array of chunks with embeddings from chunking service
   * @returns Promise<BatchStorageResult>
   */
  async storeDocumentChunks(
    documentId: string,
    chunks: ChunkingResult['chunks']
  ): Promise<BatchStorageResult> {
    const startTime = Date.now();
    const errors: Array<{ chunkIndex: number; error: string }> = [];
    let stored = 0;

    try {
      // Validate document exists
      const document = await this.db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (document.length === 0) {
        throw new Error(`Document with ID ${documentId} not found`);
      }

      // Delete existing chunks for this document (if any)
      await this.db
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += this.batchSize) {
        const batch = chunks.slice(i, i + this.batchSize);
        const batchData: NewDocumentChunk[] = batch.map((chunk) => ({
          documentId,
          chunkIndex: chunk.index,
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: {
            tokenCount: chunk.tokenCount,
            confidence: chunk.confidence,
            type: chunk.type,
            section: chunk.section,
            qualityScore: chunk.qualityScore,
            chunkingStrategy: chunk.chunkingStrategy,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            extractedAt: new Date().toISOString(),
          },
        }));

        try {
          await this.db.insert(documentChunks).values(batchData);
          stored += batch.length;
        } catch (error) {
          // Handle individual chunk errors
          for (const chunk of batch) {
            errors.push({
              chunkIndex: chunk.index,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          console.error(`Failed to store batch starting at index ${i}:`, error);
        }
      }

      // Update document processing status
      await this.db
        .update(documents)
        .set({
          embeddingCompletedAt: new Date(),
          processingStatus: stored > 0 ? 'completed' : 'failed',
          processingError: errors.length > 0 ? `${errors.length} chunks failed to store` : null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      const processingTime = Date.now() - startTime;

      return {
        success: stored > 0,
        stored,
        failed: errors.length,
        totalChunks: chunks.length,
        errors,
        documentId,
        processingTime,
      };
    } catch (error) {
      console.error('Vector storage failed:', error);

      // Update document with error status
      await this.db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: error instanceof Error ? error.message : 'Vector storage failed',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return {
        success: false,
        stored: 0,
        failed: chunks.length,
        totalChunks: chunks.length,
        errors: [{ chunkIndex: -1, error: error instanceof Error ? error.message : 'Storage failed' }],
        documentId,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Perform vector similarity search
   *
   * @param queryEmbedding - Query embedding vector (1024 dimensions)
   * @param options - Search options and filters
   * @returns Promise<VectorSearchResult[]>
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const {
      limit = 20,
      threshold = 0.7,
      documentIds,
      documentTypes,
      supplierIds,
      includeMetadata = true,
    } = options;

    // Validate embedding dimensions
    if (queryEmbedding.length !== 1024) {
      throw new Error(`Invalid embedding dimensions: ${queryEmbedding.length} (expected 1024)`);
    }

    try {
      let query = this.db
        .select({
          chunkId: documentChunks.id,
          documentId: documentChunks.documentId,
          content: documentChunks.content,
          chunkIndex: documentChunks.chunkIndex,
          metadata: documentChunks.metadata,
          similarity: sql<number>`1 - (${documentChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`,
          ...(includeMetadata && {
            document: {
              id: documents.id,
              title: documents.title,
              originalFilename: documents.originalFilename,
              supplierName: documents.supplierName,
              ingredientName: documents.ingredientName,
              ragDocumentType: documents.ragDocumentType,
              processingStatus: documents.processingStatus,
              createdAt: documents.createdAt,
            },
          }),
        })
        .from(documentChunks);

      // Add document join if metadata is requested or filters are applied
      if (includeMetadata || documentIds || documentTypes || supplierIds) {
        query = query.innerJoin(documents, eq(documentChunks.documentId, documents.id));
      }

      // Apply filters
      const conditions = [];

      if (documentIds && documentIds.length > 0) {
        conditions.push(inArray(documentChunks.documentId, documentIds));
      }

      if (documentTypes && documentTypes.length > 0) {
        conditions.push(inArray(documents.ragDocumentType, documentTypes));
      }

      if (supplierIds && supplierIds.length > 0) {
        conditions.push(inArray(documents.supplierName, supplierIds));
      }

      // Only include successfully processed documents
      conditions.push(eq(documents.processingStatus, 'completed'));

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Apply similarity threshold and ordering
      const results = await query
        .having(sql`1 - (${documentChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${threshold}`)
        .orderBy(desc(sql`1 - (${documentChunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`))
        .limit(limit);

      return results.map((row) => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        content: row.content,
        similarity: row.similarity,
        chunkIndex: row.chunkIndex,
        metadata: row.metadata,
        document: includeMetadata ? row.document : undefined,
      }));
    } catch (error) {
      console.error('Vector similarity search failed:', error);
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get search statistics for the last query
   *
   * @param queryEmbedding - Query embedding vector
   * @param options - Search options used
   * @returns Promise<VectorSearchStats>
   */
  async getSearchStats(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchStats> {
    const startTime = Date.now();
    const results = await this.searchSimilar(queryEmbedding, { ...options, includeMetadata: false });
    const queryTime = Date.now() - startTime;

    const avgSimilarity = results.length > 0
      ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
      : 0;

    const documentsMatched = new Set(results.map(r => r.documentId)).size;

    return {
      totalResults: results.length,
      queryTime,
      avgSimilarity,
      documentsMatched,
      filters: options,
    };
  }

  /**
   * Get document chunks for a specific document
   *
   * @param documentId - Document ID
   * @param includeEmbeddings - Whether to include embedding vectors
   * @returns Promise<DocumentChunkWithMetadata[]>
   */
  async getDocumentChunks(
    documentId: string,
    includeEmbeddings = false
  ): Promise<DocumentChunkWithMetadata[]> {
    try {
      const selectFields = {
        id: documentChunks.id,
        documentId: documentChunks.documentId,
        chunkIndex: documentChunks.chunkIndex,
        content: documentChunks.content,
        metadata: documentChunks.metadata,
        createdAt: documentChunks.createdAt,
        ...(includeEmbeddings && { embedding: documentChunks.embedding }),
      };

      const results = await this.db
        .select(selectFields)
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .orderBy(documentChunks.chunkIndex);

      return results;
    } catch (error) {
      console.error(`Failed to get chunks for document ${documentId}:`, error);
      throw new Error(`Failed to retrieve document chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all chunks for a document
   *
   * @param documentId - Document ID
   * @returns Promise<number> - Number of chunks deleted
   */
  async deleteDocumentChunks(documentId: string): Promise<number> {
    try {
      const result = await this.db
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      // Update document processing status
      await this.db
        .update(documents)
        .set({
          embeddingCompletedAt: null,
          processingStatus: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return result.rowCount || 0;
    } catch (error) {
      console.error(`Failed to delete chunks for document ${documentId}:`, error);
      throw new Error(`Failed to delete document chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update chunk metadata
   *
   * @param chunkId - Chunk ID
   * @param metadata - New metadata
   * @returns Promise<boolean>
   */
  async updateChunkMetadata(chunkId: string, metadata: any): Promise<boolean> {
    try {
      const result = await this.db
        .update(documentChunks)
        .set({ metadata })
        .where(eq(documentChunks.id, chunkId));

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Failed to update chunk metadata for ${chunkId}:`, error);
      return false;
    }
  }

  /**
   * Get storage statistics
   *
   * @returns Promise<object> - Storage statistics
   */
  async getStorageStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    documentsWithEmbeddings: number;
    avgChunksPerDocument: number;
    processingStatusBreakdown: Record<string, number>;
  }> {
    try {
      const [
        totalDocsResult,
        totalChunksResult,
        docsWithEmbeddingsResult,
        statusBreakdownResult,
      ] = await Promise.all([
        this.db.select({ count: sql<number>`count(*)` }).from(documents),
        this.db.select({ count: sql<number>`count(*)` }).from(documentChunks),
        this.db
          .select({ count: sql<number>`count(distinct ${documentChunks.documentId})` })
          .from(documentChunks),
        this.db
          .select({
            status: documents.processingStatus,
            count: sql<number>`count(*)`,
          })
          .from(documents)
          .groupBy(documents.processingStatus),
      ]);

      const totalDocuments = totalDocsResult[0]?.count || 0;
      const totalChunks = totalChunksResult[0]?.count || 0;
      const documentsWithEmbeddings = docsWithEmbeddingsResult[0]?.count || 0;
      const avgChunksPerDocument = documentsWithEmbeddings > 0 ? totalChunks / documentsWithEmbeddings : 0;

      const processingStatusBreakdown: Record<string, number> = {};
      for (const row of statusBreakdownResult) {
        processingStatusBreakdown[row.status || 'unknown'] = row.count;
      }

      return {
        totalDocuments,
        totalChunks,
        documentsWithEmbeddings,
        avgChunksPerDocument: Math.round(avgChunksPerDocument * 100) / 100,
        processingStatusBreakdown,
      };
    } catch (error) {
      console.error('Failed to get storage statistics:', error);
      throw new Error(`Failed to retrieve storage statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate vector storage health
   *
   * @returns Promise<object> - Health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
    pgvectorEnabled?: boolean;
    storageStats?: any;
  }> {
    const startTime = Date.now();

    try {
      // Test database connection
      await this.pool.query('SELECT 1');

      // Test pgvector extension
      const pgvectorTest = await this.pool.query(
        "SELECT extname FROM pg_extension WHERE extname = 'vector'"
      );
      const pgvectorEnabled = pgvectorTest.rows.length > 0;

      if (!pgvectorEnabled) {
        return {
          healthy: false,
          error: 'pgvector extension is not installed',
          pgvectorEnabled: false,
        };
      }

      // Get basic storage stats
      const storageStats = await this.getStorageStats();
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        pgvectorEnabled,
        storageStats,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        pgvectorEnabled: false,
      };
    }
  }

  /**
   * Bulk reindex embeddings for documents
   *
   * @param documentIds - Optional array of document IDs to reindex
   * @returns Promise<{ success: number; failed: number; errors: string[] }>
   */
  async reindexEmbeddings(
    documentIds?: string[]
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    try {
      let query = this.db.select({ id: documents.id }).from(documents);

      if (documentIds && documentIds.length > 0) {
        query = query.where(inArray(documents.id, documentIds));
      }

      const docs = await query;

      for (const doc of docs) {
        try {
          // Delete existing chunks
          await this.deleteDocumentChunks(doc.id);

          // Mark for reprocessing
          await this.db
            .update(documents)
            .set({
              processingStatus: 'pending',
              embeddingCompletedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, doc.id));

          success++;
        } catch (error) {
          failed++;
          errors.push(`Document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { success, failed, errors };
    } catch (error) {
      return {
        success: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : 'Reindexing failed'],
      };
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
export const vectorStorage = new VectorStorageService();

// Export types for use in other modules
export type VectorStorageOperation = 'store' | 'search' | 'delete' | 'update';

export interface VectorOperationResult {
  operation: VectorStorageOperation;
  success: boolean;
  documentsAffected: number;
  chunksAffected: number;
  processingTime: number;
  error?: string;
}

export interface SimilaritySearchRequest {
  query: string;
  embedding: number[];
  filters: VectorSearchOptions;
  timestamp: Date;
}

export interface SimilaritySearchResponse {
  request: SimilaritySearchRequest;
  results: VectorSearchResult[];
  stats: VectorSearchStats;
  cached: boolean;
}