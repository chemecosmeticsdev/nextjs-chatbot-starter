/**
 * Query Enhancement Pipeline
 *
 * Phase 2: Search Algorithm Enhancement
 * Implements query preprocessing, normalization, and enhancement for improved search accuracy
 */

import { z } from 'zod';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface QueryEnhancementConfig {
  enableSynonymExpansion: boolean;
  enableSpellCorrection: boolean;
  enableDomainSpecificTerms: boolean;
  enableStopWordRemoval: boolean;
  enableStemming: boolean;
  maxSynonymsPerTerm: number;
  confidenceThreshold: number;
}

export interface ProcessedQuery {
  original: string;
  normalized: string;
  enhanced: string[];
  synonyms: string[];
  domainTerms: string[];
  corrections: Array<{
    original: string;
    corrected: string;
    confidence: number;
  }>;
  metadata: {
    hasNumbers: boolean;
    hasCodes: boolean;
    hasChemicalNames: boolean;
    hasINCITerms: boolean;
    wordCount: number;
    avgWordLength: number;
    complexity: 'simple' | 'moderate' | 'complex';
  };
  processingTime: number;
}

export interface QueryEnhancementParams {
  query: string;
  config?: Partial<QueryEnhancementConfig>;
  context?: {
    domain?: 'cosmetic' | 'technical' | 'general';
    userPreferences?: Record<string, any>;
    searchHistory?: string[];
  };
}

// =============================================================================
// CONFIGURATION AND CONSTANTS
// =============================================================================

const DEFAULT_CONFIG: QueryEnhancementConfig = {
  enableSynonymExpansion: true,
  enableSpellCorrection: true,
  enableDomainSpecificTerms: true,
  enableStopWordRemoval: false, // Keep false to preserve context
  enableStemming: false, // Keep false to preserve exact matches
  maxSynonymsPerTerm: 3,
  confidenceThreshold: 0.8
};

// Cosmetic and INCI synonym mappings
const COSMETIC_SYNONYMS: Record<string, string[]> = {
  // Common ingredient synonyms
  'water': ['aqua', 'h2o', 'distilled water', 'purified water'],
  'aqua': ['water', 'h2o', 'distilled water', 'purified water'],
  'alcohol': ['ethanol', 'ethyl alcohol', 'sd alcohol'],
  'ethanol': ['alcohol', 'ethyl alcohol', 'sd alcohol'],
  'glycerin': ['glycerol', 'glycerine', 'propane-1,2,3-triol'],
  'glycerol': ['glycerin', 'glycerine', 'propane-1,2,3-triol'],

  // Preservatives
  'paraben': ['methylparaben', 'propylparaben', 'butylparaben', 'ethylparaben'],
  'phenoxyethanol': ['euxyl pe 9010', 'phenoxetol'],
  'benzoic acid': ['sodium benzoate', 'potassium benzoate'],

  // Emulsifiers and surfactants
  'lecithin': ['phosphatidylcholine', 'soy lecithin', 'sunflower lecithin'],
  'sls': ['sodium lauryl sulfate', 'sodium dodecyl sulfate'],
  'sles': ['sodium laureth sulfate', 'sodium lauryl ether sulfate'],

  // Colorants
  'titanium dioxide': ['ci 77891', 'tio2', 'titania'],
  'iron oxide': ['ci 77491', 'ci 77492', 'ci 77499', 'ferric oxide'],
  'zinc oxide': ['ci 77947', 'zno', 'zinc white'],

  // Functional terms
  'moisturizer': ['hydrating', 'hydration', 'moisture', 'humectant'],
  'sunscreen': ['spf', 'uv protection', 'sun protection', 'uv filter'],
  'preservative': ['antimicrobial', 'preservative system', 'microbial protection'],
  'antioxidant': ['free radical scavenger', 'oxidation inhibitor'],
  'emulsifier': ['emulsifying agent', 'surfactant', 'stabilizer'],

  // Testing and safety
  'patch test': ['skin test', 'sensitivity test', 'allergy test'],
  'dermatologically tested': ['dermatologist tested', 'skin tested'],
  'hypoallergenic': ['low allergen', 'reduced allergen', 'allergy tested'],
  'non-comedogenic': ['does not clog pores', 'pore-friendly', 'acne safe']
};

// Technical domain synonyms
const TECHNICAL_SYNONYMS: Record<string, string[]> = {
  'api': ['application programming interface', 'interface', 'endpoint'],
  'database': ['db', 'data store', 'storage', 'repository'],
  'vector': ['embedding', 'feature vector', 'semantic vector'],
  'similarity': ['cosine similarity', 'semantic similarity', 'relevance'],
  'threshold': ['cutoff', 'minimum score', 'similarity threshold'],
  'chunk': ['segment', 'fragment', 'block', 'piece'],
  'embedding': ['vector', 'representation', 'encoding'],
  'indexing': ['indexation', 'search optimization', 'data structuring'],
  'retrieval': ['search', 'lookup', 'query', 'fetch']
};

// Common misspellings and corrections
const COMMON_CORRECTIONS: Record<string, string> = {
  // Cosmetic terms
  'aqua': 'aqua', // Ensure correct
  'gliserin': 'glycerin',
  'glicerol': 'glycerol',
  'phenoxiethanol': 'phenoxyethanol',
  'lecithin': 'lecithin',
  'lecithine': 'lecithin',
  'collagen': 'collagen',
  'kolagen': 'collagen',
  'retinol': 'retinol',
  'retinal': 'retinal',
  'hialuronic': 'hyaluronic',
  'hyaloronic': 'hyaluronic',

  // Technical terms
  'databse': 'database',
  'databace': 'database',
  'algorythm': 'algorithm',
  'algoritm': 'algorithm',
  'embeding': 'embedding',
  'embeddings': 'embedding',
  'similarlity': 'similarity',
  'treshold': 'threshold',
  'retreival': 'retrieval',
  'retireval': 'retrieval'
};

// Stop words (minimal set to preserve context)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
]);

// Chemical name patterns
const CHEMICAL_PATTERNS = [
  /\b\d+[-\s]*\d+[-\s]*\d+\b/,                    // CAS numbers: 123-45-6
  /\b[A-Z]{2,}[-\s]*\d+\b/,                       // Codes: CI-77891
  /\b\w*[-\s]*ol\b/i,                             // Alcohols: ethanol, glycerol
  /\b\w*[-\s]*yl\b/i,                             // Groups: methyl, ethyl
  /\b\w*[-\s]*ate\b/i,                            // Esters: acetate, palmitate
  /\b\w*[-\s]*acid\b/i,                           // Acids: hyaluronic acid
  /\b\w+[-\s]*\(\w+\)\b/,                         // INCI names with alternatives
  /\b[A-Z][a-z]+[-\s]*[A-Z][a-z]+\b/            // Compound names: Titanium Dioxide
];

// INCI name patterns
const INCI_PATTERNS = [
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\b/, // Multi-word INCI names
  /\b[A-Z]{2,}\s*\d+\b/,                             // CI codes
  /\b\w+\s*\([^)]+\)\b/,                             // Names with parentheses
  /\b\d{3,}-\d{2,}-\d+\b/                            // CAS numbers
];

// =============================================================================
// QUERY PROCESSOR SERVICE
// =============================================================================

export class QueryProcessor {
  private static config: QueryEnhancementConfig = DEFAULT_CONFIG;

  /**
   * Update configuration
   */
  static updateConfig(newConfig: Partial<QueryEnhancementConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }

  /**
   * Get current configuration
   */
  static getConfig(): QueryEnhancementConfig {
    return { ...this.config };
  }

  /**
   * Main query enhancement function
   */
  static async enhanceQuery(params: QueryEnhancementParams): Promise<ProcessedQuery> {
    const startTime = performance.now();
    const config = { ...this.config, ...params.config };
    const { query, context } = params;

    // Step 1: Normalize the query
    const normalized = this.normalizeQuery(query);

    // Step 2: Analyze query metadata
    const metadata = this.analyzeQueryMetadata(normalized);

    // Step 3: Apply spell corrections
    let corrected = normalized;
    const corrections: ProcessedQuery['corrections'] = [];

    if (config.enableSpellCorrection) {
      const correctionResult = this.applySpellCorrections(normalized);
      corrected = correctionResult.corrected;
      corrections.push(...correctionResult.corrections);
    }

    // Step 4: Generate synonyms
    const synonyms: string[] = [];
    if (config.enableSynonymExpansion) {
      synonyms.push(...this.generateSynonyms(corrected, config, context?.domain));
    }

    // Step 5: Extract domain-specific terms
    const domainTerms: string[] = [];
    if (config.enableDomainSpecificTerms) {
      domainTerms.push(...this.extractDomainTerms(corrected, context?.domain));
    }

    // Step 6: Generate enhanced query variations
    const enhanced = this.generateEnhancedQueries(
      corrected,
      synonyms,
      domainTerms,
      config
    );

    const processingTime = performance.now() - startTime;

    return {
      original: query,
      normalized,
      enhanced,
      synonyms,
      domainTerms,
      corrections,
      metadata,
      processingTime
    };
  }

  /**
   * Normalize query text
   */
  private static normalizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ')                    // Normalize whitespace
      .replace(/[""'']/g, '"')                 // Normalize quotes
      .replace(/[–—]/g, '-');                  // Normalize dashes
  }

  /**
   * Analyze query characteristics
   */
  private static analyzeQueryMetadata(query: string): ProcessedQuery['metadata'] {
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / wordCount;

    const hasNumbers = /\d/.test(query);
    const hasCodes = /\b[A-Z]{2,}[-\s]*\d+\b/.test(query);
    const hasChemicalNames = CHEMICAL_PATTERNS.some(pattern => pattern.test(query));
    const hasINCITerms = INCI_PATTERNS.some(pattern => pattern.test(query));

    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (wordCount > 5 || hasChemicalNames || hasCodes) {
      complexity = 'complex';
    } else if (wordCount > 2 || hasNumbers || hasINCITerms) {
      complexity = 'moderate';
    }

    return {
      hasNumbers,
      hasCodes,
      hasChemicalNames,
      hasINCITerms,
      wordCount,
      avgWordLength,
      complexity
    };
  }

  /**
   * Apply spell corrections
   */
  private static applySpellCorrections(query: string): {
    corrected: string;
    corrections: ProcessedQuery['corrections'];
  } {
    const corrections: ProcessedQuery['corrections'] = [];
    let corrected = query;

    const words = query.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const cleanWord = word.replace(/[^\w]/g, '');

      if (COMMON_CORRECTIONS[cleanWord]) {
        const correction = COMMON_CORRECTIONS[cleanWord];
        corrections.push({
          original: word,
          corrected: correction,
          confidence: 0.9
        });

        corrected = corrected.replace(
          new RegExp(`\\b${word}\\b`, 'gi'),
          correction
        );
      }
    }

    return { corrected, corrections };
  }

  /**
   * Generate synonyms for query terms
   */
  private static generateSynonyms(
    query: string,
    config: QueryEnhancementConfig,
    domain?: string
  ): string[] {
    const synonyms: Set<string> = new Set();
    const words = query.toLowerCase().split(/\s+/);

    // Choose appropriate synonym dictionary
    const synonymDict = domain === 'technical' ? TECHNICAL_SYNONYMS : COSMETIC_SYNONYMS;

    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '');

      if (synonymDict[cleanWord]) {
        const wordSynonyms = synonymDict[cleanWord];
        wordSynonyms.slice(0, config.maxSynonymsPerTerm).forEach(synonym => {
          synonyms.add(synonym);
        });
      }

      // Also check for partial matches in compound terms
      for (const [term, termSynonyms] of Object.entries(synonymDict)) {
        if (term.includes(cleanWord) || cleanWord.includes(term)) {
          termSynonyms.slice(0, config.maxSynonymsPerTerm).forEach(synonym => {
            synonyms.add(synonym);
          });
        }
      }
    }

    return Array.from(synonyms);
  }

  /**
   * Extract domain-specific terms
   */
  private static extractDomainTerms(query: string, domain?: string): string[] {
    const terms: Set<string> = new Set();

    // Extract chemical patterns
    for (const pattern of CHEMICAL_PATTERNS) {
      const matches = query.match(pattern);
      if (matches) {
        matches.forEach(match => terms.add(match.trim()));
      }
    }

    // Extract INCI patterns
    for (const pattern of INCI_PATTERNS) {
      const matches = query.match(pattern);
      if (matches) {
        matches.forEach(match => terms.add(match.trim()));
      }
    }

    // Extract quoted exact matches
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => {
        terms.add(match.replace(/"/g, '').trim());
      });
    }

    return Array.from(terms);
  }

  /**
   * Generate enhanced query variations
   */
  private static generateEnhancedQueries(
    baseQuery: string,
    synonyms: string[],
    domainTerms: string[],
    config: QueryEnhancementConfig
  ): string[] {
    const enhanced: Set<string> = new Set();

    // Add original query
    enhanced.add(baseQuery);

    // Add synonym-enhanced variations
    if (synonyms.length > 0) {
      // Replace terms with synonyms one at a time
      const words = baseQuery.split(/\s+/);

      for (const synonym of synonyms.slice(0, 3)) { // Limit to top 3 synonyms
        enhanced.add(`${baseQuery} ${synonym}`);

        // Try replacing similar words
        for (let i = 0; i < words.length; i++) {
          const modifiedWords = [...words];
          if (modifiedWords[i].toLowerCase().includes(synonym.toLowerCase().split(' ')[0]) ||
              synonym.toLowerCase().includes(modifiedWords[i].toLowerCase())) {
            modifiedWords[i] = synonym;
            enhanced.add(modifiedWords.join(' '));
          }
        }
      }
    }

    // Add domain-specific term variations
    if (domainTerms.length > 0) {
      for (const term of domainTerms.slice(0, 2)) { // Limit to top 2 domain terms
        enhanced.add(`${baseQuery} ${term}`);
      }
    }

    // Generate broad vs specific variations
    const words = baseQuery.split(/\s+/);
    if (words.length > 1) {
      // More specific: add quotes around key terms
      const keyTerms = words.filter(word => word.length > 3);
      if (keyTerms.length > 0) {
        enhanced.add(`"${keyTerms[0]}" ${baseQuery}`);
      }

      // Broader: use individual key terms
      if (words.length > 2) {
        const importantWords = words.filter(word =>
          word.length > 3 && !STOP_WORDS.has(word.toLowerCase())
        );
        if (importantWords.length > 0) {
          enhanced.add(importantWords.slice(0, 2).join(' '));
        }
      }
    }

    return Array.from(enhanced).slice(0, 8); // Limit to 8 variations
  }

  /**
   * Extract key terms from query for highlighting and matching
   */
  static extractKeyTerms(query: string, minLength = 3): string[] {
    const normalized = this.normalizeQuery(query);
    const words = normalized.toLowerCase()
      .split(/\s+/)
      .filter(word =>
        word.length >= minLength &&
        !STOP_WORDS.has(word) &&
        /\w/.test(word)
      );

    // Remove duplicates and sort by length (longer terms first)
    return Array.from(new Set(words))
      .sort((a, b) => b.length - a.length);
  }

  /**
   * Classify query type for routing to appropriate search strategy
   */
  static classifyQueryType(query: string): {
    type: 'exact_match' | 'semantic' | 'hybrid' | 'broad';
    confidence: number;
    reasoning: string;
    recommendedStrategy: string;
  } {
    const metadata = this.analyzeQueryMetadata(query);
    const hasQuotes = /["']/.test(query);
    const hasCodes = metadata.hasCodes;
    const hasChemical = metadata.hasChemicalNames;
    const wordCount = metadata.wordCount;

    let type: 'exact_match' | 'semantic' | 'hybrid' | 'broad';
    let confidence: number;
    let reasoning: string;
    let recommendedStrategy: string;

    if (hasQuotes || hasCodes || (hasChemical && wordCount <= 3)) {
      type = 'exact_match';
      confidence = 0.9;
      reasoning = 'Query contains exact match indicators (quotes, codes, or specific chemical names)';
      recommendedStrategy = 'Use high similarity threshold (0.8+) with exact matching priority';
    } else if (wordCount === 1 || (wordCount === 2 && !hasChemical)) {
      type = 'broad';
      confidence = 0.8;
      reasoning = 'Short query suggests broad concept search';
      recommendedStrategy = 'Use low similarity threshold (0.3-0.5) with synonym expansion';
    } else if (wordCount > 5 || metadata.complexity === 'complex') {
      type = 'semantic';
      confidence = 0.8;
      reasoning = 'Complex or long query benefits from semantic understanding';
      recommendedStrategy = 'Use moderate threshold (0.5-0.7) with semantic focus';
    } else {
      type = 'hybrid';
      confidence = 0.7;
      reasoning = 'Balanced query benefits from combined approach';
      recommendedStrategy = 'Use hybrid search with adaptive thresholding';
    }

    return {
      type,
      confidence,
      reasoning,
      recommendedStrategy
    };
  }

  /**
   * Preprocess query for full-text search
   */
  static prepareForFullTextSearch(query: string): string {
    const normalized = this.normalizeQuery(query);

    // Convert to PostgreSQL full-text search format
    const words = normalized
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word))
      .map(word => word.replace(/[^\w]/g, ''));

    // Add prefix matching for partial words
    const tsqueryParts = words.map(word => {
      if (word.length > 3) {
        return `${word}:* | ${word}`;  // Both prefix and exact
      }
      return word;
    });

    return tsqueryParts.join(' & ');
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const queryEnhancementConfigSchema = z.object({
  enableSynonymExpansion: z.boolean().optional().default(true),
  enableSpellCorrection: z.boolean().optional().default(true),
  enableDomainSpecificTerms: z.boolean().optional().default(true),
  enableStopWordRemoval: z.boolean().optional().default(false),
  enableStemming: z.boolean().optional().default(false),
  maxSynonymsPerTerm: z.number().int().min(1).max(10).optional().default(3),
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.8)
}).strict();

export const queryEnhancementParamsSchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000, 'Query too long'),
  config: queryEnhancementConfigSchema.optional(),
  context: z.object({
    domain: z.enum(['cosmetic', 'technical', 'general']).optional(),
    userPreferences: z.record(z.any()).optional(),
    searchHistory: z.array(z.string()).optional()
  }).optional()
}).strict();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function validateQueryEnhancementParams(data: unknown): QueryEnhancementParams {
  return queryEnhancementParamsSchema.parse(data);
}

export function validateQueryEnhancementConfig(data: unknown): QueryEnhancementConfig {
  return queryEnhancementConfigSchema.parse(data);
}

/**
 * Quick query enhancement for simple use cases
 */
export async function quickEnhanceQuery(
  query: string,
  domain?: 'cosmetic' | 'technical' | 'general'
): Promise<string[]> {
  const result = await QueryProcessor.enhanceQuery({
    query,
    context: { domain }
  });

  return result.enhanced;
}

/**
 * Get query classification without full enhancement
 */
export function classifyQuery(query: string): {
  type: string;
  strategy: string;
  confidence: number;
} {
  const classification = QueryProcessor.classifyQueryType(query);

  return {
    type: classification.type,
    strategy: classification.recommendedStrategy,
    confidence: classification.confidence
  };
}