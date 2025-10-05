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
import {
  AdaptiveSearchService,
  type AdaptiveSearchParams,
  type AdaptiveSearchResult
} from '@/lib/services/adaptive-search';
import {
  HybridSearchService,
  type HybridSearchParams,
  type HybridSearchResponse
} from '@/lib/services/hybrid-search';
import {
  QueryProcessor,
  type ProcessedQuery,
  type QueryEnhancementParams,
  classifyQuery
} from '@/lib/services/query-processor';
import {
  ResultRankingService,
  type RankedResult,
  type RankingAnalysis,
  quickRerankResults
} from '@/lib/services/result-ranking';
import {
  SearchAnalyticsService,
  type SearchMetrics,
  recordSimpleSearch
} from '@/lib/services/search-analytics';

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

  // =============================================================================
  // PHASE 2: ADAPTIVE VECTOR SEARCH WITH DYNAMIC THRESHOLDS
  // =============================================================================

  /**
   * Enhanced vector search with adaptive threshold management
   * Automatically determines optimal threshold based on query characteristics
   */
  static async adaptiveVectorSearch(params: KnowledgeBaseSearchRequest & {
    enableAdaptiveThreshold?: boolean;
    enableFallback?: boolean;
    maxFallbackAttempts?: number;
    minimumResults?: number;
  }): Promise<{
    results: VectorSearchResult[];
    searchTime: number;
    cached: boolean;
    adaptiveResult: AdaptiveSearchResult;
    thresholdUsed: number;
    totalAttempts: number;
  }> {
    const startTime = Date.now();
    const enableAdaptive = params.enableAdaptiveThreshold !== false; // Default to true
    const enableFallback = params.enableFallback !== false; // Default to true
    const maxAttempts = params.maxFallbackAttempts || 3;
    const minimumResults = params.minimumResults || 5;

    let finalResults: VectorSearchResult[] = [];
    let totalAttempts = 0;
    let thresholdUsed = params.threshold;
    let adaptiveResult: AdaptiveSearchResult;
    let cached = false;

    // Check cache first if enabled
    const queryHash = this.createQueryHash(params.query, params.filters);
    if (params.cacheResults) {
      const cachedResults = await this.getCachedResults(queryHash);
      if (cachedResults) {
        // For cached results, still analyze query for consistency
        const analysis = AdaptiveSearchService.analyzeQuery(params.query);
        adaptiveResult = {
          threshold: params.threshold,
          queryAnalysis: analysis,
          fallbackUsed: false,
          attemptCount: 1,
          recommendation: 'Results served from cache'
        };

        return {
          results: cachedResults.slice(0, params.limit),
          searchTime: Date.now() - startTime,
          cached: true,
          adaptiveResult,
          thresholdUsed: params.threshold,
          totalAttempts: 1
        };
      }
    }

    try {
      // Adaptive threshold search with fallback logic
      while (totalAttempts < maxAttempts) {
        totalAttempts++;

        // Determine optimal threshold for this attempt
        if (enableAdaptive) {
          const adaptiveParams: AdaptiveSearchParams = {
            query: params.query,
            baseThreshold: params.threshold,
            enableFallback: enableFallback && totalAttempts > 1,
            maxFallbackAttempts: maxAttempts,
            minimumResults
          };

          adaptiveResult = AdaptiveSearchService.determineOptimalThreshold(
            adaptiveParams,
            finalResults.length,
            totalAttempts
          );

          thresholdUsed = adaptiveResult.threshold;
        } else {
          // Non-adaptive mode - use provided threshold
          const analysis = AdaptiveSearchService.analyzeQuery(params.query);
          adaptiveResult = {
            threshold: params.threshold,
            queryAnalysis: analysis,
            fallbackUsed: false,
            attemptCount: totalAttempts,
            recommendation: 'Using fixed threshold (adaptive mode disabled)'
          };
          thresholdUsed = params.threshold;
        }

        console.log(
          `Adaptive search attempt ${totalAttempts}: query="${params.query}", ` +
          `threshold=${thresholdUsed}, type=${adaptiveResult.queryAnalysis.type}`
        );

        // Generate embedding for the query
        const queryEmbedding = await this.generateEmbedding(params.query);

        // Build document filter conditions
        const filterConditions = this.buildSqlFilterConditions(params.filters);

        // Convert embedding to pgvector format
        const embeddingVector = `[${queryEmbedding.join(',')}]`;

        // Execute search with current threshold
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
            AND (1 - (dc.embedding <=> ${embeddingVector}::vector)) >= ${thresholdUsed}
          ORDER BY dc.embedding <=> ${embeddingVector}::vector ASC
          LIMIT ${params.limit}
        `;

        const rawResults = await db.execute(baseQuery);

        // Transform results
        finalResults = (rawResults.rows || rawResults).map((row: any) => ({
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
            threshold: thresholdUsed,
            queryType: adaptiveResult.queryAnalysis.type,
            ...this.safeJsonParse(row.chunk_metadata)
          }
        }));

        console.log(`Attempt ${totalAttempts}: Found ${finalResults.length} results with threshold ${thresholdUsed}`);

        // Check if we have enough results or should try fallback
        if (finalResults.length >= minimumResults || !enableFallback || totalAttempts >= maxAttempts) {
          break;
        }

        // If we're using adaptive mode and don't have enough results, continue with fallback
        if (enableAdaptive && finalResults.length < minimumResults) {
          console.log(`Insufficient results (${finalResults.length} < ${minimumResults}), trying fallback...`);
          continue;
        } else {
          break;
        }
      }

      const searchTime = Date.now() - startTime;

      // Cache results if enabled and we have results
      if (params.cacheResults && finalResults.length > 0) {
        await this.cacheResults(queryHash, params.query, params.filters || {}, finalResults);
      }

      // Update final recommendation based on results
      if (finalResults.length === 0) {
        adaptiveResult!.recommendation = totalAttempts > 1
          ? 'No results found even with fallback thresholds. Consider query refinement.'
          : 'No results found. Try enabling fallback or lowering threshold.';
      } else if (finalResults.length < minimumResults && totalAttempts > 1) {
        adaptiveResult!.recommendation = `Found ${finalResults.length} results after ${totalAttempts} attempts. Results may be limited.`;
      }

      return {
        results: finalResults,
        searchTime,
        cached,
        adaptiveResult: adaptiveResult!,
        thresholdUsed,
        totalAttempts
      };

    } catch (error) {
      console.error('Adaptive vector search error:', error);

      // Provide specific error messages for debugging
      if (error.message?.includes('vector')) {
        throw new Error('Vector database operation failed. Check pgvector extension and database schema.');
      }
      if (error.message?.includes('embedding')) {
        throw new Error('Failed to generate query embedding. Check AWS Bedrock configuration.');
      }

      throw new Error(`Adaptive vector search failed: ${error.message}`);
    }
  }

  // =============================================================================
  // PHASE 2: HYBRID SEARCH - VECTOR + KEYWORD COMBINATION
  // =============================================================================

  /**
   * Advanced hybrid search combining vector similarity and keyword matching
   * Uses result fusion for optimal accuracy across different query types
   */
  static async hybridVectorSearch(params: HybridSearchParams): Promise<{
    results: VectorSearchResult[];
    searchTime: number;
    cached: boolean;
    hybridAnalysis: HybridSearchResponse;
    searchStrategy: string;
  }> {
    const startTime = Date.now();

    // Check cache first if enabled
    const queryHash = this.createQueryHash(params.query, params.filters);
    if (params.cacheResults) {
      const cachedResults = await this.getCachedResults(queryHash);
      if (cachedResults) {
        // Create minimal hybrid analysis for cached results
        const mockAnalysis: HybridSearchResponse = {
          results: [],
          searchTime: Date.now() - startTime,
          vectorResultCount: 0,
          keywordResultCount: 0,
          fusionResultCount: cachedResults.length,
          config: HybridSearchService.getConfig(),
          searchAnalysis: {
            queryLength: params.query.split(/\s+/).length,
            hasQuotes: false,
            hasSpecialTerms: false,
            searchStrategy: 'cached'
          }
        };

        return {
          results: cachedResults.slice(0, params.limit),
          searchTime: Date.now() - startTime,
          cached: true,
          hybridAnalysis: mockAnalysis,
          searchStrategy: 'cached'
        };
      }
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(params.query);

      console.log(`Starting hybrid search for query: "${params.query}"`);

      // Perform hybrid search
      const hybridResponse = await HybridSearchService.hybridSearch(params, queryEmbedding);

      // Convert hybrid results to standard VectorSearchResult format
      const standardResults: VectorSearchResult[] = hybridResponse.results.map(result => ({
        documentId: result.documentId,
        chunkId: result.chunkId,
        content: result.content,
        similarity: result.fusionScore, // Use fusion score as similarity
        metadata: {
          ...result.metadata,
          // Add hybrid search specific metadata
          fusionScore: result.fusionScore,
          vectorScore: result.vectorScore,
          keywordScore: result.keywordScore,
          searchMethod: result.searchMethod,
          vectorRank: result.vectorRank,
          keywordRank: result.keywordRank,
          hybridSearchUsed: true
        }
      }));

      const searchTime = Date.now() - startTime;

      // Cache results if enabled and we have results
      if (params.cacheResults && standardResults.length > 0) {
        await this.cacheResults(queryHash, params.query, params.filters || {}, standardResults);
      }

      console.log(
        `Hybrid search completed: ${standardResults.length} results, ` +
        `${hybridResponse.searchTime}ms, strategy: ${hybridResponse.searchAnalysis.searchStrategy}`
      );

      return {
        results: standardResults,
        searchTime,
        cached: false,
        hybridAnalysis: hybridResponse,
        searchStrategy: hybridResponse.searchAnalysis.searchStrategy
      };

    } catch (error) {
      console.error('Hybrid vector search error:', error);

      // Provide specific error messages for debugging
      if (error.message?.includes('vector')) {
        throw new Error('Vector database operation failed. Check pgvector extension and database schema.');
      }
      if (error.message?.includes('embedding')) {
        throw new Error('Failed to generate query embedding. Check AWS Bedrock configuration.');
      }
      if (error.message?.includes('full-text') || error.message?.includes('tsvector')) {
        throw new Error('Full-text search failed. Check PostgreSQL text search configuration.');
      }

      throw new Error(`Hybrid vector search failed: ${error.message}`);
    }
  }

  /**
   * Smart search that automatically chooses between vector, adaptive, or hybrid search
   * based on query characteristics and system configuration
   * Now enhanced with query preprocessing pipeline and optional result ranking
   */
  static async smartSearch(params: KnowledgeBaseSearchRequest & {
    enableAdaptiveThreshold?: boolean;
    enableHybridSearch?: boolean;
    enableFallback?: boolean;
    enableResultRanking?: boolean;
    hybridConfig?: any;
    smartMode?: 'auto' | 'vector_only' | 'adaptive_only' | 'hybrid_only';
    enableQueryEnhancement?: boolean;
    enhancementConfig?: any;
    userContext?: any;
  }): Promise<{
    results: VectorSearchResult[] | RankedResult[];
    searchTime: number;
    cached: boolean;
    searchMethod: 'vector' | 'adaptive' | 'hybrid';
    recommendation: string;
    queryEnhancement?: ProcessedQuery;
    rankingAnalysis?: RankingAnalysis;
    additionalData?: any;
  }> {
    const startTime = Date.now();
    const smartMode = params.smartMode || 'auto';
    const enableQueryEnhancement = params.enableQueryEnhancement !== false; // Default to true

    try {
      // Step 1: Query Enhancement Pipeline
      let processedQuery: ProcessedQuery | undefined;
      let enhancedQueries: string[] = [params.query];

      if (enableQueryEnhancement) {
        try {
          processedQuery = await QueryProcessor.enhanceQuery({
            query: params.query,
            config: params.enhancementConfig,
            context: {
              domain: 'cosmetic' // Default to cosmetic domain for this application
            }
          });

          enhancedQueries = [
            processedQuery.normalized,
            ...processedQuery.enhanced.slice(0, 3) // Limit to top 3 enhanced queries
          ];

          console.log(`Query enhanced: "${params.query}" -> ${enhancedQueries.length} variations`);
        } catch (error) {
          console.warn('Query enhancement failed, using original query:', error);
          processedQuery = undefined;
        }
      }

      // Step 2: Analyze query to determine optimal search strategy
      const queryAnalysis = AdaptiveSearchService.analyzeQuery(params.query);
      const queryClassification = classifyQuery(params.query);

      let searchMethod: 'vector' | 'adaptive' | 'hybrid';
      let recommendation: string;

      // Step 3: Determine search strategy (enhanced with query classification)
      if (smartMode !== 'auto') {
        searchMethod = smartMode.replace('_only', '') as any;
        recommendation = `Using ${smartMode} as requested`;
      } else {
        // Auto-select based on enhanced query characteristics
        const hasExactTerms = queryAnalysis.type === 'specific' || queryClassification.type === 'exact_match';
        const hasComplexTerms = queryAnalysis.hasCosmeticTerms || queryAnalysis.hasTechnicalTerms;
        const needsBroadSearch = queryClassification.type === 'broad' || queryAnalysis.wordCount === 1;

        if (params.enableHybridSearch !== false && (hasExactTerms || hasComplexTerms || queryAnalysis.hasNumbers)) {
          searchMethod = 'hybrid';
          recommendation = `Using hybrid search: ${queryClassification.reasoning}`;
        } else if (params.enableAdaptiveThreshold !== false &&
                   (queryAnalysis.complexity === 'complex' || queryAnalysis.wordCount > 3 || needsBroadSearch)) {
          searchMethod = 'adaptive';
          recommendation = `Using adaptive search: ${queryClassification.reasoning}`;
        } else {
          searchMethod = 'vector';
          recommendation = 'Using standard vector search for simple queries';
        }
      }

      console.log(
        `Smart search: method=${searchMethod}, ` +
        `query="${params.query}", enhanced=${enhancedQueries.length} variations, ` +
        `classification=${queryClassification.type}, reason="${recommendation}"`
      );

      // Step 4: Execute search with enhanced queries
      let results: VectorSearchResult[] = [];
      let cached = false;
      let additionalData: any = {};

      // Try each enhanced query until we get sufficient results
      const targetResults = params.limit || 10;
      let bestResults: VectorSearchResult[] = [];
      let searchAttempts = 0;

      for (const enhancedQuery of enhancedQueries) {
        if (bestResults.length >= targetResults || searchAttempts >= 3) break;

        searchAttempts++;
        const searchParams = { ...params, query: enhancedQuery };

        try {
          let searchResult: any;

          switch (searchMethod) {
            case 'hybrid':
              searchResult = await this.hybridVectorSearch({
                ...searchParams,
                hybridConfig: params.hybridConfig
              });
              if (searchResult.results.length > bestResults.length) {
                bestResults = searchResult.results;
                cached = searchResult.cached;
                additionalData = {
                  hybridAnalysis: searchResult.hybridAnalysis,
                  searchStrategy: searchResult.searchStrategy,
                  enhancedQueryUsed: enhancedQuery,
                  searchAttempts
                };
              }
              break;

            case 'adaptive':
              searchResult = await this.adaptiveVectorSearch({
                ...searchParams,
                enableAdaptiveThreshold: true,
                enableFallback: params.enableFallback
              });
              if (searchResult.results.length > bestResults.length) {
                bestResults = searchResult.results;
                cached = searchResult.cached;
                additionalData = {
                  adaptiveResult: searchResult.adaptiveResult,
                  thresholdUsed: searchResult.thresholdUsed,
                  totalAttempts: searchResult.totalAttempts,
                  enhancedQueryUsed: enhancedQuery,
                  searchAttempts
                };
              }
              break;

            case 'vector':
            default:
              searchResult = await this.vectorSearch(searchParams);
              if (searchResult.results.length > bestResults.length) {
                bestResults = searchResult.results;
                cached = searchResult.cached;
                additionalData = {
                  enhancedQueryUsed: enhancedQuery,
                  searchAttempts
                };
              }
              break;
          }

          // Break early if we have enough results
          if (bestResults.length >= targetResults) {
            console.log(`Found sufficient results (${bestResults.length}) with query: "${enhancedQuery}"`);
            break;
          }

        } catch (error) {
          console.warn(`Search failed for enhanced query "${enhancedQuery}":`, error);
          continue; // Try next enhanced query
        }
      }

      results = bestResults;

      // Optional result re-ranking step
      let finalResults: VectorSearchResult[] | RankedResult[] = results;
      let rankingAnalysis: RankingAnalysis | undefined;

      if (params.enableResultRanking && results.length > 0) {
        try {
          const rankingResult = await ResultRankingService.rerankResults(
            results,
            params.query,
            {
              maxResults: params.limit || 10,
              enableDiversification: true,
              userContext: params.userContext,
              debugMode: false
            }
          );

          finalResults = rankingResult.rankedResults;
          rankingAnalysis = rankingResult.analysis;

          console.log(
            `Results re-ranked: ${results.length} -> ${finalResults.length}, ` +
            `avg improvement: ${rankingAnalysis.averageScoreImprovement.toFixed(3)}`
          );
        } catch (error) {
          console.warn('Result re-ranking failed in smart search:', error);
          // Keep original results if ranking fails
        }
      }

      const searchTime = Date.now() - startTime;

      console.log(
        `Smart search completed: ${finalResults.length} results, ` +
        `${searchTime}ms, method=${searchMethod}, ` +
        `enhanced queries used=${searchAttempts}` +
        `${params.enableResultRanking ? ', ranking enabled' : ''}`
      );

      return {
        results: finalResults,
        searchTime,
        cached,
        searchMethod,
        recommendation,
        queryEnhancement: processedQuery,
        rankingAnalysis,
        additionalData: {
          ...additionalData,
          queryClassification,
          enhancedQueriesCount: enhancedQueries.length,
          originalQuery: params.query,
          resultRankingEnabled: params.enableResultRanking || false
        }
      };

    } catch (error) {
      console.error('Smart search error:', error);
      throw new Error(`Smart search failed: ${error.message}`);
    }
  }

  /**
   * Enhanced search with comprehensive query processing pipeline
   * This method showcases the full capabilities of the query enhancement system
   * Now includes intelligent result re-ranking
   */
  static async enhancedSearch(params: KnowledgeBaseSearchRequest & {
    enableQueryEnhancement?: boolean;
    enableSynonymExpansion?: boolean;
    enableSpellCorrection?: boolean;
    enableDomainTerms?: boolean;
    enableResultRanking?: boolean;
    queryAnalysisMode?: 'auto' | 'cosmetic' | 'technical';
    maxEnhancedQueries?: number;
    userContext?: any;
    debugMode?: boolean;
  }): Promise<{
    results: RankedResult[];
    originalResults: VectorSearchResult[];
    searchTime: number;
    cached: boolean;
    queryAnalysis: {
      original: string;
      processed: ProcessedQuery;
      classification: any;
      enhancedQueries: string[];
      recommendedStrategy: string;
    };
    searchPerformance: {
      enhancementTime: number;
      searchTime: number;
      rankingTime: number;
      totalTime: number;
      queriesAttempted: number;
      bestQueryUsed: string;
    };
    rankingAnalysis?: RankingAnalysis;
    searchMethod: string;
  }> {
    const overallStartTime = Date.now();
    const debugMode = params.debugMode || false;
    const enableResultRanking = params.enableResultRanking !== false; // Default to true

    try {
      // Step 1: Comprehensive Query Enhancement
      const enhancementStartTime = Date.now();

      const enhancementConfig = {
        enableSynonymExpansion: params.enableSynonymExpansion !== false,
        enableSpellCorrection: params.enableSpellCorrection !== false,
        enableDomainSpecificTerms: params.enableDomainTerms !== false,
        maxSynonymsPerTerm: 3,
        confidenceThreshold: 0.8
      };

      const domain = params.queryAnalysisMode === 'auto' ?
        'cosmetic' : params.queryAnalysisMode || 'cosmetic';

      // Enhanced query processing
      const processedQuery = await QueryProcessor.enhanceQuery({
        query: params.query,
        config: enhancementConfig,
        context: { domain }
      });

      // Query classification for strategy selection
      const queryClassification = classifyQuery(params.query);

      // Prepare enhanced queries for testing
      const maxQueries = params.maxEnhancedQueries || 5;
      const enhancedQueries = [
        processedQuery.normalized,
        ...processedQuery.enhanced.slice(0, maxQueries - 1)
      ].filter((query, index, arr) => arr.indexOf(query) === index); // Remove duplicates

      const enhancementTime = Date.now() - enhancementStartTime;

      if (debugMode) {
        console.log('=== Enhanced Search Debug Info ===');
        console.log('Original Query:', params.query);
        console.log('Query Analysis:', processedQuery.metadata);
        console.log('Synonyms Found:', processedQuery.synonyms);
        console.log('Domain Terms:', processedQuery.domainTerms);
        console.log('Corrections Applied:', processedQuery.corrections);
        console.log('Enhanced Queries:', enhancedQueries);
        console.log('Classification:', queryClassification);
        console.log('Enhancement Time:', enhancementTime + 'ms');
      }

      // Step 2: Execute Smart Search with Enhancement
      const searchStartTime = Date.now();

      const smartSearchResult = await this.smartSearch({
        ...params,
        enableQueryEnhancement: false, // We already enhanced it
        smartMode: 'auto'
      });

      // Try enhanced queries if original didn't yield enough results
      let bestResults = smartSearchResult.results;
      let bestQuery = params.query;
      let queriesAttempted = 1;

      const targetResults = params.limit || 10;
      if (bestResults.length < targetResults && enhancedQueries.length > 1) {
        if (debugMode) {
          console.log(`Original query yielded ${bestResults.length} results, trying enhanced queries...`);
        }

        for (let i = 1; i < enhancedQueries.length; i++) {
          const enhancedQuery = enhancedQueries[i];
          queriesAttempted++;

          try {
            const enhancedResult = await this.smartSearch({
              ...params,
              query: enhancedQuery,
              enableQueryEnhancement: false, // Already enhanced
              smartMode: 'auto'
            });

            if (enhancedResult.results.length > bestResults.length) {
              bestResults = enhancedResult.results;
              bestQuery = enhancedQuery;

              if (debugMode) {
                console.log(`Enhanced query "${enhancedQuery}" yielded ${enhancedResult.results.length} results`);
              }

              // Break if we have enough results
              if (bestResults.length >= targetResults) {
                break;
              }
            }
          } catch (error) {
            if (debugMode) {
              console.warn(`Enhanced query "${enhancedQuery}" failed:`, error);
            }
          }
        }
      }

      const searchTime = Date.now() - searchStartTime;

      // Step 3: Intelligent Result Re-ranking
      const rankingStartTime = Date.now();
      let finalResults: RankedResult[] = [];
      let rankingAnalysis: RankingAnalysis | undefined;

      if (enableResultRanking && bestResults.length > 0) {
        try {
          const rankingResult = await ResultRankingService.rerankResults(
            bestResults,
            bestQuery,
            {
              maxResults: params.limit || 10,
              enableDiversification: true,
              userContext: params.userContext,
              debugMode
            }
          );

          finalResults = rankingResult.rankedResults;
          rankingAnalysis = rankingResult.analysis;

          if (debugMode) {
            console.log('=== Result Re-ranking ===');
            console.log('Original Results:', bestResults.length);
            console.log('Re-ranked Results:', finalResults.length);
            console.log('Average Score Improvement:', rankingAnalysis.averageScoreImprovement.toFixed(3));
            console.log('Top Ranking Factors:', rankingAnalysis.topFactors.slice(0, 3).map(f => f.factor));
          }
        } catch (error) {
          console.warn('Result re-ranking failed, using original results:', error);
          // Convert to RankedResult format for consistency
          finalResults = bestResults.map((result, index) => ({
            ...result,
            rankingScore: result.similarity,
            rankingFactors: {} as any,
            rankingExplanation: ['Re-ranking failed, using similarity score'],
            originalRank: index + 1,
            newRank: index + 1,
            rankChange: 0
          }));
        }
      } else {
        // Convert to RankedResult format even without ranking
        finalResults = bestResults.map((result, index) => ({
          ...result,
          rankingScore: result.similarity,
          rankingFactors: {} as any,
          rankingExplanation: ['Re-ranking disabled, using similarity score'],
          originalRank: index + 1,
          newRank: index + 1,
          rankChange: 0
        }));
      }

      const rankingTime = Date.now() - rankingStartTime;
      const totalTime = Date.now() - overallStartTime;

      if (debugMode) {
        console.log('=== Search Performance ===');
        console.log('Queries Attempted:', queriesAttempted);
        console.log('Best Query Used:', bestQuery);
        console.log('Final Results Count:', finalResults.length);
        console.log('Enhancement Time:', enhancementTime + 'ms');
        console.log('Search Time:', searchTime + 'ms');
        console.log('Ranking Time:', rankingTime + 'ms');
        console.log('Total Time:', totalTime + 'ms');
        console.log('=== End Debug Info ===');
      }

      // Step 4: Record analytics (async, non-blocking)
      const analyticsPromise = SearchAnalyticsService.recordSearch({
        sessionId: params.context?.sessionId || 'enhanced-search',
        userId: params.context?.userId,
        query: params.query,
        method: `enhanced-${smartSearchResult.searchMethod}`,
        responseTime: totalTime,
        results: finalResults,
        metrics: {
          embeddingTime: enhancementTime,
          queryTime: searchTime,
          postProcessingTime: rankingTime,
          resultsFound: finalResults.length,
          relevanceScore: finalResults.length > 0 ?
            finalResults.reduce((sum, r) => sum + r.similarity, 0) / finalResults.length : 0,
          similarityThreshold: 0.7, // Default threshold
          cacheHit: smartSearchResult.cached,
          searchMethod: `enhanced-${smartSearchResult.searchMethod}`,
          queryEnhancementUsed: true,
          resultRankingUsed: enableResultRanking,
          fallbackUsed: queriesAttempted > 1,
          diversityScore: rankingAnalysis?.diversityMetrics.topicSpread || 0,
          contentQualityScore: rankingAnalysis?.qualityMetrics.averageContentQuality || 0
        },
        queryAnalysis: processedQuery,
        rankingAnalysis,
        context: params.context
      }).catch(error => {
        console.warn('Failed to record search analytics:', error);
      });

      const result = {
        results: finalResults,
        originalResults: bestResults,
        searchTime: totalTime,
        cached: smartSearchResult.cached,
        queryAnalysis: {
          original: params.query,
          processed: processedQuery,
          classification: queryClassification,
          enhancedQueries,
          recommendedStrategy: queryClassification.recommendedStrategy
        },
        searchPerformance: {
          enhancementTime,
          searchTime,
          rankingTime,
          totalTime,
          queriesAttempted,
          bestQueryUsed: bestQuery
        },
        rankingAnalysis,
        searchMethod: smartSearchResult.searchMethod
      };

      // Don't await analytics to avoid blocking the response
      analyticsPromise;

      return result;

    } catch (error) {
      console.error('Enhanced search error:', error);

      // Record error in analytics
      SearchAnalyticsService.recordSearch({
        sessionId: params.context?.sessionId || 'enhanced-search',
        userId: params.context?.userId,
        query: params.query,
        method: 'enhanced-error',
        responseTime: Date.now() - overallStartTime,
        results: [],
        metrics: {
          resultsFound: 0,
          relevanceScore: 0,
          similarityThreshold: 0.7,
          cacheHit: false,
          searchMethod: 'enhanced-error',
          queryEnhancementUsed: false,
          resultRankingUsed: false,
          fallbackUsed: false,
          diversityScore: 0,
          contentQualityScore: 0
        },
        context: params.context,
        error
      }).catch(analyticsError => {
        console.warn('Failed to record error analytics:', analyticsError);
      });

      throw new Error(`Enhanced search failed: ${error.message}`);
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
      // Use raw SQL to match actual database schema
      const queryHash = createHash('sha256').update(query + JSON.stringify(filters)).digest('hex');

      await db.execute(sql`
        INSERT INTO search_queries (
          query_hash,
          query_text,
          filters,
          user_id,
          result_count,
          processing_time_ms,
          created_at
        ) VALUES (
          ${queryHash},
          ${query},
          ${JSON.stringify(filters)},
          ${userId || null},
          ${resultsCount},
          ${responseTime},
          NOW()
        )
      `);
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

  // =============================================================================
  // PHASE 1: CRITICAL FIXES - MISSING EMBEDDINGS REPAIR
  // =============================================================================

  /**
   * Identify all chunks with missing embeddings
   */
  static async identifyMissingEmbeddings(): Promise<{
    totalChunks: number;
    missingCount: number;
    missingChunks: Array<{
      chunkId: string;
      documentId: string;
      chunkIndex: number;
      content: string;
      documentName: string;
    }>;
  }> {
    try {
      // Get total counts
      const [totalResult] = await db
        .select({ count: count() })
        .from(documentChunks);

      const [missingResult] = await db
        .select({ count: count() })
        .from(documentChunks)
        .where(sql`embedding IS NULL`);

      // Get detailed missing chunk information
      const missingChunks = await db
        .select({
          chunkId: documentChunks.id,
          documentId: documentChunks.documentId,
          chunkIndex: documentChunks.chunkIndex,
          content: documentChunks.content,
          documentName: sql<string>`COALESCE(${documents.title}, ${documents.originalFilename}, ${documents.filename})`,
        })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(sql`${documentChunks.embedding} IS NULL`)
        .orderBy(documents.originalFilename, documentChunks.chunkIndex);

      return {
        totalChunks: totalResult.count,
        missingCount: missingResult.count,
        missingChunks: missingChunks
      };
    } catch (error) {
      console.error('Error identifying missing embeddings:', error);
      throw new Error('Failed to identify missing embeddings');
    }
  }

  /**
   * Repair missing embeddings for specific chunks
   */
  static async repairMissingEmbeddings(chunkIds?: string[]): Promise<{
    totalRepaired: number;
    successCount: number;
    failureCount: number;
    failures: Array<{
      chunkId: string;
      error: string;
    }>;
  }> {
    try {
      // Get chunks to repair
      let chunksToRepair;
      if (chunkIds && chunkIds.length > 0) {
        chunksToRepair = await db
          .select({
            id: documentChunks.id,
            content: documentChunks.content,
            documentId: documentChunks.documentId,
            chunkIndex: documentChunks.chunkIndex,
          })
          .from(documentChunks)
          .where(and(
            inArray(documentChunks.id, chunkIds),
            sql`embedding IS NULL`
          ));
      } else {
        // Repair all missing embeddings
        chunksToRepair = await db
          .select({
            id: documentChunks.id,
            content: documentChunks.content,
            documentId: documentChunks.documentId,
            chunkIndex: documentChunks.chunkIndex,
          })
          .from(documentChunks)
          .where(sql`embedding IS NULL`);
      }

      const results = {
        totalRepaired: chunksToRepair.length,
        successCount: 0,
        failureCount: 0,
        failures: [] as Array<{ chunkId: string; error: string }>
      };

      // Process each chunk
      for (const chunk of chunksToRepair) {
        try {
          console.log(`Generating embedding for chunk ${chunk.id} (index ${chunk.chunkIndex})`);

          // Generate embedding for the chunk content
          const embedding = await this.generateEmbedding(chunk.content);

          // Convert to pgvector format
          const embeddingVector = `[${embedding.join(',')}]`;

          // Update the chunk with the new embedding
          await db
            .update(documentChunks)
            .set({
              embedding: embeddingVector as any,
              // Add quality metadata
              metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
                repaired: true,
                repairedAt: new Date().toISOString(),
                embeddingDimensions: embedding.length,
                contentLength: chunk.content.length
              })}`
            })
            .where(eq(documentChunks.id, chunk.id));

          results.successCount++;
          console.log(`✅ Successfully repaired chunk ${chunk.id}`);

        } catch (error) {
          console.error(`❌ Failed to repair chunk ${chunk.id}:`, error);
          results.failureCount++;
          results.failures.push({
            chunkId: chunk.id,
            error: error.message || 'Unknown error'
          });
        }
      }

      console.log(`Embedding repair completed: ${results.successCount} success, ${results.failureCount} failures`);
      return results;

    } catch (error) {
      console.error('Error repairing missing embeddings:', error);
      throw new Error(`Failed to repair missing embeddings: ${error.message}`);
    }
  }

  /**
   * Validate embedding integrity across all chunks
   */
  static async validateEmbeddingIntegrity(): Promise<{
    isValid: boolean;
    totalChunks: number;
    validEmbeddings: number;
    invalidEmbeddings: number;
    missingEmbeddings: number;
    embeddingCoverage: number;
    issues: Array<{
      chunkId: string;
      documentName: string;
      chunkIndex: number;
      issue: string;
    }>;
  }> {
    try {
      const issues: Array<{
        chunkId: string;
        documentName: string;
        chunkIndex: number;
        issue: string;
      }> = [];

      // Get all chunks with their embedding status
      const chunks = await db
        .select({
          id: documentChunks.id,
          embedding: documentChunks.embedding,
          chunkIndex: documentChunks.chunkIndex,
          documentName: sql<string>`COALESCE(${documents.title}, ${documents.originalFilename}, ${documents.filename})`,
        })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .orderBy(documents.originalFilename, documentChunks.chunkIndex);

      let validEmbeddings = 0;
      let missingEmbeddings = 0;
      let invalidEmbeddings = 0;

      for (const chunk of chunks) {
        if (!chunk.embedding) {
          missingEmbeddings++;
          issues.push({
            chunkId: chunk.id,
            documentName: chunk.documentName,
            chunkIndex: chunk.chunkIndex,
            issue: 'Missing embedding'
          });
        } else {
          try {
            // Validate embedding format and dimensions
            const embeddingArray = JSON.parse(chunk.embedding as string);
            if (!Array.isArray(embeddingArray)) {
              invalidEmbeddings++;
              issues.push({
                chunkId: chunk.id,
                documentName: chunk.documentName,
                chunkIndex: chunk.chunkIndex,
                issue: 'Invalid embedding format: not an array'
              });
            } else if (embeddingArray.length !== 512) {
              invalidEmbeddings++;
              issues.push({
                chunkId: chunk.id,
                documentName: chunk.documentName,
                chunkIndex: chunk.chunkIndex,
                issue: `Invalid embedding dimensions: ${embeddingArray.length} (expected 512)`
              });
            } else if (!embeddingArray.every(v => typeof v === 'number' && !isNaN(v))) {
              invalidEmbeddings++;
              issues.push({
                chunkId: chunk.id,
                documentName: chunk.documentName,
                chunkIndex: chunk.chunkIndex,
                issue: 'Invalid embedding values: contains non-numeric values'
              });
            } else {
              validEmbeddings++;
            }
          } catch (parseError) {
            invalidEmbeddings++;
            issues.push({
              chunkId: chunk.id,
              documentName: chunk.documentName,
              chunkIndex: chunk.chunkIndex,
              issue: 'Invalid embedding format: JSON parse error'
            });
          }
        }
      }

      const totalChunks = chunks.length;
      const embeddingCoverage = totalChunks > 0 ?
        Math.round((validEmbeddings / totalChunks) * 10000) / 100 : 0;

      return {
        isValid: missingEmbeddings === 0 && invalidEmbeddings === 0,
        totalChunks,
        validEmbeddings,
        invalidEmbeddings,
        missingEmbeddings,
        embeddingCoverage,
        issues
      };

    } catch (error) {
      console.error('Error validating embedding integrity:', error);
      throw new Error('Failed to validate embedding integrity');
    }
  }
}