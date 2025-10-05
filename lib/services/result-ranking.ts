/**
 * Intelligent Result Re-ranking Service
 *
 * Phase 2: Search Algorithm Enhancement
 * Implements advanced result re-ranking based on multiple relevance factors
 */

import { z } from 'zod';
import type { VectorSearchResult } from '@/lib/validation/knowledge-base';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface RankingFactors {
  // Similarity-based factors
  semanticSimilarity: number;          // Vector similarity score (0-1)
  keywordMatch: number;                // Exact keyword match score (0-1)
  titleMatch: number;                  // Title/filename relevance (0-1)

  // Content quality factors
  contentLength: number;               // Content completeness (0-1)
  structuralQuality: number;           // Document structure quality (0-1)
  informationDensity: number;          // Information per word ratio (0-1)

  // Domain-specific factors
  cosmeticRelevance: number;           // Cosmetic/INCI term density (0-1)
  technicalDepth: number;              // Technical detail level (0-1)
  regulatoryImportance: number;        // Safety/regulatory relevance (0-1)

  // Temporal and contextual factors
  recency: number;                     // Document freshness (0-1)
  accessFrequency: number;             // How often accessed (0-1)
  userPreference: number;              // User-specific relevance (0-1)

  // Diversity factors
  topicDiversity: number;              // Topic uniqueness (0-1)
  supplierDiversity: number;           // Source diversity (0-1)
  categoryDiversity: number;           // Category representation (0-1)
}

export interface RankingWeights {
  // Primary relevance (40% total)
  semanticSimilarity: number;          // 25% - Core similarity
  keywordMatch: number;                // 10% - Exact matches
  titleMatch: number;                  // 5% - Title relevance

  // Content quality (25% total)
  contentLength: number;               // 8% - Completeness
  structuralQuality: number;           // 8% - Structure
  informationDensity: number;          // 9% - Information density

  // Domain relevance (20% total)
  cosmeticRelevance: number;           // 10% - Domain specificity
  technicalDepth: number;              // 5% - Technical detail
  regulatoryImportance: number;        // 5% - Safety relevance

  // Context and freshness (10% total)
  recency: number;                     // 4% - Document age
  accessFrequency: number;             // 3% - Usage patterns
  userPreference: number;              // 3% - Personalization

  // Diversity bonus (5% total)
  topicDiversity: number;              // 2% - Topic variety
  supplierDiversity: number;           // 2% - Source variety
  categoryDiversity: number;           // 1% - Category variety
}

export interface RankingConfig {
  weights: RankingWeights;
  boostFactors: {
    exactMatchBoost: number;           // Boost for exact query matches
    titleMatchBoost: number;           // Boost for title matches
    recentDocumentBoost: number;       // Boost for recent documents
    highQualityBoost: number;          // Boost for high-quality content
    diversityPenalty: number;          // Penalty for duplicate topics
  };
  penaltyFactors: {
    lowQualityPenalty: number;         // Penalty for poor content
    duplicateContentPenalty: number;   // Penalty for similar content
    outdatedContentPenalty: number;    // Penalty for old content
    shortContentPenalty: number;       // Penalty for brief content
  };
  diversitySettings: {
    maxSimilarResults: number;         // Max results from same topic
    categoryDistribution: number;      // Desired category spread
    supplierDistribution: number;      // Desired supplier spread
  };
}

export interface RankedResult extends VectorSearchResult {
  rankingScore: number;                // Final ranking score (0-1)
  rankingFactors: RankingFactors;      // Individual factor scores
  rankingExplanation: string[];        // Explanation of ranking factors
  originalRank: number;                // Original position in results
  newRank: number;                     // New position after re-ranking
  rankChange: number;                  // Position change (+/-)
}

export interface RankingAnalysis {
  totalResults: number;
  rerankedResults: number;
  averageScoreImprovement: number;
  topFactors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
  diversityMetrics: {
    topicSpread: number;
    supplierSpread: number;
    categorySpread: number;
  };
  qualityMetrics: {
    averageContentQuality: number;
    averageRelevance: number;
    averageRecency: number;
  };
}

// =============================================================================
// CONFIGURATION AND CONSTANTS
// =============================================================================

const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  // Primary relevance (40%)
  semanticSimilarity: 0.25,
  keywordMatch: 0.10,
  titleMatch: 0.05,

  // Content quality (25%)
  contentLength: 0.08,
  structuralQuality: 0.08,
  informationDensity: 0.09,

  // Domain relevance (20%)
  cosmeticRelevance: 0.10,
  technicalDepth: 0.05,
  regulatoryImportance: 0.05,

  // Context and freshness (10%)
  recency: 0.04,
  accessFrequency: 0.03,
  userPreference: 0.03,

  // Diversity bonus (5%)
  topicDiversity: 0.02,
  supplierDiversity: 0.02,
  categoryDiversity: 0.01
};

const DEFAULT_RANKING_CONFIG: RankingConfig = {
  weights: DEFAULT_RANKING_WEIGHTS,
  boostFactors: {
    exactMatchBoost: 1.2,              // 20% boost for exact matches
    titleMatchBoost: 1.15,             // 15% boost for title matches
    recentDocumentBoost: 1.1,          // 10% boost for recent docs
    highQualityBoost: 1.25,            // 25% boost for high quality
    diversityPenalty: 0.9              // 10% penalty for low diversity
  },
  penaltyFactors: {
    lowQualityPenalty: 0.8,            // 20% penalty for low quality
    duplicateContentPenalty: 0.85,     // 15% penalty for duplicates
    outdatedContentPenalty: 0.9,       // 10% penalty for old content
    shortContentPenalty: 0.95          // 5% penalty for short content
  },
  diversitySettings: {
    maxSimilarResults: 3,              // Max 3 results from same topic
    categoryDistribution: 0.7,         // Target 70% category diversity
    supplierDistribution: 0.6          // Target 60% supplier diversity
  }
};

// Cosmetic and INCI specific terms for relevance scoring
const COSMETIC_KEYWORDS = new Set([
  'inci', 'cosmetic', 'ingredient', 'formulation', 'safety', 'regulatory',
  'compliance', 'product', 'chemical', 'concentration', 'dermatology',
  'skincare', 'toxicology', 'allergen', 'preservative', 'emulsifier',
  'surfactant', 'moisturizer', 'sunscreen', 'fragrance', 'colorant',
  'ph', 'stability', 'compatibility', 'efficacy', 'testing', 'aqua',
  'glycerin', 'alcohol', 'paraben', 'sulfate', 'silicone', 'peptide',
  'vitamin', 'antioxidant', 'retinol', 'niacinamide', 'hyaluronic',
  'ceramide', 'collagen', 'elastin', 'keratin'
]);

const TECHNICAL_KEYWORDS = new Set([
  'api', 'database', 'query', 'search', 'vector', 'embedding', 'similarity',
  'threshold', 'optimization', 'performance', 'analytics', 'processing',
  'automation', 'integration', 'configuration', 'validation', 'algorithm',
  'machine learning', 'artificial intelligence', 'data', 'analysis'
]);

const REGULATORY_KEYWORDS = new Set([
  'safety', 'regulatory', 'compliance', 'fda', 'eu', 'reach', 'gmp',
  'iso', 'standard', 'guideline', 'requirement', 'approval', 'testing',
  'validation', 'certification', 'audit', 'documentation', 'risk',
  'assessment', 'hazard', 'toxicity', 'allergen', 'sensitization'
]);

// =============================================================================
// INTELLIGENT RESULT RANKING SERVICE
// =============================================================================

export class ResultRankingService {
  private static config: RankingConfig = DEFAULT_RANKING_CONFIG;

  /**
   * Update ranking configuration
   */
  static updateConfig(newConfig: Partial<RankingConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      weights: {
        ...this.config.weights,
        ...newConfig.weights
      },
      boostFactors: {
        ...this.config.boostFactors,
        ...newConfig.boostFactors
      },
      penaltyFactors: {
        ...this.config.penaltyFactors,
        ...newConfig.penaltyFactors
      },
      diversitySettings: {
        ...this.config.diversitySettings,
        ...newConfig.diversitySettings
      }
    };
  }

  /**
   * Get current ranking configuration
   */
  static getConfig(): RankingConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Main re-ranking function
   */
  static async rerankResults(
    results: VectorSearchResult[],
    originalQuery: string,
    options: {
      maxResults?: number;
      enableDiversification?: boolean;
      userContext?: {
        preferences?: Record<string, number>;
        searchHistory?: string[];
        accessPatterns?: Record<string, number>;
      };
      debugMode?: boolean;
    } = {}
  ): Promise<{
    rankedResults: RankedResult[];
    analysis: RankingAnalysis;
  }> {
    const startTime = Date.now();
    const { maxResults = results.length, enableDiversification = true, userContext, debugMode = false } = options;

    if (results.length === 0) {
      return {
        rankedResults: [],
        analysis: this.createEmptyAnalysis()
      };
    }

    try {
      // Step 1: Calculate ranking factors for each result
      const resultsWithFactors = await Promise.all(
        results.map(async (result, index) => {
          const factors = await this.calculateRankingFactors(result, originalQuery, userContext);
          const score = this.calculateCompositeScore(factors);

          return {
            ...result,
            rankingScore: score,
            rankingFactors: factors,
            rankingExplanation: this.generateRankingExplanation(factors, score),
            originalRank: index + 1,
            newRank: 0, // Will be set after sorting
            rankChange: 0 // Will be set after sorting
          } as RankedResult;
        })
      );

      // Step 2: Sort by ranking score
      resultsWithFactors.sort((a, b) => b.rankingScore - a.rankingScore);

      // Step 3: Apply diversity filtering if enabled
      let diversifiedResults = resultsWithFactors;
      if (enableDiversification) {
        diversifiedResults = this.applyDiversityFiltering(resultsWithFactors, originalQuery);
      }

      // Step 4: Update ranks and calculate changes
      const finalResults = diversifiedResults.slice(0, maxResults).map((result, index) => {
        const newRank = index + 1;
        return {
          ...result,
          newRank,
          rankChange: result.originalRank - newRank
        };
      });

      // Step 5: Generate analysis
      const analysis = this.generateRankingAnalysis(finalResults, results, originalQuery);

      if (debugMode) {
        console.log('=== Result Re-ranking Debug Info ===');
        console.log('Original Results:', results.length);
        console.log('Re-ranked Results:', finalResults.length);
        console.log('Processing Time:', Date.now() - startTime + 'ms');
        console.log('Top 3 Ranking Factors:', analysis.topFactors.slice(0, 3));
        console.log('Diversity Metrics:', analysis.diversityMetrics);
        console.log('Quality Improvement:', analysis.averageScoreImprovement);
        console.log('=== End Re-ranking Debug Info ===');
      }

      return {
        rankedResults: finalResults,
        analysis
      };

    } catch (error) {
      console.error('Result re-ranking error:', error);

      // Fallback: return original results with minimal ranking data
      return {
        rankedResults: results.map((result, index) => ({
          ...result,
          rankingScore: result.similarity,
          rankingFactors: this.createFallbackFactors(result),
          rankingExplanation: ['Ranking failed, using original similarity score'],
          originalRank: index + 1,
          newRank: index + 1,
          rankChange: 0
        })),
        analysis: this.createEmptyAnalysis()
      };
    }
  }

  /**
   * Calculate comprehensive ranking factors for a result
   */
  private static async calculateRankingFactors(
    result: VectorSearchResult,
    query: string,
    userContext?: any
  ): Promise<RankingFactors> {
    const content = result.content.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);

    // Similarity-based factors
    const semanticSimilarity = result.similarity; // Already provided
    const keywordMatch = this.calculateKeywordMatch(content, queryWords);
    const titleMatch = this.calculateTitleMatch(result, queryWords);

    // Content quality factors
    const contentLength = this.calculateContentLength(result.content);
    const structuralQuality = this.calculateStructuralQuality(result.content);
    const informationDensity = this.calculateInformationDensity(result.content);

    // Domain-specific factors
    const cosmeticRelevance = this.calculateCosmeticRelevance(content);
    const technicalDepth = this.calculateTechnicalDepth(content);
    const regulatoryImportance = this.calculateRegulatoryImportance(content);

    // Temporal and contextual factors
    const recency = this.calculateRecency(result);
    const accessFrequency = this.calculateAccessFrequency(result, userContext);
    const userPreference = this.calculateUserPreference(result, userContext);

    // Diversity factors (calculated later in context of all results)
    const topicDiversity = 1.0; // Default, calculated in diversity filtering
    const supplierDiversity = 1.0; // Default, calculated in diversity filtering
    const categoryDiversity = 1.0; // Default, calculated in diversity filtering

    return {
      semanticSimilarity,
      keywordMatch,
      titleMatch,
      contentLength,
      structuralQuality,
      informationDensity,
      cosmeticRelevance,
      technicalDepth,
      regulatoryImportance,
      recency,
      accessFrequency,
      userPreference,
      topicDiversity,
      supplierDiversity,
      categoryDiversity
    };
  }

  /**
   * Calculate keyword match score
   */
  private static calculateKeywordMatch(content: string, queryWords: string[]): number {
    if (queryWords.length === 0) return 0;

    let totalMatches = 0;
    let exactMatches = 0;

    for (const word of queryWords) {
      if (content.includes(word)) {
        totalMatches++;

        // Check for exact word boundaries
        const wordRegex = new RegExp(`\\b${word}\\b`, 'gi');
        if (wordRegex.test(content)) {
          exactMatches++;
        }
      }
    }

    const matchRatio = totalMatches / queryWords.length;
    const exactRatio = exactMatches / queryWords.length;

    // Weight exact matches more heavily
    return Math.min(1.0, (matchRatio * 0.6) + (exactRatio * 0.4));
  }

  /**
   * Calculate title/filename match score
   */
  private static calculateTitleMatch(result: VectorSearchResult, queryWords: string[]): number {
    const title = (result.metadata.documentName || '').toLowerCase();
    if (!title || queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (title.includes(word)) {
        matches++;
      }
    }

    return Math.min(1.0, matches / queryWords.length);
  }

  /**
   * Calculate content length score (completeness indicator)
   */
  private static calculateContentLength(content: string): number {
    const length = content.length;

    // Optimal length range: 200-2000 characters
    if (length < 50) return 0.2;
    if (length < 200) return 0.5;
    if (length <= 2000) return 1.0;
    if (length <= 5000) return 0.8;
    return 0.6; // Very long content might be less focused
  }

  /**
   * Calculate structural quality score
   */
  private static calculateStructuralQuality(content: string): number {
    let score = 0.5; // Base score

    // Check for structural indicators
    if (/\n\s*\n/.test(content)) score += 0.1; // Paragraphs
    if (/^\s*[-•*]\s/m.test(content)) score += 0.1; // Lists
    if (/\d+\.\s/.test(content)) score += 0.1; // Numbered lists
    if (/[.!?]\s*$/.test(content.trim())) score += 0.1; // Proper endings
    if (/^[A-Z]/.test(content.trim())) score += 0.1; // Proper capitalization
    if (content.includes(':')) score += 0.1; // Definitions/explanations

    return Math.min(1.0, score);
  }

  /**
   * Calculate information density score
   */
  private static calculateInformationDensity(content: string): number {
    const words = content.split(/\s+/).filter(word => word.length > 2);
    const uniqueWords = new Set(words.map(word => word.toLowerCase()));

    if (words.length === 0) return 0;

    // Information indicators
    const numbers = (content.match(/\d+/g) || []).length;
    const technicalTerms = words.filter(word =>
      word.length > 6 && /[A-Z]/.test(word)
    ).length;
    const punctuationVariety = new Set(content.match(/[.!?;:,]/g) || []).size;

    // Calculate density metrics
    const uniqueRatio = uniqueWords.size / words.length;
    const numericalDensity = Math.min(0.3, numbers / words.length);
    const technicalDensity = Math.min(0.2, technicalTerms / words.length);
    const structuralComplexity = Math.min(0.2, punctuationVariety / 10);

    return Math.min(1.0, uniqueRatio + numericalDensity + technicalDensity + structuralComplexity);
  }

  /**
   * Calculate cosmetic/INCI relevance score
   */
  private static calculateCosmeticRelevance(content: string): number {
    const words = content.toLowerCase().split(/\s+/);
    let matches = 0;

    for (const word of words) {
      if (COSMETIC_KEYWORDS.has(word)) {
        matches++;
      }
    }

    // Also check for INCI patterns
    const inciPatterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Capitalized compound names
      /\bCI[-\s]*\d+\b/gi,            // Color Index numbers
      /\b\d{3,}-\d{2,}-\d+\b/g        // CAS numbers
    ];

    for (const pattern of inciPatterns) {
      const patternMatches = (content.match(pattern) || []).length;
      matches += patternMatches * 2; // Weight INCI patterns more heavily
    }

    return Math.min(1.0, matches / Math.max(20, words.length * 0.1));
  }

  /**
   * Calculate technical depth score
   */
  private static calculateTechnicalDepth(content: string): number {
    const words = content.toLowerCase().split(/\s+/);
    let technicalScore = 0;

    // Technical keywords
    for (const word of words) {
      if (TECHNICAL_KEYWORDS.has(word)) {
        technicalScore++;
      }
    }

    // Technical patterns
    const technicalPatterns = [
      /\d+\.?\d*\s*(mg|ml|g|kg|%|ppm|mol|pH)/gi, // Measurements
      /\b[A-Z]{2,}\b/g,                          // Acronyms
      /\b\w+[-_]\w+\b/g,                         // Technical naming
      /\d+\.\d+/g                                // Decimal numbers
    ];

    for (const pattern of technicalPatterns) {
      technicalScore += (content.match(pattern) || []).length * 0.5;
    }

    return Math.min(1.0, technicalScore / Math.max(10, words.length * 0.05));
  }

  /**
   * Calculate regulatory importance score
   */
  private static calculateRegulatoryImportance(content: string): number {
    const words = content.toLowerCase().split(/\s+/);
    let regulatoryScore = 0;

    for (const word of words) {
      if (REGULATORY_KEYWORDS.has(word)) {
        regulatoryScore++;
      }
    }

    return Math.min(1.0, regulatoryScore / Math.max(5, words.length * 0.02));
  }

  /**
   * Calculate document recency score
   */
  private static calculateRecency(result: VectorSearchResult): number {
    // This would typically use document creation/modification date
    // For now, return a default score since we don't have access to dates
    return 0.7; // Default moderate recency
  }

  /**
   * Calculate access frequency score
   */
  private static calculateAccessFrequency(result: VectorSearchResult, userContext?: any): number {
    if (!userContext?.accessPatterns) return 0.5;

    const docId = result.documentId;
    const frequency = userContext.accessPatterns[docId] || 0;

    // Normalize frequency to 0-1 scale
    return Math.min(1.0, frequency / 10);
  }

  /**
   * Calculate user preference score
   */
  private static calculateUserPreference(result: VectorSearchResult, userContext?: any): number {
    if (!userContext?.preferences) return 0.5;

    let preferenceScore = 0.5;

    // Check category preferences
    const category = result.metadata.category;
    if (category && userContext.preferences[category]) {
      preferenceScore = Math.max(preferenceScore, userContext.preferences[category]);
    }

    // Check supplier preferences
    const supplier = result.metadata.supplier;
    if (supplier && userContext.preferences[supplier]) {
      preferenceScore = Math.max(preferenceScore, userContext.preferences[supplier]);
    }

    return Math.min(1.0, preferenceScore);
  }

  /**
   * Calculate composite ranking score
   */
  private static calculateCompositeScore(factors: RankingFactors): number {
    const weights = this.config.weights;
    let score = 0;

    // Calculate weighted sum
    score += factors.semanticSimilarity * weights.semanticSimilarity;
    score += factors.keywordMatch * weights.keywordMatch;
    score += factors.titleMatch * weights.titleMatch;
    score += factors.contentLength * weights.contentLength;
    score += factors.structuralQuality * weights.structuralQuality;
    score += factors.informationDensity * weights.informationDensity;
    score += factors.cosmeticRelevance * weights.cosmeticRelevance;
    score += factors.technicalDepth * weights.technicalDepth;
    score += factors.regulatoryImportance * weights.regulatoryImportance;
    score += factors.recency * weights.recency;
    score += factors.accessFrequency * weights.accessFrequency;
    score += factors.userPreference * weights.userPreference;
    score += factors.topicDiversity * weights.topicDiversity;
    score += factors.supplierDiversity * weights.supplierDiversity;
    score += factors.categoryDiversity * weights.categoryDiversity;

    // Apply boost factors
    if (factors.keywordMatch > 0.8) {
      score *= this.config.boostFactors.exactMatchBoost;
    }
    if (factors.titleMatch > 0.7) {
      score *= this.config.boostFactors.titleMatchBoost;
    }
    if (factors.recency > 0.9) {
      score *= this.config.boostFactors.recentDocumentBoost;
    }
    if (factors.structuralQuality > 0.8 && factors.informationDensity > 0.7) {
      score *= this.config.boostFactors.highQualityBoost;
    }

    // Apply penalty factors
    if (factors.structuralQuality < 0.3 || factors.informationDensity < 0.2) {
      score *= this.config.penaltyFactors.lowQualityPenalty;
    }
    if (factors.contentLength < 0.3) {
      score *= this.config.penaltyFactors.shortContentPenalty;
    }
    if (factors.recency < 0.2) {
      score *= this.config.penaltyFactors.outdatedContentPenalty;
    }

    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Apply diversity filtering to reduce similar results
   */
  private static applyDiversityFiltering(results: RankedResult[], query: string): RankedResult[] {
    const diversified: RankedResult[] = [];
    const topicsSeen = new Set<string>();
    const suppliersSeen = new Set<string>();
    const categoriesSeen = new Set<string>();

    for (const result of results) {
      let includeResult = true;

      // Check topic diversity (simplified - would need more sophisticated topic modeling)
      const topic = this.extractTopic(result.content);
      if (topicsSeen.has(topic)) {
        const similarCount = Array.from(topicsSeen).filter(t => t === topic).length;
        if (similarCount >= this.config.diversitySettings.maxSimilarResults) {
          result.rankingScore *= this.config.boostFactors.diversityPenalty;
        }
      }
      topicsSeen.add(topic);

      // Check supplier diversity
      const supplier = result.metadata.supplier;
      if (supplier) {
        suppliersSeen.add(supplier);
      }

      // Check category diversity
      const category = result.metadata.category;
      if (category) {
        categoriesSeen.add(category);
      }

      diversified.push(result);
    }

    // Re-sort after diversity penalties
    diversified.sort((a, b) => b.rankingScore - a.rankingScore);
    return diversified;
  }

  /**
   * Extract topic from content (simplified implementation)
   */
  private static extractTopic(content: string): string {
    const words = content.toLowerCase().split(/\s+/);

    // Find the most relevant cosmetic keyword
    for (const word of words) {
      if (COSMETIC_KEYWORDS.has(word)) {
        return word;
      }
    }

    // Fallback to first significant word
    const significantWords = words.filter(word => word.length > 4);
    return significantWords[0] || 'general';
  }

  /**
   * Generate ranking explanation
   */
  private static generateRankingExplanation(factors: RankingFactors, score: number): string[] {
    const explanations: string[] = [];
    const weights = this.config.weights;

    // Identify top contributing factors
    const factorContributions = [
      { name: 'Semantic Similarity', value: factors.semanticSimilarity * weights.semanticSimilarity, weight: weights.semanticSimilarity },
      { name: 'Keyword Match', value: factors.keywordMatch * weights.keywordMatch, weight: weights.keywordMatch },
      { name: 'Content Quality', value: (factors.structuralQuality + factors.informationDensity) * 0.5 * (weights.structuralQuality + weights.informationDensity), weight: weights.structuralQuality + weights.informationDensity },
      { name: 'Domain Relevance', value: factors.cosmeticRelevance * weights.cosmeticRelevance, weight: weights.cosmeticRelevance },
      { name: 'Technical Depth', value: factors.technicalDepth * weights.technicalDepth, weight: weights.technicalDepth }
    ].sort((a, b) => b.value - a.value);

    explanations.push(`Overall Score: ${(score * 100).toFixed(1)}%`);

    for (let i = 0; i < Math.min(3, factorContributions.length); i++) {
      const factor = factorContributions[i];
      if (factor.value > 0.05) { // Only include significant factors
        explanations.push(`${factor.name}: ${(factor.value * 100).toFixed(1)}% contribution`);
      }
    }

    // Add specific boosts or penalties
    if (factors.keywordMatch > 0.8) {
      explanations.push('Exact match boost applied');
    }
    if (factors.structuralQuality < 0.3) {
      explanations.push('Low quality penalty applied');
    }

    return explanations;
  }

  /**
   * Generate comprehensive ranking analysis
   */
  private static generateRankingAnalysis(
    rankedResults: RankedResult[],
    originalResults: VectorSearchResult[],
    query: string
  ): RankingAnalysis {
    if (rankedResults.length === 0) {
      return this.createEmptyAnalysis();
    }

    // Calculate score improvements
    const originalScores = originalResults.map(r => r.similarity);
    const newScores = rankedResults.map(r => r.rankingScore);
    const avgOriginal = originalScores.reduce((a, b) => a + b, 0) / originalScores.length;
    const avgNew = newScores.reduce((a, b) => a + b, 0) / newScores.length;

    // Identify top contributing factors
    const factorTotals: Record<string, number> = {};
    rankedResults.forEach(result => {
      Object.entries(result.rankingFactors).forEach(([factor, value]) => {
        factorTotals[factor] = (factorTotals[factor] || 0) + value;
      });
    });

    const topFactors = Object.entries(factorTotals)
      .map(([factor, total]) => ({
        factor,
        impact: total / rankedResults.length,
        description: this.getFactorDescription(factor)
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);

    // Calculate diversity metrics
    const categories = new Set(rankedResults.map(r => r.metadata.category).filter(Boolean));
    const suppliers = new Set(rankedResults.map(r => r.metadata.supplier).filter(Boolean));
    const topics = new Set(rankedResults.map(r => this.extractTopic(r.content)));

    return {
      totalResults: originalResults.length,
      rerankedResults: rankedResults.length,
      averageScoreImprovement: avgNew - avgOriginal,
      topFactors,
      diversityMetrics: {
        topicSpread: topics.size / Math.max(1, rankedResults.length),
        supplierSpread: suppliers.size / Math.max(1, rankedResults.length),
        categorySpread: categories.size / Math.max(1, rankedResults.length)
      },
      qualityMetrics: {
        averageContentQuality: rankedResults.reduce((sum, r) =>
          sum + (r.rankingFactors.structuralQuality + r.rankingFactors.informationDensity) / 2, 0
        ) / rankedResults.length,
        averageRelevance: rankedResults.reduce((sum, r) =>
          sum + (r.rankingFactors.semanticSimilarity + r.rankingFactors.keywordMatch) / 2, 0
        ) / rankedResults.length,
        averageRecency: rankedResults.reduce((sum, r) => sum + r.rankingFactors.recency, 0) / rankedResults.length
      }
    };
  }

  /**
   * Get human-readable description for ranking factors
   */
  private static getFactorDescription(factor: string): string {
    const descriptions: Record<string, string> = {
      semanticSimilarity: 'Vector similarity to query',
      keywordMatch: 'Exact keyword matches found',
      titleMatch: 'Relevance to document title',
      contentLength: 'Content completeness',
      structuralQuality: 'Document structure and formatting',
      informationDensity: 'Information richness',
      cosmeticRelevance: 'Cosmetic/INCI domain relevance',
      technicalDepth: 'Technical detail level',
      regulatoryImportance: 'Safety and regulatory relevance',
      recency: 'Document freshness',
      accessFrequency: 'Historical access patterns',
      userPreference: 'User-specific preferences',
      topicDiversity: 'Topic uniqueness',
      supplierDiversity: 'Source diversity',
      categoryDiversity: 'Category representation'
    };

    return descriptions[factor] || factor;
  }

  /**
   * Create fallback factors when ranking fails
   */
  private static createFallbackFactors(result: VectorSearchResult): RankingFactors {
    return {
      semanticSimilarity: result.similarity,
      keywordMatch: 0.5,
      titleMatch: 0.5,
      contentLength: 0.5,
      structuralQuality: 0.5,
      informationDensity: 0.5,
      cosmeticRelevance: 0.5,
      technicalDepth: 0.5,
      regulatoryImportance: 0.5,
      recency: 0.5,
      accessFrequency: 0.5,
      userPreference: 0.5,
      topicDiversity: 1.0,
      supplierDiversity: 1.0,
      categoryDiversity: 1.0
    };
  }

  /**
   * Create empty analysis for error cases
   */
  private static createEmptyAnalysis(): RankingAnalysis {
    return {
      totalResults: 0,
      rerankedResults: 0,
      averageScoreImprovement: 0,
      topFactors: [],
      diversityMetrics: {
        topicSpread: 0,
        supplierSpread: 0,
        categorySpread: 0
      },
      qualityMetrics: {
        averageContentQuality: 0,
        averageRelevance: 0,
        averageRecency: 0
      }
    };
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const rankingConfigSchema = z.object({
  weights: z.object({
    semanticSimilarity: z.number().min(0).max(1),
    keywordMatch: z.number().min(0).max(1),
    titleMatch: z.number().min(0).max(1),
    contentLength: z.number().min(0).max(1),
    structuralQuality: z.number().min(0).max(1),
    informationDensity: z.number().min(0).max(1),
    cosmeticRelevance: z.number().min(0).max(1),
    technicalDepth: z.number().min(0).max(1),
    regulatoryImportance: z.number().min(0).max(1),
    recency: z.number().min(0).max(1),
    accessFrequency: z.number().min(0).max(1),
    userPreference: z.number().min(0).max(1),
    topicDiversity: z.number().min(0).max(1),
    supplierDiversity: z.number().min(0).max(1),
    categoryDiversity: z.number().min(0).max(1)
  }).optional(),
  boostFactors: z.object({
    exactMatchBoost: z.number().min(1).max(2),
    titleMatchBoost: z.number().min(1).max(2),
    recentDocumentBoost: z.number().min(1).max(2),
    highQualityBoost: z.number().min(1).max(2),
    diversityPenalty: z.number().min(0.5).max(1)
  }).optional(),
  penaltyFactors: z.object({
    lowQualityPenalty: z.number().min(0.5).max(1),
    duplicateContentPenalty: z.number().min(0.5).max(1),
    outdatedContentPenalty: z.number().min(0.5).max(1),
    shortContentPenalty: z.number().min(0.5).max(1)
  }).optional(),
  diversitySettings: z.object({
    maxSimilarResults: z.number().int().min(1).max(10),
    categoryDistribution: z.number().min(0.1).max(1),
    supplierDistribution: z.number().min(0.1).max(1)
  }).optional()
}).strict();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function validateRankingConfig(data: unknown): Partial<RankingConfig> {
  return rankingConfigSchema.parse(data);
}

/**
 * Quick re-ranking for simple use cases
 */
export async function quickRerankResults(
  results: VectorSearchResult[],
  query: string,
  maxResults?: number
): Promise<RankedResult[]> {
  const { rankedResults } = await ResultRankingService.rerankResults(results, query, {
    maxResults,
    enableDiversification: true,
    debugMode: false
  });

  return rankedResults;
}