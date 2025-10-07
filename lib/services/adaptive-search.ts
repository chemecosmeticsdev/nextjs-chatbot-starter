/**
 * Adaptive Search Service
 *
 * Phase 2: Search Algorithm Enhancement
 * Implements dynamic threshold management and query analysis for improved search accuracy
 */

import { z } from 'zod';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface AdaptiveThresholdConfig {
  singleWord: number;     // Lower for broad concepts (0.3)
  multiWord: number;      // Balanced for phrases (0.5)
  specific: number;       // Higher for exact matches (0.7)
  technical: number;      // Medium for domain terms (0.6)
  cosmetic: number;       // Specialized for cosmetic/INCI terms (0.6)
  fallback: number;       // Progressive threshold reduction (0.2)
}

export interface QueryAnalysis {
  type: 'single_word' | 'multi_word' | 'specific' | 'technical' | 'cosmetic';
  wordCount: number;
  hasSpecialChars: boolean;
  hasTechnicalTerms: boolean;
  hasCosmeticTerms: boolean;
  hasNumbers: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
  confidence: number;
  suggestedThreshold: number;
  fallbackThresholds: number[];
}

export interface AdaptiveSearchParams {
  query: string;
  baseThreshold?: number;
  enableFallback?: boolean;
  maxFallbackAttempts?: number;
  minimumResults?: number;
}

export interface AdaptiveSearchResult {
  threshold: number;
  queryAnalysis: QueryAnalysis;
  fallbackUsed: boolean;
  attemptCount: number;
  recommendation: string;
}

export interface AdaptiveSearchResponse {
  results: any[];
  searchMethod: string;
  thresholdUsed: number;
  cached: boolean;
  queryAnalysis?: QueryAnalysis;
  fallbackUsed?: boolean;
  attemptCount?: number;
}

// =============================================================================
// CONFIGURATION AND CONSTANTS
// =============================================================================

const DEFAULT_THRESHOLD_CONFIG: AdaptiveThresholdConfig = {
  singleWord: 0.3,      // Lower for broad concepts
  multiWord: 0.5,       // Balanced for phrases
  specific: 0.7,        // Higher for exact matches
  technical: 0.6,       // Medium for domain terms
  cosmetic: 0.6,        // Specialized for cosmetic/INCI terms
  fallback: 0.2         // Progressive threshold reduction
};

// Technical terms commonly found in cosmetic/chemical documents
const TECHNICAL_TERMS = new Set([
  'algorithm', 'api', 'database', 'query', 'search', 'vector', 'embedding',
  'similarity', 'threshold', 'optimization', 'performance', 'analytics',
  'processing', 'automation', 'integration', 'configuration', 'validation'
]);

// Cosmetic and INCI related terms
const COSMETIC_TERMS = new Set([
  'inci', 'cosmetic', 'ingredient', 'formulation', 'safety', 'regulatory',
  'compliance', 'product', 'chemical', 'concentration', 'dermatology',
  'skincare', 'toxicology', 'allergen', 'preservative', 'emulsifier',
  'surfactant', 'moisturizer', 'sunscreen', 'fragrance', 'colorant',
  'ph', 'stability', 'compatibility', 'efficacy', 'testing'
]);

// Specific pattern indicators (codes, IDs, exact matches)
const SPECIFIC_PATTERNS = [
  /^[A-Z]{2,}-?\d+$/,           // Codes like "CI-77891"
  /^\d{3,}-?\d{2,}-?\d+$/,      // CAS numbers
  /^[A-Z]{3,}\s*\d+$/,          // Product codes
  /[A-Z]{2,}\s*[0-9]+/,         // Mixed alphanumeric codes
  /"[^"]+"/,                    // Quoted exact matches
  /'[^']+'/                     // Single quoted exact matches
];

// =============================================================================
// ADAPTIVE SEARCH SERVICE
// =============================================================================

export class AdaptiveSearchService {
  private static thresholdConfig: AdaptiveThresholdConfig = DEFAULT_THRESHOLD_CONFIG;

  /**
   * Update threshold configuration
   */
  static updateThresholdConfig(config: Partial<AdaptiveThresholdConfig>): void {
    this.thresholdConfig = {
      ...this.thresholdConfig,
      ...config
    };
  }

  /**
   * Get current threshold configuration
   */
  static getThresholdConfig(): AdaptiveThresholdConfig {
    return { ...this.thresholdConfig };
  }

  /**
   * Analyze query characteristics to determine optimal threshold
   */
  static analyzeQuery(query: string): QueryAnalysis {
    const normalizedQuery = query.toLowerCase().trim();
    const words = normalizedQuery.split(/\s+/).filter(word => word.length > 0);

    // Basic characteristics
    const wordCount = words.length;
    const hasSpecialChars = /[^\w\s-']/.test(query);
    const hasNumbers = /\d/.test(query);

    // Check for technical terms
    const hasTechnicalTerms = words.some(word =>
      TECHNICAL_TERMS.has(word) ||
      TECHNICAL_TERMS.has(word.replace(/s$/, '')) // Handle plurals
    );

    // Check for cosmetic terms
    const hasCosmeticTerms = words.some(word =>
      COSMETIC_TERMS.has(word) ||
      COSMETIC_TERMS.has(word.replace(/s$/, '')) // Handle plurals
    );

    // Check for specific patterns
    const hasSpecificPatterns = SPECIFIC_PATTERNS.some(pattern => pattern.test(query));

    // Determine query type and complexity
    let type: QueryAnalysis['type'];
    let complexity: QueryAnalysis['complexity'];
    let confidence: number;

    if (hasSpecificPatterns || (hasSpecialChars && wordCount <= 2)) {
      type = 'specific';
      complexity = 'simple';
      confidence = 0.9;
    } else if (hasCosmeticTerms) {
      type = 'cosmetic';
      complexity = wordCount > 3 ? 'complex' : 'moderate';
      confidence = 0.8;
    } else if (hasTechnicalTerms) {
      type = 'technical';
      complexity = wordCount > 4 ? 'complex' : 'moderate';
      confidence = 0.8;
    } else if (wordCount === 1) {
      type = 'single_word';
      complexity = 'simple';
      confidence = 0.7;
    } else {
      type = 'multi_word';
      complexity = wordCount > 5 ? 'complex' : wordCount > 2 ? 'moderate' : 'simple';
      confidence = 0.6;
    }

    // Calculate suggested threshold
    const suggestedThreshold = this.calculateThreshold(type, complexity, confidence);

    // Generate fallback thresholds
    const fallbackThresholds = this.generateFallbackThresholds(suggestedThreshold);

    return {
      type,
      wordCount,
      hasSpecialChars,
      hasTechnicalTerms,
      hasCosmeticTerms,
      hasNumbers,
      complexity,
      confidence,
      suggestedThreshold,
      fallbackThresholds
    };
  }

  /**
   * Calculate optimal threshold based on query analysis
   */
  private static calculateThreshold(
    type: QueryAnalysis['type'],
    complexity: QueryAnalysis['complexity'],
    confidence: number
  ): number {
    let baseThreshold: number;

    // Get base threshold from configuration
    switch (type) {
      case 'single_word':
        baseThreshold = this.thresholdConfig.singleWord;
        break;
      case 'multi_word':
        baseThreshold = this.thresholdConfig.multiWord;
        break;
      case 'specific':
        baseThreshold = this.thresholdConfig.specific;
        break;
      case 'technical':
        baseThreshold = this.thresholdConfig.technical;
        break;
      case 'cosmetic':
        baseThreshold = this.thresholdConfig.cosmetic;
        break;
      default:
        baseThreshold = this.thresholdConfig.multiWord;
    }

    // Adjust based on complexity
    let complexityAdjustment = 0;
    switch (complexity) {
      case 'simple':
        complexityAdjustment = 0;
        break;
      case 'moderate':
        complexityAdjustment = -0.05; // Slightly lower threshold
        break;
      case 'complex':
        complexityAdjustment = -0.1; // Lower threshold for complex queries
        break;
    }

    // Adjust based on confidence
    const confidenceAdjustment = (confidence - 0.7) * 0.1; // ±0.02 max adjustment

    // Calculate final threshold
    const adjustedThreshold = baseThreshold + complexityAdjustment + confidenceAdjustment;

    // Ensure threshold is within valid range [0.1, 1.0]
    return Math.max(0.1, Math.min(1.0, adjustedThreshold));
  }

  /**
   * Generate progressive fallback thresholds
   */
  private static generateFallbackThresholds(initialThreshold: number): number[] {
    const fallbacks: number[] = [];
    let currentThreshold = initialThreshold;

    // Generate up to 4 fallback levels
    for (let i = 0; i < 4; i++) {
      currentThreshold = Math.max(
        this.thresholdConfig.fallback,
        currentThreshold - 0.15
      );

      if (currentThreshold < initialThreshold) {
        fallbacks.push(Math.round(currentThreshold * 100) / 100);
      }

      if (currentThreshold <= this.thresholdConfig.fallback) {
        break;
      }
    }

    return fallbacks;
  }

  /**
   * Determine optimal threshold with fallback logic
   */
  static determineOptimalThreshold(
    params: AdaptiveSearchParams,
    currentResultCount = 0,
    attemptCount = 1
  ): AdaptiveSearchResult {
    const queryAnalysis = this.analyzeQuery(params.query);
    const minimumResults = params.minimumResults || 5;
    const maxAttempts = params.maxFallbackAttempts || 3;

    let threshold = params.baseThreshold || queryAnalysis.suggestedThreshold;
    let fallbackUsed = false;
    let recommendation = 'Use suggested threshold for optimal relevance';

    // Apply fallback logic if enabled and we don't have enough results
    if (params.enableFallback &&
        currentResultCount < minimumResults &&
        attemptCount <= maxAttempts &&
        queryAnalysis.fallbackThresholds.length > 0) {

      const fallbackIndex = Math.min(attemptCount - 1, queryAnalysis.fallbackThresholds.length - 1);
      threshold = queryAnalysis.fallbackThresholds[fallbackIndex];
      fallbackUsed = true;

      recommendation = `Using fallback threshold #${attemptCount} to improve recall`;
    }

    // Special handling for no results scenario
    if (currentResultCount === 0 && attemptCount > 1) {
      recommendation = 'Consider query refinement or content expansion';
    }

    return {
      threshold,
      queryAnalysis,
      fallbackUsed,
      attemptCount,
      recommendation
    };
  }

  /**
   * Get query type classification for analytics
   */
  static classifyQuery(query: string): {
    type: string;
    characteristics: string[];
    confidence: number;
  } {
    const analysis = this.analyzeQuery(query);

    const characteristics: string[] = [];

    if (analysis.hasSpecialChars) characteristics.push('special_chars');
    if (analysis.hasTechnicalTerms) characteristics.push('technical');
    if (analysis.hasCosmeticTerms) characteristics.push('cosmetic');
    if (analysis.hasNumbers) characteristics.push('numeric');
    if (analysis.wordCount === 1) characteristics.push('single_word');
    if (analysis.wordCount > 5) characteristics.push('long_query');

    characteristics.push(analysis.complexity);

    return {
      type: analysis.type,
      characteristics,
      confidence: analysis.confidence
    };
  }

  /**
   * Validate and sanitize threshold value
   */
  static validateThreshold(threshold: number): number {
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      return this.thresholdConfig.multiWord; // Default fallback
    }

    return Math.max(0.1, Math.min(1.0, threshold));
  }

  /**
   * Get threshold recommendations for different scenarios
   */
  static getThresholdRecommendations(): {
    scenarios: Array<{
      scenario: string;
      description: string;
      recommendedThreshold: number;
      examples: string[];
    }>;
    config: AdaptiveThresholdConfig;
  } {
    return {
      scenarios: [
        {
          scenario: 'Exact Product Lookup',
          description: 'Searching for specific product codes or INCI names',
          recommendedThreshold: this.thresholdConfig.specific,
          examples: ['"CI-77891"', 'Aqua (Water)', 'CAS 1309-37-1']
        },
        {
          scenario: 'Technical Documentation',
          description: 'Searching for technical terms and processes',
          recommendedThreshold: this.thresholdConfig.technical,
          examples: ['API integration', 'vector search optimization', 'database indexing']
        },
        {
          scenario: 'Cosmetic Ingredients',
          description: 'Searching for cosmetic formulation information',
          recommendedThreshold: this.thresholdConfig.cosmetic,
          examples: ['preservative systems', 'emulsifier properties', 'skin compatibility']
        },
        {
          scenario: 'Broad Concepts',
          description: 'Single word or general topic searches',
          recommendedThreshold: this.thresholdConfig.singleWord,
          examples: ['safety', 'formulation', 'testing', 'compliance']
        },
        {
          scenario: 'Phrase Searches',
          description: 'Multi-word descriptive queries',
          recommendedThreshold: this.thresholdConfig.multiWord,
          examples: ['product safety assessment', 'regulatory compliance requirements']
        }
      ],
      config: this.thresholdConfig
    };
  }

  /**
   * Main adaptive search method that integrates with KnowledgeBaseService
   */
  static async adaptiveSearch(params: {
    query: string;
    limit?: number;
    baseThreshold?: number;
    enableFallback?: boolean;
    maxFallbackAttempts?: number;
    minimumResults?: number;
    filters?: Record<string, any>;
    includeContent?: boolean;
    cacheResults?: boolean;
  }): Promise<AdaptiveSearchResponse> {
    // Import KnowledgeBaseService dynamically to avoid circular dependencies
    const { KnowledgeBaseService } = await import('./knowledge-base');

    const {
      query,
      limit = 10,
      baseThreshold,
      enableFallback = true,
      maxFallbackAttempts = 3,
      minimumResults = 5,
      filters = {},
      includeContent = true,
      cacheResults = true
    } = params;

    let attemptCount = 1;
    let lastSearchResult;
    let queryAnalysis: QueryAnalysis;
    let fallbackUsed = false;
    let searchMethod = 'adaptive';

    // Initial threshold determination
    const adaptiveParams: AdaptiveSearchParams = {
      query,
      baseThreshold,
      enableFallback,
      maxFallbackAttempts,
      minimumResults
    };

    // Perform initial search attempt
    const thresholdResult = this.determineOptimalThreshold(adaptiveParams, 0, attemptCount);
    queryAnalysis = thresholdResult.queryAnalysis;

    let searchParams = {
      query,
      limit,
      threshold: thresholdResult.threshold,
      filters,
      includeContent,
      cacheResults
    };

    try {
      lastSearchResult = await KnowledgeBaseService.vectorSearch(searchParams);
      const resultCount = lastSearchResult.results?.length || 0;

      // Apply fallback logic if enabled and results are insufficient
      while (enableFallback &&
             resultCount < minimumResults &&
             attemptCount < maxFallbackAttempts &&
             thresholdResult.queryAnalysis.fallbackThresholds.length > 0) {

        attemptCount++;
        fallbackUsed = true;
        searchMethod = 'adaptive_fallback';

        // Get next fallback threshold
        const nextThresholdResult = this.determineOptimalThreshold(
          adaptiveParams,
          resultCount,
          attemptCount
        );

        // Perform fallback search
        searchParams.threshold = nextThresholdResult.threshold;
        const fallbackResult = await KnowledgeBaseService.vectorSearch(searchParams);

        // Use fallback result if it has more results
        if ((fallbackResult.results?.length || 0) > resultCount) {
          lastSearchResult = fallbackResult;
          break;
        }
      }

      return {
        results: lastSearchResult.results || [],
        searchMethod,
        thresholdUsed: searchParams.threshold,
        cached: lastSearchResult.cached || false,
        queryAnalysis,
        fallbackUsed,
        attemptCount
      };

    } catch (error) {
      console.error('Adaptive search failed:', error);

      // Return empty results with error information
      return {
        results: [],
        searchMethod: 'adaptive_error',
        thresholdUsed: searchParams.threshold,
        cached: false,
        queryAnalysis,
        fallbackUsed,
        attemptCount
      };
    }
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const adaptiveSearchParamsSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query too long'),
  baseThreshold: z.number().min(0).max(1).optional(),
  enableFallback: z.boolean().optional().default(true),
  maxFallbackAttempts: z.number().int().min(1).max(5).optional().default(3),
  minimumResults: z.number().int().min(1).max(50).optional().default(5)
}).strict();

export const thresholdConfigSchema = z.object({
  singleWord: z.number().min(0.1).max(1.0),
  multiWord: z.number().min(0.1).max(1.0),
  specific: z.number().min(0.1).max(1.0),
  technical: z.number().min(0.1).max(1.0),
  cosmetic: z.number().min(0.1).max(1.0),
  fallback: z.number().min(0.1).max(1.0)
}).strict();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function validateAdaptiveSearchParams(data: unknown): AdaptiveSearchParams {
  return adaptiveSearchParamsSchema.parse(data);
}

export function validateThresholdConfig(data: unknown): AdaptiveThresholdConfig {
  return thresholdConfigSchema.parse(data);
}