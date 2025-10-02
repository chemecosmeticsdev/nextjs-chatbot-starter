import { db } from '@/lib/db';
import { documentChunks, documents, searchQueries, searchResultsCache } from '@/lib/db/schema';
import { eq, and, inArray, gte, lte, desc, sql, count } from 'drizzle-orm';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createHash } from 'crypto';
import {
  type VectorSearchResult,
  type KnowledgeBaseSearchRequest,
  type DocumentProcessingStatus,
  type KnowledgeBaseStats,
  type SearchPerformanceMetrics
} from '@/lib/validation/knowledge-base';

export class KnowledgeBaseService {
  private static bedrockClient: BedrockRuntimeClient;

  static {
    // Initialize Bedrock client for embeddings
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  /**
   * Generate text embedding using AWS Bedrock Titan
   */
  private static async generateEmbedding(text: string, model = 'amazon.titan-embed-text-v2'): Promise<number[]> {
    try {
      const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text.substring(0, 8000), // Titan has a token limit
        }),
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return responseBody.embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate text embedding');
    }
  }

  /**
   * Create a hash for caching search results
   */
  private static createQueryHash(query: string, filters: Record<string, any> = {}): string {
    const queryData = { query: query.toLowerCase().trim(), filters };
    return createHash('sha256').update(JSON.stringify(queryData)).digest('hex');
  }

  /**
   * Check cache for existing search results
   */
  private static async getCachedResults(queryHash: string): Promise<VectorSearchResult[] | null> {
    try {
      const cached = await db
        .select()
        .from(searchResultsCache)
        .where(and(
          eq(searchResultsCache.queryHash, queryHash),
          gte(searchResultsCache.expiresAt, new Date())
        ))
        .limit(1);

      if (cached.length > 0) {
        return cached[0].results as VectorSearchResult[];
      }
      return null;
    } catch (error) {
      console.error('Error checking cache:', error);
      return null;
    }
  }

  /**
   * Cache search results
   */
  private static async cacheResults(
    queryHash: string,
    query: string,
    filters: Record<string, any>,
    results: VectorSearchResult[],
    ttlMinutes = 60
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      await db
        .insert(searchResultsCache)
        .values({
          queryHash,
          query,
          filters,
          results,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: searchResultsCache.queryHash,
          set: {
            results,
            expiresAt,
            createdAt: new Date()
          }
        });
    } catch (error) {
      console.error('Error caching results:', error);
      // Don't throw error - caching failure shouldn't break search
    }
  }

  /**
   * Build SQL WHERE conditions for document filtering
   */
  private static buildDocumentFilters(filters: KnowledgeBaseSearchRequest['filters'] = {}) {
    const conditions = [];

    if (filters.documentTypes && filters.documentTypes.length > 0) {
      conditions.push(inArray(documents.mimeType, filters.documentTypes));
    }

    if (filters.documentIds && filters.documentIds.length > 0) {
      conditions.push(inArray(documents.id, filters.documentIds));
    }

    if (filters.dateRange) {
      if (filters.dateRange.from) {
        conditions.push(gte(documents.createdAt, new Date(filters.dateRange.from)));
      }
      if (filters.dateRange.to) {
        conditions.push(lte(documents.createdAt, new Date(filters.dateRange.to)));
      }
    }

    // Handle metadata filters (category, supplier, etc.)
    if (filters.categories && filters.categories.length > 0) {
      conditions.push(
        sql`${documents.metadata}->>'category' = ANY(${filters.categories})`
      );
    }

    if (filters.supplierIds && filters.supplierIds.length > 0) {
      conditions.push(
        sql`${documents.metadata}->>'supplierId' = ANY(${filters.supplierIds})`
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Perform vector similarity search
   */
  static async vectorSearch(params: KnowledgeBaseSearchRequest): Promise<{
    results: VectorSearchResult[];
    searchTime: number;
    cached: boolean;
  }> {
    const startTime = Date.now();

    // Check cache first if enabled
    const queryHash = this.createQueryHash(params.query, params.filters);
    if (params.cacheResults) {
      const cachedResults = await this.getCachedResults(queryHash);
      if (cachedResults) {
        return {
          results: cachedResults.slice(0, params.limit),
          searchTime: Date.now() - startTime,
          cached: true
        };
      }
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(params.query);

      // Build document filters
      const documentFilters = this.buildDocumentFilters(params.filters);

      // Perform vector similarity search with SQL
      const searchQuery = sql`
        SELECT
          dc.id as chunk_id,
          dc.document_id,
          dc.content,
          dc.chunk_index,
          dc.metadata as chunk_metadata,
          d.title as document_name,
          d.filename,
          d.metadata as document_metadata,
          (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as distance,
          (1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) as similarity
        FROM ${documentChunks} dc
        INNER JOIN ${documents} d ON dc.document_id = d.id
        WHERE
          dc.embedding IS NOT NULL
          AND d.processing_status = 'completed'
          ${documentFilters ? sql`AND ${documentFilters}` : sql``}
          AND (1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) >= ${params.threshold}
        ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${params.limit}
      `;

      const rawResults = await db.execute(searchQuery);

      // Transform results
      const results: VectorSearchResult[] = rawResults.map((row: any) => ({
        documentId: row.document_id,
        chunkId: row.chunk_id,
        content: params.includeContent ? row.content : '',
        similarity: parseFloat(row.similarity),
        metadata: {
          documentName: row.document_name,
          filename: row.filename,
          category: row.document_metadata?.category,
          supplier: row.document_metadata?.supplier,
          tags: row.document_metadata?.tags || [],
          chunkIndex: row.chunk_index,
          ...row.chunk_metadata
        }
      }));

      const searchTime = Date.now() - startTime;

      // Cache results if enabled
      if (params.cacheResults && results.length > 0) {
        await this.cacheResults(queryHash, params.query, params.filters || {}, results);
      }

      return {
        results,
        searchTime,
        cached: false
      };

    } catch (error) {
      console.error('Vector search error:', error);
      throw new Error('Failed to perform vector search');
    }
  }

  /**
   * Log search query for analytics
   */
  static async logSearchQuery(
    userId: string | null,
    query: string,
    filters: Record<string, any>,
    resultsCount: number,
    responseTime: number,
    sessionId?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await db.insert(searchQueries).values({
        userId,
        query,
        filters,
        resultsCount,
        responseTime,
        sessionId,
        ipAddress,
      });
    } catch (error) {
      console.error('Error logging search query:', error);
      // Don't throw error - logging failure shouldn't break search
    }
  }

  /**
   * Get knowledge base statistics
   */
  static async getKnowledgeBaseStats(
    dateRange?: { from?: Date; to?: Date }
  ): Promise<KnowledgeBaseStats> {
    try {
      // Base query conditions
      const dateConditions = [];
      if (dateRange?.from) {
        dateConditions.push(gte(documents.createdAt, dateRange.from));
      }
      if (dateRange?.to) {
        dateConditions.push(lte(documents.createdAt, dateRange.to));
      }
      const whereCondition = dateConditions.length > 0 ? and(...dateConditions) : undefined;

      // Get total documents and chunks
      const [totalDocs] = await db
        .select({ count: count() })
        .from(documents)
        .where(whereCondition);

      const [totalChunksResult] = await db
        .select({ count: count() })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(whereCondition);

      // Get processing status distribution
      const processingStats = await db
        .select({
          status: documents.processingStatus,
          count: count()
        })
        .from(documents)
        .where(whereCondition)
        .groupBy(documents.processingStatus);

      // Get categories distribution
      const categoryStats = await db.execute(sql`
        SELECT
          d.metadata->>'category' as category,
          COUNT(*) as count
        FROM ${documents} d
        ${whereCondition ? sql`WHERE ${whereCondition}` : sql``}
        GROUP BY d.metadata->>'category'
        ORDER BY count DESC
      `);

      // Get supplier distribution
      const supplierStats = await db.execute(sql`
        SELECT
          d.metadata->>'supplier' as supplier,
          COUNT(*) as count
        FROM ${documents} d
        ${whereCondition ? sql`WHERE ${whereCondition}` : sql``}
        GROUP BY d.metadata->>'supplier'
        ORDER BY count DESC
      `);

      // Get storage stats
      const [storageStats] = await db.execute(sql`
        SELECT
          SUM(COALESCE(file_size, 0)) as total_size,
          AVG(COALESCE(file_size, 0)) as avg_size
        FROM ${documents}
        ${whereCondition ? sql`WHERE ${whereCondition}` : sql``}
      `);

      const avgChunksPerDocument = totalDocs.count > 0
        ? Math.round(totalChunksResult.count / totalDocs.count)
        : 0;

      return {
        totalDocuments: totalDocs.count,
        totalChunks: totalChunksResult.count,
        avgChunksPerDocument,
        documentsByCategory: Object.fromEntries(
          categoryStats.map((row: any) => [row.category || 'uncategorized', parseInt(row.count)])
        ),
        documentsBySupplier: Object.fromEntries(
          supplierStats.map((row: any) => [row.supplier || 'unknown', parseInt(row.count)])
        ),
        processingStats: {
          pending: processingStats.find(s => s.status === 'pending')?.count || 0,
          processing: processingStats.find(s => s.status === 'processing')?.count || 0,
          completed: processingStats.find(s => s.status === 'completed')?.count || 0,
          failed: processingStats.find(s => s.status === 'failed')?.count || 0,
        },
        storageStats: {
          totalSizeBytes: parseInt(storageStats.total_size) || 0,
          avgDocumentSize: Math.round(parseFloat(storageStats.avg_size)) || 0,
        }
      };
    } catch (error) {
      console.error('Error getting knowledge base stats:', error);
      throw new Error('Failed to retrieve knowledge base statistics');
    }
  }

  /**
   * Get search performance metrics
   */
  static async getSearchPerformanceMetrics(
    timeframe: '1h' | '24h' | '7d' | '30d' = '24h',
    chatbotId?: string
  ): Promise<SearchPerformanceMetrics> {
    try {
      const timeframeMins = {
        '1h': 60,
        '24h': 24 * 60,
        '7d': 7 * 24 * 60,
        '30d': 30 * 24 * 60
      };

      const fromDate = new Date(Date.now() - timeframeMins[timeframe] * 60 * 1000);

      const conditions = [gte(searchQueries.createdAt, fromDate)];
      if (chatbotId) {
        // Add chatbot filtering if we track chatbot in search queries
        // This would require adding chatbotId to search queries table
      }

      const whereCondition = and(...conditions);

      // Get basic metrics
      const [basicStats] = await db
        .select({
          totalQueries: count(),
          avgResponseTime: sql<number>`AVG(${searchQueries.responseTime})`,
        })
        .from(searchQueries)
        .where(whereCondition);

      // Get top queries
      const topQueries = await db
        .select({
          query: searchQueries.query,
          count: count(),
          avgResponseTime: sql<number>`AVG(${searchQueries.responseTime})`,
        })
        .from(searchQueries)
        .where(whereCondition)
        .groupBy(searchQueries.query)
        .orderBy(desc(count()))
        .limit(10);

      // Calculate cache hit rate
      const [cacheStats] = await db
        .select({ count: count() })
        .from(searchResultsCache)
        .where(gte(searchResultsCache.createdAt, fromDate));

      const cacheHitRate = basicStats.totalQueries > 0
        ? Math.round((cacheStats.count / basicStats.totalQueries) * 100) / 100
        : 0;

      return {
        totalQueries: basicStats.totalQueries,
        avgResponseTime: Math.round(basicStats.avgResponseTime || 0),
        cacheHitRate,
        topQueries: topQueries.map(q => ({
          query: q.query,
          count: q.count,
          avgResponseTime: Math.round(q.avgResponseTime || 0)
        })),
        queryDistribution: {}, // Could be implemented to show query length distribution
        errorRate: 0 // Would need error tracking in search queries
      };
    } catch (error) {
      console.error('Error getting search performance metrics:', error);
      throw new Error('Failed to retrieve search performance metrics');
    }
  }

  /**
   * Clear expired cache entries
   */
  static async clearExpiredCache(): Promise<number> {
    try {
      const result = await db
        .delete(searchResultsCache)
        .where(lte(searchResultsCache.expiresAt, new Date()));

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error clearing expired cache:', error);
      return 0;
    }
  }

  /**
   * Get document processing status
   */
  static async getDocumentProcessingStatus(documentId: string): Promise<DocumentProcessingStatus | null> {
    try {
      const [document] = await db
        .select({
          id: documents.id,
          processingStatus: documents.processingStatus,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!document) {
        return null;
      }

      // Count chunks for this document
      const [chunkCount] = await db
        .select({ count: count() })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      return {
        documentId: document.id,
        status: document.processingStatus as any,
        chunksCreated: chunkCount.count,
        startedAt: document.createdAt,
        completedAt: document.processingStatus === 'completed' ? document.updatedAt : undefined,
      };
    } catch (error) {
      console.error('Error getting document processing status:', error);
      return null;
    }
  }

  /**
   * Reprocess document chunks (regenerate embeddings)
   */
  static async reprocessDocument(documentId: string): Promise<boolean> {
    try {
      // Mark document as processing
      await db
        .update(documents)
        .set({
          processingStatus: 'processing',
          updatedAt: new Date()
        })
        .where(eq(documents.id, documentId));

      // Get document content
      const [document] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!document || !document.extractedText) {
        throw new Error('Document not found or has no extracted text');
      }

      // Delete existing chunks
      await db
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      // Re-chunk and re-embed the document
      await this.processDocumentIntoChunks(
        documentId,
        document.extractedText,
        500, // chunk size
        50   // overlap
      );

      // Mark as completed
      await db
        .update(documents)
        .set({
          processingStatus: 'completed',
          updatedAt: new Date()
        })
        .where(eq(documents.id, documentId));

      return true;
    } catch (error) {
      console.error('Error reprocessing document:', error);

      // Mark as failed
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          updatedAt: new Date()
        })
        .where(eq(documents.id, documentId));

      return false;
    }
  }

  /**
   * Process document into chunks with embeddings
   */
  private static async processDocumentIntoChunks(
    documentId: string,
    text: string,
    chunkSize = 500,
    chunkOverlap = 50
  ): Promise<void> {
    const chunks = this.splitTextIntoChunks(text, chunkSize, chunkOverlap);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const embedding = await this.generateEmbedding(chunk);

        await db.insert(documentChunks).values({
          documentId,
          chunkIndex: i,
          content: chunk,
          embedding: JSON.stringify(embedding),
          metadata: {
            chunkSize: chunk.length,
            totalChunks: chunks.length
          }
        });
      } catch (error) {
        console.error(`Error processing chunk ${i} for document ${documentId}:`, error);
        // Continue with other chunks
      }
    }
  }

  /**
   * Split text into chunks with overlap
   */
  private static splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to break at word boundaries if possible
      if (end < text.length && chunk.length > 100) {
        const lastSpaceIndex = chunk.lastIndexOf(' ');
        if (lastSpaceIndex > chunk.length * 0.8) {
          chunk = chunk.slice(0, lastSpaceIndex);
        }
      }

      chunks.push(chunk.trim());
      start = end - overlap;
    }

    return chunks.filter(chunk => chunk.length > 10); // Filter out very short chunks
  }

  /**
   * Get recent search queries for a user
   */
  static async getRecentQueries(userId: string, limit = 10): Promise<string[]> {
    try {
      const queries = await db
        .select({ query: searchQueries.query })
        .from(searchQueries)
        .where(eq(searchQueries.userId, userId))
        .orderBy(desc(searchQueries.createdAt))
        .limit(limit);

      return queries.map(q => q.query);
    } catch (error) {
      console.error('Error getting recent queries:', error);
      return [];
    }
  }

  /**
   * Get search suggestions based on popular queries
   */
  static async getSearchSuggestions(limit = 10): Promise<string[]> {
    try {
      const suggestions = await db
        .select({
          query: searchQueries.query,
          count: count()
        })
        .from(searchQueries)
        .where(gte(searchQueries.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))) // Last 7 days
        .groupBy(searchQueries.query)
        .orderBy(desc(count()))
        .limit(limit);

      return suggestions.map(s => s.query);
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      return [];
    }
  }
}