/**
 * Hybrid Search Service
 *
 * Phase 2: Search Algorithm Enhancement
 * Combines vector similarity search with keyword-based full-text search
 * Uses reciprocal rank fusion for optimal result combination
 */

import { db } from '@/lib/db';
import { documentChunks, documents } from '@/lib/db/schema';
import { sql, and, or, inArray, gte, lte, desc } from 'drizzle-orm';
import {
  type VectorSearchResult,
  type KnowledgeBaseSearchRequest
} from '@/lib/validation/knowledge-base';
import { z } from 'zod';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface HybridSearchConfig {
  vectorWeight: number;        // Weight for vector similarity (0-1)
  keywordWeight: number;       // Weight for keyword matching (0-1)
  minimumResults: number;      // Guarantee minimum result count
  fusionMethod: 'reciprocal_rank_fusion' | 'weighted_score' | 'borda_count';
  vectorThreshold: number;     // Minimum similarity for vector results
  keywordThreshold: number;    // Minimum relevance for keyword results
  maxVectorResults: number;    // Maximum results from vector search
  maxKeywordResults: number;   // Maximum results from keyword search
}

export interface HybridSearchResult extends VectorSearchResult {
  fusionScore: number;         // Combined score from both methods
  vectorScore: number;         // Original vector similarity
  keywordScore: number;        // Keyword relevance score
  searchMethod: 'vector' | 'keyword' | 'hybrid';
  vectorRank?: number;         // Rank in vector results
  keywordRank?: number;        // Rank in keyword results
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  searchTime: number;
  vectorResultCount: number;
  keywordResultCount: number;
  fusionResultCount: number;
  config: HybridSearchConfig;
  searchAnalysis: {
    queryLength: number;
    hasQuotes: boolean;
    hasSpecialTerms: boolean;
    searchStrategy: string;
  };
}

export interface HybridSearchParams extends KnowledgeBaseSearchRequest {
  hybridConfig?: Partial<HybridSearchConfig>;
  enableVectorSearch?: boolean;
  enableKeywordSearch?: boolean;
}

// =============================================================================
// CONFIGURATION AND CONSTANTS
// =============================================================================

const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  vectorWeight: 0.7,           // 70% weight for semantic similarity
  keywordWeight: 0.3,          // 30% weight for keyword matching
  minimumResults: 5,           // Guarantee at least 5 results
  fusionMethod: 'reciprocal_rank_fusion',
  vectorThreshold: 0.3,        // Lower threshold for broader semantic matching
  keywordThreshold: 0.1,       // Lower threshold for keyword relevance
  maxVectorResults: 30,        // Get more candidates for fusion
  maxKeywordResults: 30,       // Get more candidates for fusion
};

// Special characters that indicate exact matching needs
const EXACT_MATCH_INDICATORS = ['"', "'", '(', ')', '[', ']'];

// Keywords that benefit from exact matching
const EXACT_MATCH_TERMS = new Set([
  'inci', 'cas', 'einecs', 'api', 'url', 'id', 'code', 'number',
  'version', 'model', 'type', 'class', 'function', 'method'
]);

// =============================================================================
// HYBRID SEARCH SERVICE
// =============================================================================

export class HybridSearchService {
  private static config: HybridSearchConfig = DEFAULT_HYBRID_CONFIG;

  /**
   * Update hybrid search configuration
   */
  static updateConfig(newConfig: Partial<HybridSearchConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };

    // Ensure weights sum to 1.0
    const totalWeight = this.config.vectorWeight + this.config.keywordWeight;
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      this.config.vectorWeight = this.config.vectorWeight / totalWeight;
      this.config.keywordWeight = this.config.keywordWeight / totalWeight;
    }
  }

  /**
   * Get current hybrid search configuration
   */
  static getConfig(): HybridSearchConfig {
    return { ...this.config };
  }

  /**
   * Perform hybrid search combining vector and keyword approaches
   */
  static async hybridSearch(
    params: HybridSearchParams,
    queryEmbedding: number[]
  ): Promise<HybridSearchResponse> {
    const startTime = Date.now();

    // Merge configurations
    const searchConfig: HybridSearchConfig = {
      ...this.config,
      ...params.hybridConfig
    };

    // Analyze query characteristics
    const searchAnalysis = this.analyzeQueryForHybridSearch(params.query);

    // Determine search strategy based on query analysis
    const enableVector = params.enableVectorSearch !== false && searchAnalysis.hasSpecialTerms !== true;
    const enableKeyword = params.enableKeywordSearch !== false;

    console.log(
      `Hybrid search: query="${params.query}", strategy="${searchAnalysis.searchStrategy}", ` +
      `vector=${enableVector}, keyword=${enableKeyword}`
    );

    // Execute searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      enableVector ? this.performVectorSearch(params, queryEmbedding, searchConfig) : Promise.resolve([]),
      enableKeyword ? this.performKeywordSearch(params, searchConfig) : Promise.resolve([])
    ]);

    console.log(
      `Search results: vector=${vectorResults.length}, keyword=${keywordResults.length}`
    );

    // Fuse results using selected method
    const fusedResults = this.fuseResults(
      vectorResults,
      keywordResults,
      searchConfig,
      params.limit || 10
    );

    const searchTime = Date.now() - startTime;

    return {
      results: fusedResults,
      searchTime,
      vectorResultCount: vectorResults.length,
      keywordResultCount: keywordResults.length,
      fusionResultCount: fusedResults.length,
      config: searchConfig,
      searchAnalysis
    };
  }

  /**
   * Analyze query to determine optimal hybrid search strategy
   */
  private static analyzeQueryForHybridSearch(query: string): {
    queryLength: number;
    hasQuotes: boolean;
    hasSpecialTerms: boolean;
    searchStrategy: string;
  } {
    const normalizedQuery = query.toLowerCase().trim();
    const words = normalizedQuery.split(/\s+/);

    const hasQuotes = EXACT_MATCH_INDICATORS.some(char => query.includes(char));
    const hasSpecialTerms = words.some(word =>
      EXACT_MATCH_TERMS.has(word) ||
      /^[A-Z]{2,}-?\d+$/.test(word) ||  // Codes like CI-77891
      /^\d{3,}-?\d{2,}-?\d+$/.test(word) // CAS numbers
    );

    let searchStrategy: string;
    if (hasQuotes || hasSpecialTerms) {
      searchStrategy = 'keyword_priority';
    } else if (words.length === 1) {
      searchStrategy = 'vector_priority';
    } else if (words.length > 5) {
      searchStrategy = 'vector_primary';
    } else {
      searchStrategy = 'balanced_hybrid';
    }

    return {
      queryLength: words.length,
      hasQuotes,
      hasSpecialTerms,
      searchStrategy
    };
  }

  /**
   * Perform vector similarity search
   */
  private static async performVectorSearch(
    params: HybridSearchParams,
    queryEmbedding: number[],
    config: HybridSearchConfig
  ): Promise<Array<HybridSearchResult & { vectorRank: number }>> {
    try {
      const embeddingVector = `[${queryEmbedding.join(',')}]`;

      // Build filter conditions
      const filterConditions = this.buildFilterConditions(params.filters);

      const vectorQuery = sql`
        SELECT
          dc.id as chunk_id,
          dc.document_id,
          dc.content,
          dc.chunk_index,
          dc.metadata as chunk_metadata,
          COALESCE(d.title, d.original_filename, d.filename) as document_name,
          d.original_filename as filename,
          d.metadata as document_metadata,
          (1 - (dc.embedding <=> ${embeddingVector}::vector)) as similarity,
          ROW_NUMBER() OVER (ORDER BY dc.embedding <=> ${embeddingVector}::vector ASC) as vector_rank
        FROM document_chunks dc
        INNER JOIN documents d ON dc.document_id = d.id
        WHERE
          dc.embedding IS NOT NULL
          AND d.processing_status = 'completed'
          AND d.deleted_at IS NULL
          AND (1 - (dc.embedding <=> ${embeddingVector}::vector)) >= ${config.vectorThreshold}
          ${filterConditions ? sql`AND ${filterConditions}` : sql``}
        ORDER BY dc.embedding <=> ${embeddingVector}::vector ASC
        LIMIT ${config.maxVectorResults}
      `;

      const rawResults = await db.execute(vectorQuery);

      return (rawResults.rows || rawResults).map((row: any, index: number) => ({
        documentId: row.document_id,
        chunkId: row.chunk_id,
        content: params.includeContent !== false ? row.content : '',
        similarity: parseFloat(row.similarity.toFixed(4)),
        fusionScore: 0, // Will be calculated during fusion
        vectorScore: parseFloat(row.similarity.toFixed(4)),
        keywordScore: 0,
        searchMethod: 'vector' as const,
        vectorRank: index + 1,
        metadata: {
          documentName: row.document_name || 'Untitled Document',
          filename: row.filename || 'unknown',
          category: this.safeJsonParse(row.document_metadata)?.category || 'uncategorized',
          supplier: this.safeJsonParse(row.document_metadata)?.supplier || 'unknown',
          tags: this.safeJsonParse(row.document_metadata)?.tags || [],
          chunkIndex: row.chunk_index || 0,
          searchMethod: 'vector',
          ...this.safeJsonParse(row.chunk_metadata)
        }
      }));

    } catch (error) {
      console.error('Vector search error in hybrid search:', error);
      return [];
    }
  }

  /**
   * Perform keyword-based full-text search
   */
  private static async performKeywordSearch(
    params: HybridSearchParams,
    config: HybridSearchConfig
  ): Promise<Array<HybridSearchResult & { keywordRank: number }>> {
    try {
      // Prepare search query for PostgreSQL full-text search
      const searchQuery = this.prepareKeywordQuery(params.query);

      // Build filter conditions
      const filterConditions = this.buildFilterConditions(params.filters);

      const keywordQuery = sql`
        SELECT
          dc.id as chunk_id,
          dc.document_id,
          dc.content,
          dc.chunk_index,
          dc.metadata as chunk_metadata,
          COALESCE(d.title, d.original_filename, d.filename) as document_name,
          d.original_filename as filename,
          d.metadata as document_metadata,
          ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${searchQuery})) as keyword_rank,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${searchQuery})) DESC) as rank_position
        FROM document_chunks dc
        INNER JOIN documents d ON dc.document_id = d.id
        WHERE
          d.processing_status = 'completed'
          AND d.deleted_at IS NULL
          AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${searchQuery})
          AND ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${searchQuery})) >= ${config.keywordThreshold}
          ${filterConditions ? sql`AND ${filterConditions}` : sql``}
        ORDER BY ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${searchQuery})) DESC
        LIMIT ${config.maxKeywordResults}
      `;

      const rawResults = await db.execute(keywordQuery);

      return (rawResults.rows || rawResults).map((row: any, index: number) => ({
        documentId: row.document_id,
        chunkId: row.chunk_id,
        content: params.includeContent !== false ? row.content : '',
        similarity: parseFloat(row.keyword_rank.toFixed(4)), // Use keyword rank as similarity
        fusionScore: 0, // Will be calculated during fusion
        vectorScore: 0,
        keywordScore: parseFloat(row.keyword_rank.toFixed(4)),
        searchMethod: 'keyword' as const,
        keywordRank: index + 1,
        metadata: {
          documentName: row.document_name || 'Untitled Document',
          filename: row.filename || 'unknown',
          category: this.safeJsonParse(row.document_metadata)?.category || 'uncategorized',
          supplier: this.safeJsonParse(row.document_metadata)?.supplier || 'unknown',
          tags: this.safeJsonParse(row.document_metadata)?.tags || [],
          chunkIndex: row.chunk_index || 0,
          searchMethod: 'keyword',
          keywordRank: parseFloat(row.keyword_rank.toFixed(4)),
          ...this.safeJsonParse(row.chunk_metadata)
        }
      }));

    } catch (error) {
      console.error('Keyword search error in hybrid search:', error);
      return [];
    }
  }

  /**
   * Prepare query for PostgreSQL full-text search
   */
  private static prepareKeywordQuery(query: string): string {
    // Remove special characters that might break the query
    let cleanQuery = query
      .replace(/['"()\[\]]/g, ' ')  // Remove quotes and brackets
      .replace(/[^\w\s-]/g, ' ')     // Remove other special chars except hyphens
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim();

    // Handle specific patterns
    if (cleanQuery.includes('inci') || cleanQuery.includes('INCI')) {
      cleanQuery = cleanQuery.replace(/\binci\b/gi, 'inci | ingredient | nomenclature');
    }

    return cleanQuery;
  }

  /**
   * Fuse vector and keyword results using the specified method
   */
  private static fuseResults(
    vectorResults: Array<HybridSearchResult & { vectorRank: number }>,
    keywordResults: Array<HybridSearchResult & { keywordRank: number }>,
    config: HybridSearchConfig,
    limit: number
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    // Process vector results
    vectorResults.forEach((result) => {
      const key = result.chunkId;
      resultMap.set(key, {
        ...result,
        searchMethod: 'vector',
        fusionScore: this.calculateFusionScore(result, null, config, 'vector')
      });
    });

    // Process keyword results and merge with vector results
    keywordResults.forEach((result) => {
      const key = result.chunkId;
      const existing = resultMap.get(key);

      if (existing) {
        // Merge results - this chunk was found by both methods
        const merged: HybridSearchResult = {
          ...existing,
          keywordScore: result.keywordScore,
          keywordRank: result.keywordRank,
          searchMethod: 'hybrid',
          fusionScore: this.calculateFusionScore(existing, result, config, 'hybrid')
        };
        resultMap.set(key, merged);
      } else {
        // New result from keyword search only
        resultMap.set(key, {
          ...result,
          searchMethod: 'keyword',
          fusionScore: this.calculateFusionScore(null, result, config, 'keyword')
        });
      }
    });

    // Convert to array and sort by fusion score
    const fusedResults = Array.from(resultMap.values())
      .sort((a, b) => b.fusionScore - a.fusionScore)
      .slice(0, limit);

    console.log(
      `Fusion complete: ${fusedResults.length} results, ` +
      `hybrid: ${fusedResults.filter(r => r.searchMethod === 'hybrid').length}, ` +
      `vector-only: ${fusedResults.filter(r => r.searchMethod === 'vector').length}, ` +
      `keyword-only: ${fusedResults.filter(r => r.searchMethod === 'keyword').length}`
    );

    return fusedResults;
  }

  /**
   * Calculate fusion score based on the selected method
   */
  private static calculateFusionScore(
    vectorResult: HybridSearchResult | null,
    keywordResult: HybridSearchResult | null,
    config: HybridSearchConfig,
    method: 'vector' | 'keyword' | 'hybrid'
  ): number {
    switch (config.fusionMethod) {
      case 'reciprocal_rank_fusion':
        return this.calculateReciprocalRankFusion(vectorResult, keywordResult, config);

      case 'weighted_score':
        return this.calculateWeightedScore(vectorResult, keywordResult, config);

      case 'borda_count':
        return this.calculateBordaCount(vectorResult, keywordResult, config);

      default:
        return this.calculateReciprocalRankFusion(vectorResult, keywordResult, config);
    }
  }

  /**
   * Calculate Reciprocal Rank Fusion (RRF) score
   */
  private static calculateReciprocalRankFusion(
    vectorResult: HybridSearchResult | null,
    keywordResult: HybridSearchResult | null,
    config: HybridSearchConfig
  ): number {
    const k = 60; // RRF constant
    let score = 0;

    if (vectorResult?.vectorRank) {
      score += config.vectorWeight / (k + vectorResult.vectorRank);
    }

    if (keywordResult?.keywordRank) {
      score += config.keywordWeight / (k + keywordResult.keywordRank);
    }

    return score;
  }

  /**
   * Calculate weighted score fusion
   */
  private static calculateWeightedScore(
    vectorResult: HybridSearchResult | null,
    keywordResult: HybridSearchResult | null,
    config: HybridSearchConfig
  ): number {
    let score = 0;

    if (vectorResult) {
      score += config.vectorWeight * vectorResult.vectorScore;
    }

    if (keywordResult) {
      score += config.keywordWeight * keywordResult.keywordScore;
    }

    return score;
  }

  /**
   * Calculate Borda count fusion
   */
  private static calculateBordaCount(
    vectorResult: HybridSearchResult | null,
    keywordResult: HybridSearchResult | null,
    config: HybridSearchConfig
  ): number {
    let score = 0;

    if (vectorResult?.vectorRank) {
      score += config.vectorWeight * (config.maxVectorResults - vectorResult.vectorRank + 1);
    }

    if (keywordResult?.keywordRank) {
      score += config.keywordWeight * (config.maxKeywordResults - keywordResult.keywordRank + 1);
    }

    return score;
  }

  /**
   * Build filter conditions for SQL queries
   */
  private static buildFilterConditions(filters: KnowledgeBaseSearchRequest['filters'] = {}) {
    const conditions = [];

    if (filters.documentTypes && filters.documentTypes.length > 0) {
      conditions.push(sql`d.mime_type = ANY(${filters.documentTypes})`);
    }

    if (filters.documentIds && filters.documentIds.length > 0) {
      conditions.push(sql`d.id = ANY(${filters.documentIds})`);
    }

    if (filters.dateRange) {
      if (filters.dateRange.from) {
        conditions.push(sql`d.created_at >= ${new Date(filters.dateRange.from)}`);
      }
      if (filters.dateRange.to) {
        conditions.push(sql`d.created_at <= ${new Date(filters.dateRange.to)}`);
      }
    }

    if (filters.categories && filters.categories.length > 0) {
      conditions.push(sql`d.metadata->>'category' = ANY(${filters.categories})`);
    }

    if (filters.supplierIds && filters.supplierIds.length > 0) {
      conditions.push(sql`d.metadata->>'supplierId' = ANY(${filters.supplierIds})`);
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
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
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const hybridSearchConfigSchema = z.object({
  vectorWeight: z.number().min(0).max(1),
  keywordWeight: z.number().min(0).max(1),
  minimumResults: z.number().int().min(1).max(50),
  fusionMethod: z.enum(['reciprocal_rank_fusion', 'weighted_score', 'borda_count']),
  vectorThreshold: z.number().min(0).max(1),
  keywordThreshold: z.number().min(0).max(1),
  maxVectorResults: z.number().int().min(10).max(100),
  maxKeywordResults: z.number().int().min(10).max(100)
}).strict();

export const hybridSearchParamsSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(50).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  hybridConfig: hybridSearchConfigSchema.partial().optional(),
  enableVectorSearch: z.boolean().optional().default(true),
  enableKeywordSearch: z.boolean().optional().default(true),
  includeContent: z.boolean().optional().default(true),
  cacheResults: z.boolean().optional().default(true),
  filters: z.object({
    documentTypes: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    supplierIds: z.array(z.string().uuid()).optional(),
    documentIds: z.array(z.string().uuid()).optional(),
    dateRange: z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional()
    }).optional()
  }).optional().default({})
}).strict();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function validateHybridSearchParams(data: unknown): HybridSearchParams {
  return hybridSearchParamsSchema.parse(data);
}

export function validateHybridSearchConfig(data: unknown): HybridSearchConfig {
  return hybridSearchConfigSchema.parse(data);
}