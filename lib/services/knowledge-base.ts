import { db } from '@/lib/db';
import { documentChunks, documents, searchQueries, searchResultsCache, systemSettings } from '@/lib/db/schema';
import { eq, and, inArray, gte, lte, desc, sql, count, sum, avg } from 'drizzle-orm';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createHash } from 'crypto';
import {
  type VectorSearchResult,
  type KnowledgeBaseSearchRequest,
  type DocumentProcessingStatus,
  type KnowledgeBaseStats,
  type SearchPerformanceMetrics
} from '@/lib/validation/knowledge-base';

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export class KnowledgeBaseService {
  private static bedrockClient: BedrockRuntimeClient | null = null;
  private static credentialsCache: AwsCredentials | null = null;
  private static credentialsCacheExpiry: number = 0;

  /**
   * Get AWS credentials with hierarchy: system settings first, then .env.local fallback
   */
  private static async getAwsCredentials(): Promise<AwsCredentials> {
    // Return cached credentials if still valid (cache for 5 minutes)
    if (this.credentialsCache && Date.now() < this.credentialsCacheExpiry) {
      return this.credentialsCache;
    }

    try {
      // First, try to get credentials from system settings
      const systemCredentials = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'aws_bedrock_credentials'))
        .limit(1);

      if (systemCredentials.length > 0) {
        const credentials = systemCredentials[0].value as any;
        if (credentials.accessKeyId && credentials.secretAccessKey) {
          console.log('Using AWS credentials from system settings');
          this.credentialsCache = {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            region: credentials.region || process.env.BEDROCK_REGION || 'us-east-1'
          };
          this.credentialsCacheExpiry = Date.now() + 5 * 60 * 1000; // Cache for 5 minutes
          return this.credentialsCache;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch credentials from system settings:', error);
    }

    // Fallback to environment variables
    console.log('Using AWS credentials from environment variables (.env.local)');
    const envCredentials = {
      accessKeyId: process.env.BAWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY,
      region: process.env.BEDROCK_REGION || 'us-east-1'
    };

    if (!envCredentials.accessKeyId || !envCredentials.secretAccessKey) {
      throw new Error('AWS credentials not found in system settings or environment variables');
    }

    this.credentialsCache = envCredentials;
    this.credentialsCacheExpiry = Date.now() + 5 * 60 * 1000; // Cache for 5 minutes
    return this.credentialsCache;
  }

  /**
   * Get initialized Bedrock client with proper credentials
   */
  private static async getBedrockClient(): Promise<BedrockRuntimeClient> {
    if (!this.bedrockClient || Date.now() >= this.credentialsCacheExpiry) {
      const credentials = await this.getAwsCredentials();

      this.bedrockClient = new BedrockRuntimeClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      });
    }

    return this.bedrockClient;
  }

  /**
   * Generate text embedding using AWS Bedrock Titan v2 with 512 dimensions
   */
  private static async generateEmbedding(text: string, model = 'amazon.titan-embed-text-v2:0'): Promise<number[]> {
    try {
      const bedrockClient = await this.getBedrockClient();

      // Truncate text to fit within Titan v2's max token limit (8192 tokens)
      const truncatedText = text.substring(0, 8000);

      const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(JSON.stringify({
          inputText: truncatedText,
          dimensions: 512, // Use 512 dimensions for 99% accuracy with 50% storage savings
          normalize: true, // Enable normalization for better cosine similarity in RAG
        })),
      });

      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      if (!responseBody.embedding || !Array.isArray(responseBody.embedding)) {
        throw new Error('Invalid embedding response from Titan v2');
      }

      // Validate embedding dimensions
      if (responseBody.embedding.length !== 512) {
        throw new Error(`Expected 512 dimensions, got ${responseBody.embedding.length}`);
      }

      return responseBody.embedding;
    } catch (error) {
      console.error('Error generating embedding with Titan v2:', error);

      // Provide specific error messages for common issues
      if (error.message?.includes('The provided model identifier is invalid')) {
        throw new Error('AWS Bedrock Titan v2 model not available in region. Ensure model access is enabled in AWS Bedrock console.');
      }
      if (error.message?.includes('credentials')) {
        throw new Error('AWS credentials invalid. Check system settings or environment variables.');
      }

      throw new Error(`Failed to generate text embedding: ${error.message}`);
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
   * Perform optimized vector similarity search using direct SQL for performance
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

      // Build document filter conditions for direct SQL
      const filterConditions = this.buildSqlFilterConditions(params.filters);

      // Convert embedding to pgvector format
      const embeddingVector = `[${queryEmbedding.join(',')}]`;

      // Use optimized SQL with proper Drizzle syntax for performance
      const baseQuery = sql`
        SELECT
          dc.id as chunk_id,
          dc.document_id,
          dc.content,
          dc.chunk_index,
          dc.metadata as chunk_metadata,
          COALESCE(d.title, d.original_filename, d.filename) as document_name,
          d.original_filename as filename,
          d.metadata as document_metadata,
          (dc.embedding <=> ${embeddingVector}::vector) as distance,
          (1 - (dc.embedding <=> ${embeddingVector}::vector)) as similarity
        FROM document_chunks dc
        INNER JOIN documents d ON dc.document_id = d.id
        WHERE
          dc.embedding IS NOT NULL
          AND d.processing_status = 'completed'
          AND d.deleted_at IS NULL
          AND (1 - (dc.embedding <=> ${embeddingVector}::vector)) >= ${params.threshold}
        ORDER BY dc.embedding <=> ${embeddingVector}::vector ASC
        LIMIT ${params.limit}
      `;

      // Execute the optimized query
      const rawResults = await db.execute(baseQuery);

      // Transform results with proper type handling
      const results: VectorSearchResult[] = (rawResults.rows || rawResults).map((row: any) => ({
        documentId: row.document_id,
        chunkId: row.chunk_id,
        content: params.includeContent ? row.content : '',
        similarity: parseFloat(row.similarity.toFixed(4)),
        metadata: {
          documentName: row.document_name || 'Untitled Document',
          filename: row.filename || 'unknown',
          category: this.safeJsonParse(row.document_metadata)?.category || 'uncategorized',
          supplier: this.safeJsonParse(row.document_metadata)?.supplier || 'unknown',
          tags: this.safeJsonParse(row.document_metadata)?.tags || [],
          chunkIndex: row.chunk_index || 0,
          ...this.safeJsonParse(row.chunk_metadata)
        }
      }));

      const searchTime = Date.now() - startTime;

      // Cache results if enabled and we have results
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

      // Provide specific error messages for debugging
      if (error.message?.includes('vector')) {
        throw new Error('Vector database operation failed. Check pgvector extension and database schema.');
      }
      if (error.message?.includes('embedding')) {
        throw new Error('Failed to generate query embedding. Check AWS Bedrock configuration.');
      }

      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  /**
   * Build SQL filter conditions for direct SQL queries
   */
  private static buildSqlFilterConditions(filters: KnowledgeBaseSearchRequest['filters'] = {}): {
    sql: string;
    params: any[];
  } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 4; // Start from $4 since $1-$3 are reserved for main query

    if (filters.documentTypes && filters.documentTypes.length > 0) {
      conditions.push(`d.mime_type = ANY($${paramIndex})`);
      params.push(filters.documentTypes);
      paramIndex++;
    }

    if (filters.documentIds && filters.documentIds.length > 0) {
      conditions.push(`d.id = ANY($${paramIndex})`);
      params.push(filters.documentIds);
      paramIndex++;
    }

    if (filters.dateRange) {
      if (filters.dateRange.from) {
        conditions.push(`d.created_at >= $${paramIndex}`);
        params.push(new Date(filters.dateRange.from));
        paramIndex++;
      }
      if (filters.dateRange.to) {
        conditions.push(`d.created_at <= $${paramIndex}`);
        params.push(new Date(filters.dateRange.to));
        paramIndex++;
      }
    }

    if (filters.categories && filters.categories.length > 0) {
      conditions.push(`d.metadata->>'category' = ANY($${paramIndex})`);
      params.push(filters.categories);
      paramIndex++;
    }

    if (filters.supplierIds && filters.supplierIds.length > 0) {
      conditions.push(`d.metadata->>'supplierId' = ANY($${paramIndex})`);
      params.push(filters.supplierIds);
      paramIndex++;
    }

    const sqlCondition = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    return {
      sql: sqlCondition,
      params
    };
  }

  /**
   * Safely parse JSON with fallback
   */
  private static safeJsonParse(jsonString: any): any {
    if (!jsonString) return {};
    if (typeof jsonString === 'object') return jsonString;
    try {
      return JSON.parse(jsonString);
    } catch {
      return {};
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
      const [storageStats] = await db
        .select({
          total_size: sum(documents.fileSize),
          avg_size: avg(documents.fileSize)
        })
        .from(documents)
        .where(whereCondition);

      const avgChunksPerDocument = totalDocs.count > 0
        ? Math.round(totalChunksResult.count / totalDocs.count)
        : 0;

      return {
        totalDocuments: totalDocs.count,
        totalChunks: totalChunksResult.count,
        avgChunksPerDocument,
        documentsByCategory: Object.fromEntries(
          (categoryStats.rows || categoryStats || []).map((row: any) => [row.category || 'uncategorized', parseInt(row.count)])
        ),
        documentsBySupplier: Object.fromEntries(
          (supplierStats.rows || supplierStats || []).map((row: any) => [row.supplier || 'unknown', parseInt(row.count)])
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

        // Convert embedding to proper vector format for pgvector
        const embeddingVector = `[${embedding.join(',')}]`;

        await db.insert(documentChunks).values({
          documentId,
          chunkIndex: i,
          content: chunk,
          embedding: embeddingVector as any, // Cast to any for proper vector insertion
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