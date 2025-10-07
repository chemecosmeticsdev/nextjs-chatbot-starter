/**
 * Enhanced Metadata Extraction Pipeline with Nova Micro Integration
 *
 * Implements the comprehensive metadata extraction rules from RAG Implementation Plan Part 1
 * Enhanced with AWS Bedrock Nova Micro for intelligent document analysis
 * Extracts metadata from Google Drive folder paths and document content according to
 * the cosmetics ingredients B2B customer support application requirements
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface DocumentMetadata {
  // Identity & Storage
  document_id: string;
  file_path: string;
  filename: string;
  file_hash?: string;
  file_size_bytes: number;
  file_extension: string;

  // Hierarchical Classification (Key for filtering)
  supplier_name?: string;
  supplier_normalized?: string;
  supplier_country?: string;
  ingredient_name?: string;
  ingredient_normalized?: string;
  ingredient_code?: string;
  ingredient_inci_name?: string;
  ingredient_cas_number?: string;

  // Document Classification
  document_type: string;
  document_category: string;
  document_subtype?: string;

  // Version Control & Lifecycle
  version_date?: Date;
  version_string?: string;
  is_current: boolean;
  version_status: 'current' | 'archived' | 'superseded' | 'draft';
  superseded_by?: string;
  supersedes?: string;

  // Compliance & Certifications
  compliance_types: string[];
  certification_bodies: string[];
  regulatory_regions: string[];
  expiry_date?: Date;
  issue_date?: Date;
  certification_number?: string;

  // Content Properties
  language: string;
  languages_detected: string[];
  has_images: boolean;
  has_tables: boolean;
  has_chemical_formulas: boolean;
  has_diagrams: boolean;
  page_count?: number;
  word_count?: number;

  // Processing Metadata
  extraction_method: 'docling' | 'mistral_ocr' | 'manual' | 'hybrid';
  ocr_confidence?: number;
  ocr_quality_flags: string[];
  processed_date: Date;
  processing_duration_ms?: number;
  text_length: number;
  token_count: number;

  // Search Optimization
  keywords: string[];
  cas_numbers: string[];
  inci_names: string[];
  allergens: string[];
  ec_numbers: string[];
  chemical_names: string[];

  // Business Context
  product_applications: string[];
  function_categories: string[];
  cosmetic_categories: string[];
  batch_numbers: string[];
  lot_numbers: string[];

  // Quality Flags & Validation
  quality_score: number;
  quality_dimensions: {
    ocr_confidence?: number;
    metadata_completeness: number;
    content_clarity: number;
    structural_integrity: number;
  };
  is_duplicate: boolean;
  duplicate_of?: string;
  duplicate_reason?: string;
  requires_review: boolean;
  review_notes?: string;
  validation_status: 'verified' | 'pending' | 'failed' | 'auto_validated';

  // Custom Flags & Notes
  is_discontinued: boolean;
  discontinuation_date?: Date;
  special_notes?: string;
  internal_notes?: string;

  // Technical Specifications
  specifications: Record<string, any>;
}

export interface NovaEnhancedMetadata {
  normalized_names: {
    supplier: string;
    ingredient: string;
    inci_name?: string;
  };
  detected_compliance: string[];
  content_analysis: {
    key_topics: string[];
    quality_indicators: string[];
    technical_specifications: Record<string, string>;
    regulatory_mentions: string[];
  };
  confidence_scores: {
    overall: number;
    supplier_detection: number;
    ingredient_detection: number;
    compliance_detection: number;
  };
}

export class MetadataExtractionPipeline {
  private static bedrockClient?: BedrockRuntimeClient;

  /**
   * Initialize AWS Bedrock client for Nova Micro integration
   */
  private static getBedrockClient(): BedrockRuntimeClient {
    if (!this.bedrockClient) {
      this.bedrockClient = new BedrockRuntimeClient({
        region: process.env.BEDROCK_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.bedrockClient;
  }
  /**
   * Extract comprehensive metadata from file path and filename
   * Handles both Google Drive paths (/PC/supplier/ingredient/file) and local upload paths
   * Enhanced with defensive error handling and robust fallback logic
   */
  static extractFromFilePath(filePath: string): Partial<DocumentMetadata> {
    // Defensive guard against invalid inputs
    if (!filePath || typeof filePath !== 'string') {
      console.warn('[MetadataExtraction] Invalid filePath provided:', filePath);
      return {
        file_path: filePath || '',
        filename: 'unknown',
        file_extension: '',
      };
    }

    try {
      // Google Drive path pattern
      const googleDrivePattern = /\/PC\/([^\/]+)\/([^\/]+)\/(.+)/;
      const googleMatch = filePath.match(googleDrivePattern);

      if (googleMatch) {
        // Handle Google Drive path structure
        const [_, supplier, ingredient, restPath] = googleMatch;
        const filename = restPath.split('/').pop() || '';

        return {
          file_path: filePath,
          filename,
          file_extension: this.getFileExtension(filename),
          supplier_name: supplier.trim(),
          supplier_normalized: this.normalizeString(supplier),
          ingredient_name: ingredient.trim(),
          ingredient_normalized: this.normalizeString(ingredient),
        };
      }

      // Handle local upload paths and extract from filename
      const filename = filePath.split('/').pop() || '';

      // Extract original filename by removing UUID prefix if present
      // Handle cases like 'uuid.pdf' -> 'original.pdf' or direct filename
      let originalFilename = filename;

      // Check if filename starts with UUID pattern
      const uuidPrefixMatch = filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(.+)$/);
      if (uuidPrefixMatch) {
        originalFilename = uuidPrefixMatch[1];
      }

      // Extract metadata from filename patterns
      const filenameMetadata = this.extractMetadataFromFilename(originalFilename);

      return {
        file_path: filePath,
        filename: originalFilename || filename,
        file_extension: this.getFileExtension(filename),
        supplier_name: filenameMetadata.supplierName,
        supplier_normalized: filenameMetadata.supplierName ? this.normalizeString(filenameMetadata.supplierName) : undefined,
        ingredient_name: filenameMetadata.ingredientName,
        ingredient_normalized: filenameMetadata.ingredientName ? this.normalizeString(filenameMetadata.ingredientName) : undefined,
      };

    } catch (error) {
      // Defensive error handling - never throw, always return fallback metadata
      console.warn('[MetadataExtraction] Error extracting from file path:', error);

      const fallbackFilename = filePath.split('/').pop() || 'unknown';

      return {
        file_path: filePath,
        filename: fallbackFilename,
        file_extension: this.getFileExtension(fallbackFilename),
        supplier_name: undefined,
        ingredient_name: undefined,
      };
    }
  }

  /**
   * Extract metadata from filename using various patterns
   * Uses the same logic as the upload route for consistency
   */
  private static extractMetadataFromFilename(filename: string): {
    supplierName?: string;
    ingredientName?: string;
    documentType?: string;
  } {
    // Try to extract supplier and ingredient from filename patterns
    const metadata: any = {};

    // Remove file extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Common patterns: "Supplier_Ingredient_Document", "Supplier - Ingredient", etc.
    const patterns = [
      /^([^_-]+)[_-]+([^_-]+)/,  // "BASF_Menthol" or "BASF-Menthol"
      /([A-Z][a-z]+)\s+([A-Z][a-z]+)/,  // "BASF Menthol"
    ];

    for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) {
        metadata.supplierName = match[1].trim();
        metadata.ingredientName = match[2].trim();
        break;
      }
    }

    // Try to detect document type from filename
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('sds') || lowerName.includes('safety')) {
      metadata.documentType = 'sds';
    } else if (lowerName.includes('spec') || lowerName.includes('specification')) {
      metadata.documentType = 'specification';
    } else if (lowerName.includes('coa') || lowerName.includes('analysis')) {
      metadata.documentType = 'certificate_of_analysis';
    } else if (lowerName.includes('cert') || lowerName.includes('certificate')) {
      // Use the comprehensive classification instead of generic 'certificate'
      const classification = this.classifyDocumentType(filename);
      metadata.documentType = classification.document_type;
    }

    return metadata;
  }

  /**
   * Classify document type from filename using comprehensive patterns
   */
  static classifyDocumentType(filename: string): {
    document_type: string;
    document_category: string;
    document_subtype?: string;
  } {
    const normalizedName = filename.toLowerCase();

    // Type detection patterns (order matters - specific before general)
    const typePatterns: Record<string, {
      patterns: RegExp[];
      category: string;
      subtype?: string;
    }> = {
      // Safety & Regulatory
      'sds': {
        patterns: [/\bsds\b/, /safety.*data.*sheet/],
        category: 'safety'
      },
      'msds': {
        patterns: [/\bmsds\b/, /material.*safety/],
        category: 'safety'
      },

      // Technical Documentation
      'specification': {
        patterns: [/\bspec\b/, /specification/],
        category: 'technical'
      },
      'technical_data_sheet': {
        patterns: [/\btds\b/, /technical.*data.*sheet/],
        category: 'technical'
      },
      'certificate_of_analysis': {
        patterns: [/\bcoa\b/, /certificate.*of.*analysis/],
        category: 'technical'
      },

      // Compliance Statements & Certifications
      'reach_registration': {
        patterns: [/\breach\b/],
        category: 'compliance'
      },
      'halal_certificate': {
        patterns: [/\bhalal\b/, /halal.*cert/],
        category: 'compliance'
      },
      'kosher_certificate': {
        patterns: [/\bkosher\b/, /kosher.*cert/],
        category: 'compliance'
      },
      'iso_certificate': {
        patterns: [/\biso\s*\d{4,5}\b/i, /iso.*cert/],
        category: 'compliance'
      },
      'fssc_certificate': {
        patterns: [/\bfssc\b/, /fssc.*22000/],
        category: 'compliance'
      },
      'haccp_certificate': {
        patterns: [/\bhaccp\b/],
        category: 'compliance'
      },
      'gmp_certificate': {
        patterns: [/\bgmp\b/, /good.*manufacturing/],
        category: 'compliance'
      },

      // Ingredient Statements
      'composition_sheet': {
        patterns: [/\bcomposition\b/, /ingredient.*list/],
        category: 'compliance'
      },
      'allergen_statement': {
        patterns: [/\ballergen/],
        category: 'compliance'
      },
      'gmo_statement': {
        patterns: [/\bgmo\b/, /gmo.*free/, /non.*gmo/],
        category: 'compliance'
      },
      'vegan_statement': {
        patterns: [/\bvegan\b/],
        category: 'compliance'
      },
      'palm_free_statement': {
        patterns: [/\bpalm.*free\b/, /palm.*oil.*free/],
        category: 'compliance'
      },
      'animal_testing_statement': {
        patterns: [/animal.*test/, /cruelty.*free/],
        category: 'compliance'
      },
      'naturalness_statement': {
        patterns: [/natural.*statement/, /synthetic.*statement/],
        category: 'compliance'
      },

      // Manufacturing & Process
      'manufacturing_procedure': {
        patterns: [/manufacturing.*procedure/, /production.*process/],
        category: 'manufacturing'
      },
      'process_flow_chart': {
        patterns: [/flow.*chart/, /process.*flow/],
        category: 'manufacturing'
      },

      // Marketing & Product Info
      'product_presentation': {
        patterns: [/presentation/, /product.*catalog/],
        category: 'marketing'
      },
      'product_catalog': {
        patterns: [/catalog/, /brochure/],
        category: 'marketing'
      },
      'product_profile': {
        patterns: [/product.*profile/, /product.*overview/],
        category: 'marketing'
      },
      'application_guide': {
        patterns: [/application.*guide/, /usage.*instructions/],
        category: 'marketing'
      },

      // Regulatory
      'regulatory_document': {
        patterns: [/regulatory/, /regulation/],
        category: 'regulatory'
      },
      'proposition_65': {
        patterns: [/proposition.*65/, /prop.*65/],
        category: 'regulatory'
      },
      'country_of_origin': {
        patterns: [/country.*of.*origin/, /origin.*statement/],
        category: 'regulatory'
      },

      // Other
      'email': {
        patterns: [/\.msg$/],
        category: 'communication'
      },
      'image': {
        patterns: [/\.(jpg|jpeg|png|gif|bmp|tif|tiff)$/],
        category: 'marketing'
      },
    };

    // Check patterns in priority order
    for (const [type, config] of Object.entries(typePatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(normalizedName)) {
          return {
            document_type: type,
            document_category: config.category,
            document_subtype: config.subtype
          };
        }
      }
    }

    return {
      document_type: 'other',
      document_category: 'other'
    };
  }

  /**
   * Extract version dates from filename
   */
  static extractVersionDate(filename: string): Date | null {
    const datePatterns = [
      // DD.MM.YYYY or DD.MM.YY
      { pattern: /(\d{2})\.(\d{2})\.(\d{2,4})/, format: 'DD.MM.YYYY' },
      // MM.YY
      { pattern: /_(\d{2})\.(\d{2})(?:\.pdf)?$/i, format: 'MM.YY' },
      // YYYY-MM-DD
      { pattern: /(\d{4})-(\d{2})-(\d{2})/, format: 'YYYY-MM-DD' },
      // YYYYMMDD
      { pattern: /_(\d{4})(\d{2})(\d{2})/, format: 'YYYYMMDD' },
      // (DD.MM.YYYY) in parentheses
      { pattern: /\((\d{2})\.(\d{2})\.(\d{4})\)/, format: '(DD.MM.YYYY)' },
    ];

    for (const { pattern, format } of datePatterns) {
      const match = filename.match(pattern);
      if (match) {
        return this.parseDateByFormat(match, format);
      }
    }

    return null;
  }

  /**
   * Extract expiry date for certificates
   */
  static extractExpiryDate(filename: string): Date | null {
    const expiryPatterns = [
      /EXP[._](\d{2})\.(\d{2})\.(\d{2,4})/i,
      /EXP[._](\d{4})\.(\d{2})\.(\d{2})/i,
      /expiry[._](\d{2})[._](\d{2})[._](\d{2,4})/i,
    ];

    for (const pattern of expiryPatterns) {
      const match = filename.match(pattern);
      if (match) {
        return this.parseExpiryDate(match);
      }
    }

    return null;
  }

  /**
   * Detect compliance types from filename
   */
  static detectComplianceTypes(filename: string): string[] {
    const types: string[] = [];
    const lowerFilename = filename.toLowerCase();

    const compliancePatterns: Record<string, RegExp> = {
      'REACH': /\breach\b/,
      'Halal': /\bhalal\b/,
      'Kosher': /\bkosher\b/,
      'Vegan': /\bvegan\b/,
      'GMO-Free': /\bgmo.*free\b|non.*gmo/,
      'Gluten-Free': /gluten.*free/,
      'Palm-Free': /palm.*free/,
      'Allergen-Free': /allergen.*free/,
      'Cruelty-Free': /cruelty.*free|no.*animal.*test/,
      'Natural': /\bnatural\b/,
      'Organic': /\borganic\b/,
    };

    for (const [type, pattern] of Object.entries(compliancePatterns)) {
      if (pattern.test(lowerFilename)) {
        types.push(type);
      }
    }

    return types;
  }

  /**
   * Determine version status from file path
   */
  static determineVersionStatus(filePath: string): 'current' | 'archived' | 'superseded' | 'draft' {
    const lowerPath = filePath.toLowerCase();

    // Check if in "Old", "old", "Archive", "Archived" folder
    if (lowerPath.includes('/old/') ||
        lowerPath.includes('/- old/') ||
        lowerPath.includes('/archive/')) {
      return 'archived';
    }

    // Check for "deprecated", "obsolete" in filename
    if (lowerPath.includes('deprecated') ||
        lowerPath.includes('obsolete') ||
        lowerPath.includes('superseded')) {
      return 'superseded';
    }

    // Default to current
    return 'current';
  }

  /**
   * Detect special flags from folder/file names
   */
  static detectSpecialFlags(filePath: string): {
    is_discontinued: boolean;
    discontinuation_date?: Date;
    special_notes?: string;
  } {
    const flags: any = {
      is_discontinued: false
    };

    // Discontinued products
    if (filePath.includes('Discontinued') ||
        filePath.includes('ยกเลิกการขาย') ||  // Thai: "cancelled sale"
        filePath.includes('_Discontinued')) {
      flags.is_discontinued = true;

      // Try to extract discontinuation date
      const dateMatch = filePath.match(/(?:Discontinued|ยกเลิกการขาย)[_ ](\d{2})\.(\d{2})\.(\d{4})/);
      if (dateMatch) {
        flags.discontinuation_date = new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
      }
    }

    // Special notes (Thai text, unusual markers)
    const thaiTextMatch = filePath.match(/[\u0E00-\u0E7F]+/);
    if (thaiTextMatch) {
      flags.special_notes = `Contains Thai text: ${thaiTextMatch[0]}`;
    }

    return flags;
  }

  /**
   * Extract metadata from document content (post-OCR/extraction)
   */
  static extractContentMetadata(text: string, documentType: string): Partial<DocumentMetadata> {
    const metadata: Partial<DocumentMetadata> = {};

    // CAS Number extraction (format: 12345-67-8)
    const casPattern = /\b\d{2,7}-\d{2}-\d\b/g;
    const casNumbers = [...new Set(text.match(casPattern) || [])];
    if (casNumbers.length > 0) {
      metadata.cas_numbers = casNumbers;
    }

    // EC Number extraction (format: 201-939-0)
    const ecPattern = /\b\d{3}-\d{3}-\d\b/g;
    const ecNumbers = [...new Set(text.match(ecPattern) || [])];
    if (ecNumbers.length > 0) {
      metadata.ec_numbers = ecNumbers;
    }

    // Batch/Lot number extraction (from COA)
    if (documentType === 'certificate_of_analysis') {
      const batchPatterns = [
        /(?:Lot|Batch|Lot No\.?|Batch No\.?)[\:\s]+([A-Z0-9]+)/gi,
        /\bLot[\:\s]+([A-Z0-9]{6,})/gi,
      ];

      const batches: string[] = [];
      for (const pattern of batchPatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          batches.push(match[1]);
        }
      }

      if (batches.length > 0) {
        metadata.batch_numbers = [...new Set(batches)];
      }
    }

    // Allergen detection
    const allergenKeywords = [
      'peanut', 'tree nut', 'milk', 'egg', 'fish', 'shellfish',
      'soy', 'wheat', 'sesame', 'gluten', 'lactose'
    ];

    const foundAllergens: string[] = [];
    const lowerText = text.toLowerCase();
    for (const allergen of allergenKeywords) {
      if (lowerText.includes(allergen)) {
        foundAllergens.push(allergen);
      }
    }

    if (foundAllergens.length > 0) {
      metadata.allergens = foundAllergens;
    } else if (lowerText.includes('allergen free') || lowerText.includes('no allergens')) {
      metadata.allergens = ['none'];
    }

    // Language detection
    metadata.language = this.detectLanguage(text);

    // Has tables/formulas detection
    metadata.has_tables = this.containsTables(text);
    metadata.has_chemical_formulas = this.containsChemicalFormulas(text);

    return metadata;
  }

  /**
   * Calculate quality score based on completeness and accuracy
   */
  static calculateQualityScore(metadata: Partial<DocumentMetadata>): {
    quality_score: number;
    quality_dimensions: {
      ocr_confidence?: number;
      metadata_completeness: number;
      content_clarity: number;
      structural_integrity: number;
    };
  } {
    // Metadata completeness score (0-100)
    const requiredFields = ['supplier_name', 'ingredient_name', 'document_type'];
    const optionalFields = [
      'ingredient_cas_number', 'compliance_types', 'version_date',
      'language', 'keywords', 'allergens'
    ];

    let completeness = 0;

    // Required fields (60% weight)
    const requiredScore = requiredFields.reduce((score, field) => {
      return score + (metadata[field as keyof DocumentMetadata] ? 20 : 0);
    }, 0);

    // Optional fields (40% weight)
    const optionalScore = optionalFields.reduce((score, field) => {
      const value = metadata[field as keyof DocumentMetadata];
      return score + (value && (Array.isArray(value) ? value.length > 0 : true) ? 7 : 0);
    }, 0);

    completeness = Math.min(100, requiredScore + optionalScore);

    // Content clarity (based on text length and structure)
    let contentClarity = 80; // Default
    if (metadata.text_length && metadata.text_length > 1000) {
      contentClarity = Math.min(100, 60 + (metadata.text_length / 100));
    }

    // Structural integrity (based on document type and content features)
    let structuralIntegrity = 80; // Default
    if (metadata.has_tables) structuralIntegrity += 10;
    if (metadata.document_type && metadata.document_type !== 'other') structuralIntegrity += 10;

    const qualityDimensions = {
      ocr_confidence: metadata.ocr_confidence,
      metadata_completeness: completeness,
      content_clarity: contentClarity,
      structural_integrity: Math.min(100, structuralIntegrity)
    };

    // Overall quality score (weighted average)
    const weights = {
      metadata_completeness: 0.4,
      content_clarity: 0.3,
      structural_integrity: 0.2,
      ocr_confidence: 0.1
    };

    let qualityScore =
      qualityDimensions.metadata_completeness * weights.metadata_completeness +
      qualityDimensions.content_clarity * weights.content_clarity +
      qualityDimensions.structural_integrity * weights.structural_integrity;

    if (qualityDimensions.ocr_confidence) {
      qualityScore += qualityDimensions.ocr_confidence * weights.ocr_confidence;
    }

    return {
      quality_score: Math.round(qualityScore),
      quality_dimensions: qualityDimensions
    };
  }

  /**
   * Enhanced metadata extraction using Nova Micro AI analysis
   */
  static async extractWithNovaEnhancement(
    documentContent: string,
    filePath: string,
    filename: string
  ): Promise<Partial<DocumentMetadata> & { nova_enhanced?: NovaEnhancedMetadata }> {
    // Start with traditional extraction
    const baseMetadata = this.extractFromFilePath(filePath);
    const classificationResult = this.classifyDocumentType(filename);
    const contentMetadata = this.extractContentMetadata(documentContent, classificationResult.document_type);

    // Combine base metadata
    const combinedMetadata = {
      ...baseMetadata,
      ...classificationResult,
      ...contentMetadata,
      text_length: documentContent.length,
      token_count: Math.ceil(documentContent.split(/\s+/).length * 1.3),
    };

    try {
      // Enhance with Nova Micro analysis
      const novaEnhancement = await this.analyzeWithNovaMicro(
        documentContent,
        combinedMetadata.supplier_name || '',
        combinedMetadata.ingredient_name || '',
        classificationResult.document_type
      );

      // Apply Nova enhancements to metadata
      const enhancedMetadata = this.applyNovaEnhancements(combinedMetadata, novaEnhancement);

      return {
        ...enhancedMetadata,
        nova_enhanced: novaEnhancement
      };

    } catch (error) {
      console.warn('Nova Micro enhancement failed, using traditional extraction:', error);
      return combinedMetadata;
    }
  }

  /**
   * Analyze document content using Nova Micro for intelligent insights
   */
  private static async analyzeWithNovaMicro(
    content: string,
    supplierHint: string,
    ingredientHint: string,
    documentType: string
  ): Promise<NovaEnhancedMetadata> {
    const client = this.getBedrockClient();

    const prompt = this.buildNovaAnalysisPrompt(content, supplierHint, ingredientHint, documentType);

    const command = new ConverseCommand({
      modelId: 'amazon.nova-micro-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.1,
        topP: 0.9,
      },
    });

    try {
      const response = await client.send(command);
      const responseText = response.output?.message?.content?.[0]?.text || '';

      return this.parseNovaResponse(responseText);
    } catch (error) {
      throw new Error(`Nova Micro analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build comprehensive analysis prompt for Nova Micro
   */
  private static buildNovaAnalysisPrompt(
    content: string,
    supplierHint: string,
    ingredientHint: string,
    documentType: string
  ): string {
    return `You are an expert in cosmetics ingredient documentation analysis. Analyze this ${documentType} document and provide structured metadata extraction.

DOCUMENT CONTENT:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

CONTEXT HINTS:
- Suspected Supplier: ${supplierHint || 'Unknown'}
- Suspected Ingredient: ${ingredientHint || 'Unknown'}
- Document Type: ${documentType}

ANALYSIS REQUIREMENTS:
Please provide a comprehensive analysis in the following JSON format:

{
  "normalized_names": {
    "supplier": "standardized supplier name",
    "ingredient": "standardized ingredient name",
    "inci_name": "INCI name if found"
  },
  "detected_compliance": ["compliance type 1", "compliance type 2"],
  "content_analysis": {
    "key_topics": ["topic 1", "topic 2", "topic 3"],
    "quality_indicators": ["indicator 1", "indicator 2"],
    "technical_specifications": {
      "specification_name": "value",
      "another_spec": "value"
    },
    "regulatory_mentions": ["regulation 1", "regulation 2"]
  },
  "confidence_scores": {
    "overall": 85,
    "supplier_detection": 90,
    "ingredient_detection": 95,
    "compliance_detection": 80
  }
}

SPECIFIC FOCUS AREAS:
1. **Supplier Identification**: Look for company names, manufacturer details, distributors
2. **Ingredient Names**: Find INCI names, trade names, chemical names, CAS numbers
3. **Compliance Types**: Detect certifications (Halal, Kosher, Vegan, REACH, etc.)
4. **Technical Specs**: Extract purity levels, physical properties, composition data
5. **Regulatory Info**: Find mentions of regulations, standards, compliance statements

IMPORTANT GUIDELINES:
- Be conservative with confidence scores (0-100 scale)
- Use standardized naming conventions for suppliers and ingredients
- Focus on factual, extractable information only
- If information is unclear or missing, use lower confidence scores
- Normalize company names (e.g., "BASF SE" → "BASF")
- Standardize ingredient names using INCI conventions where possible

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse Nova Micro response into structured metadata
   */
  private static parseNovaResponse(responseText: string): NovaEnhancedMetadata {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Nova response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and provide defaults
      return {
        normalized_names: {
          supplier: parsed.normalized_names?.supplier || '',
          ingredient: parsed.normalized_names?.ingredient || '',
          inci_name: parsed.normalized_names?.inci_name
        },
        detected_compliance: Array.isArray(parsed.detected_compliance)
          ? parsed.detected_compliance
          : [],
        content_analysis: {
          key_topics: Array.isArray(parsed.content_analysis?.key_topics)
            ? parsed.content_analysis.key_topics
            : [],
          quality_indicators: Array.isArray(parsed.content_analysis?.quality_indicators)
            ? parsed.content_analysis.quality_indicators
            : [],
          technical_specifications: parsed.content_analysis?.technical_specifications || {},
          regulatory_mentions: Array.isArray(parsed.content_analysis?.regulatory_mentions)
            ? parsed.content_analysis.regulatory_mentions
            : []
        },
        confidence_scores: {
          overall: this.validateScore(parsed.confidence_scores?.overall, 75),
          supplier_detection: this.validateScore(parsed.confidence_scores?.supplier_detection, 70),
          ingredient_detection: this.validateScore(parsed.confidence_scores?.ingredient_detection, 70),
          compliance_detection: this.validateScore(parsed.confidence_scores?.compliance_detection, 70)
        }
      };
    } catch (error) {
      console.error('Failed to parse Nova response:', error);
      // Return fallback structure
      return {
        normalized_names: { supplier: '', ingredient: '' },
        detected_compliance: [],
        content_analysis: {
          key_topics: [],
          quality_indicators: [],
          technical_specifications: {},
          regulatory_mentions: []
        },
        confidence_scores: {
          overall: 50,
          supplier_detection: 50,
          ingredient_detection: 50,
          compliance_detection: 50
        }
      };
    }
  }

  /**
   * Apply Nova enhancements to base metadata
   */
  private static applyNovaEnhancements(
    baseMetadata: Partial<DocumentMetadata>,
    novaEnhancement: NovaEnhancedMetadata
  ): Partial<DocumentMetadata> {
    const enhanced = { ...baseMetadata };

    // Apply normalized names if confidence is high
    if (novaEnhancement.confidence_scores.supplier_detection > 75 && novaEnhancement.normalized_names.supplier) {
      enhanced.supplier_name = novaEnhancement.normalized_names.supplier;
      enhanced.supplier_normalized = this.normalizeString(novaEnhancement.normalized_names.supplier);
    }

    if (novaEnhancement.confidence_scores.ingredient_detection > 75 && novaEnhancement.normalized_names.ingredient) {
      enhanced.ingredient_name = novaEnhancement.normalized_names.ingredient;
      enhanced.ingredient_normalized = this.normalizeString(novaEnhancement.normalized_names.ingredient);
    }

    if (novaEnhancement.normalized_names.inci_name) {
      enhanced.ingredient_inci_name = novaEnhancement.normalized_names.inci_name;
    }

    // Enhance compliance types
    if (novaEnhancement.confidence_scores.compliance_detection > 70) {
      const existingCompliance = enhanced.compliance_types || [];
      const enhancedCompliance = [
        ...existingCompliance,
        ...novaEnhancement.detected_compliance
      ];
      enhanced.compliance_types = [...new Set(enhancedCompliance)];
    }

    // Add enhanced keywords from content analysis
    const existingKeywords = enhanced.keywords || [];
    const newKeywords = [
      ...existingKeywords,
      ...novaEnhancement.content_analysis.key_topics,
      ...novaEnhancement.content_analysis.quality_indicators
    ];
    enhanced.keywords = [...new Set(newKeywords)];

    // Store technical specifications
    if (Object.keys(novaEnhancement.content_analysis.technical_specifications).length > 0) {
      enhanced.specifications = {
        ...enhanced.specifications,
        ...novaEnhancement.content_analysis.technical_specifications
      };
    }

    // Enhance quality score based on Nova analysis
    const novaQualityBoost = this.calculateNovaQualityBoost(novaEnhancement);
    const currentQuality = enhanced.quality_score || 70;
    enhanced.quality_score = Math.min(100, currentQuality + novaQualityBoost);

    return enhanced;
  }

  /**
   * Calculate quality boost based on Nova analysis confidence
   */
  private static calculateNovaQualityBoost(novaEnhancement: NovaEnhancedMetadata): number {
    const avgConfidence = (
      novaEnhancement.confidence_scores.overall +
      novaEnhancement.confidence_scores.supplier_detection +
      novaEnhancement.confidence_scores.ingredient_detection +
      novaEnhancement.confidence_scores.compliance_detection
    ) / 4;

    // Boost quality score by up to 15 points based on Nova confidence
    return Math.round((avgConfidence - 50) * 0.3);
  }

  /**
   * Validate and clamp confidence scores
   */
  private static validateScore(score: any, defaultValue: number): number {
    if (typeof score === 'number' && score >= 0 && score <= 100) {
      return Math.round(score);
    }
    return defaultValue;
  }

  /**
   * Get enhanced metadata for a document with full Nova analysis
   */
  static async getEnhancedMetadata(
    filePath: string,
    filename: string,
    documentContent: string,
    extractionMethod: 'docling' | 'mistral_ocr' | 'manual' | 'hybrid' = 'mistral_ocr',
    ocrConfidence?: number
  ): Promise<DocumentMetadata> {
    // Get enhanced metadata with Nova analysis
    const partialMetadata = await this.extractWithNovaEnhancement(
      documentContent,
      filePath,
      filename
    );

    // Calculate final quality scores
    const qualityResult = this.calculateQualityScore(partialMetadata);

    // Detect special flags
    const specialFlags = this.detectSpecialFlags(filePath);

    // Determine version status
    const versionStatus = this.determineVersionStatus(filePath);

    // Extract dates
    const versionDate = this.extractVersionDate(filename);
    const expiryDate = this.extractExpiryDate(filename);

    // Complete metadata object
    const completeMetadata: DocumentMetadata = {
      // Identity & Storage
      document_id: '', // Will be set by caller
      file_path: filePath,
      filename,
      file_hash: '', // Will be set by caller
      file_size_bytes: 0, // Will be set by caller
      file_extension: this.getFileExtension(filename),

      // Hierarchical Classification
      supplier_name: partialMetadata.supplier_name || '',
      supplier_normalized: partialMetadata.supplier_normalized || '',
      supplier_country: '', // Can be enhanced with additional analysis
      ingredient_name: partialMetadata.ingredient_name || '',
      ingredient_normalized: partialMetadata.ingredient_normalized || '',
      ingredient_code: '', // Can be extracted from content
      ingredient_inci_name: partialMetadata.ingredient_inci_name || '',
      ingredient_cas_number: partialMetadata.cas_numbers?.[0] || '',

      // Document Classification
      document_type: partialMetadata.document_type || 'other',
      document_category: partialMetadata.document_category || 'other',
      document_subtype: partialMetadata.document_subtype,

      // Version Control & Lifecycle
      version_date: versionDate,
      version_string: '', // Can be extracted from filename
      is_current: versionStatus === 'current',
      version_status: versionStatus,
      superseded_by: '',
      supersedes: '',

      // Compliance & Certifications
      compliance_types: partialMetadata.compliance_types || [],
      certification_bodies: [], // Can be enhanced
      regulatory_regions: [], // Can be enhanced
      expiry_date: expiryDate,
      issue_date: versionDate, // Use version date as fallback
      certification_number: '', // Can be extracted from content

      // Content Properties
      language: partialMetadata.language || 'en',
      languages_detected: [partialMetadata.language || 'en'],
      has_images: partialMetadata.has_images || false,
      has_tables: partialMetadata.has_tables || false,
      has_chemical_formulas: partialMetadata.has_chemical_formulas || false,
      has_diagrams: partialMetadata.has_diagrams || false,
      page_count: 1, // Will be set by OCR service
      word_count: documentContent.split(/\s+/).length,

      // Processing Metadata
      extraction_method: extractionMethod,
      ocr_confidence: ocrConfidence,
      ocr_quality_flags: [],
      processed_date: new Date(),
      processing_duration_ms: 0, // Will be set by caller
      text_length: partialMetadata.text_length || 0,
      token_count: partialMetadata.token_count || 0,

      // Search Optimization
      keywords: partialMetadata.keywords || [],
      cas_numbers: partialMetadata.cas_numbers || [],
      inci_names: partialMetadata.inci_names || [],
      allergens: partialMetadata.allergens || [],
      ec_numbers: partialMetadata.ec_numbers || [],
      chemical_names: partialMetadata.chemical_names || [],

      // Business Context
      product_applications: partialMetadata.product_applications || [],
      function_categories: partialMetadata.function_categories || [],
      cosmetic_categories: partialMetadata.cosmetic_categories || [],
      batch_numbers: partialMetadata.batch_numbers || [],
      lot_numbers: partialMetadata.lot_numbers || [],

      // Quality Flags & Validation
      quality_score: qualityResult.quality_score,
      quality_dimensions: qualityResult.quality_dimensions,
      is_duplicate: false, // Will be determined by hash comparison
      duplicate_of: '',
      duplicate_reason: '',
      requires_review: qualityResult.quality_score < 70,
      review_notes: '',
      validation_status: qualityResult.quality_score > 85 ? 'auto_validated' : 'pending',

      // Custom Flags & Notes
      is_discontinued: specialFlags.is_discontinued,
      discontinuation_date: specialFlags.discontinuation_date,
      special_notes: specialFlags.special_notes,
      internal_notes: '',

      // Technical Specifications
      specifications: partialMetadata.specifications || {},
    };

    return completeMetadata;
  }

  // Utility functions
  private static normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')              // Normalize whitespace
      .replace(/[_\-]+/g, ' ')           // Convert underscores/hyphens to spaces
      .replace(/\([^)]*\)/g, '')         // Remove parenthetical notes
      .replace(/[^\w\s]/g, '')           // Remove special chars
      .trim();
  }

  private static getFileExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext || '';
  }

  private static parseDateByFormat(match: RegExpMatchArray, format: string): Date {
    switch (format) {
      case 'DD.MM.YYYY':
        const [_, day, month, year] = match;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return new Date(`${fullYear}-${month}-${day}`);

      case 'MM.YY':
        const [__, mm, yy] = match;
        return new Date(`20${yy}-${mm}-01`);

      case 'YYYYMMDD':
        const [___, yyyy, mm2, dd] = match;
        return new Date(`${yyyy}-${mm2}-${dd}`);

      case '(DD.MM.YYYY)':
        const [____, day2, month2, year2] = match;
        return new Date(`${year2}-${month2}-${day2}`);

      default:
        return new Date();
    }
  }

  private static parseExpiryDate(match: RegExpMatchArray): Date {
    // Implementation for parsing expiry dates
    if (match.length >= 4) {
      return new Date(`${match[3]}-${match[2]}-${match[1]}`);
    }
    return new Date();
  }

  private static detectLanguage(text: string): string {
    // Simple heuristic (can be improved with language detection library)
    const thaiChars = text.match(/[\u0E00-\u0E7F]/g);
    const chineseChars = text.match(/[\u4E00-\u9FFF]/g);
    const englishChars = text.match(/[a-zA-Z]/g);

    if (thaiChars && thaiChars.length > (text.length * 0.1)) return 'th';
    if (chineseChars && chineseChars.length > (text.length * 0.1)) return 'zh';
    return 'en';
  }

  private static containsTables(text: string): boolean {
    // Check for table-like patterns (multiple tabs/pipes in lines)
    const lines = text.split('\n');
    let tableLines = 0;

    for (const line of lines) {
      if (line.includes('\t\t') || line.match(/\|[^|]+\|[^|]+\|/)) {
        tableLines++;
      }
    }

    return tableLines > 3;
  }

  private static containsChemicalFormulas(text: string): boolean {
    // Check for chemical formula patterns (C10H20O, H2SO4, etc.)
    const chemicalPattern = /\b[A-Z][a-z]?\d+(?:[A-Z][a-z]?\d+)*\b/g;
    const matches = text.match(chemicalPattern);
    return matches !== null && matches.length > 5;
  }
}

/**
 * Enhanced Metadata Extractor Instance
 *
 * Provides a convenient interface for the enhanced document processor
 */
export const enhancedMetadataExtractor = {
  /**
   * Get enhanced metadata for a document
   * Wrapper that matches the expected interface in enhanced-document-processor
   */
  async getEnhancedMetadata(
    extractedText: string,
    filename: string,
    folderPath?: string
  ): Promise<any> {
    // Construct file path from folder path and filename
    const filePath = folderPath ? `${folderPath}/${filename}` : filename;

    try {
      // Use the MetadataExtractionPipeline to get enhanced metadata
      const metadata = await MetadataExtractionPipeline.getEnhancedMetadata(
        filePath,
        filename,
        extractedText,
        'mistral_ocr', // Default extraction method
        undefined // OCR confidence not provided
      );

      // Map the comprehensive metadata to the format expected by enhanced-document-processor
      return {
        supplierName: metadata.supplier_name,
        supplierNormalized: metadata.supplier_normalized,
        ingredientName: metadata.ingredient_name,
        ingredientNormalized: metadata.ingredient_normalized,
        ingredientInciName: metadata.ingredient_inci_name,
        ingredientCasNumber: metadata.ingredient_cas_number,
        ragDocumentType: metadata.document_type,
        documentSubtype: metadata.document_subtype,

        // Search optimization arrays
        keywords: metadata.keywords,
        casNumbers: metadata.cas_numbers,
        inciNames: metadata.inci_names,
        allergens: metadata.allergens,
        chemicalNames: metadata.chemical_names,
        productApplications: metadata.product_applications,
        functionCategories: metadata.function_categories,

        // Quality and validation
        qualityScore: metadata.quality_score,
        validationStatus: metadata.validation_status,

        // Additional metadata
        documentCategory: metadata.document_category,
        complianceTypes: metadata.compliance_types,
        language: metadata.language,
        hasImages: metadata.has_images,
        hasTables: metadata.has_tables,
        hasChemicalFormulas: metadata.has_chemical_formulas,
        wordCount: metadata.word_count,
        pageCount: metadata.page_count,
        textLength: metadata.text_length,
        tokenCount: metadata.token_count,
        processingDurationMs: metadata.processing_duration_ms,

        // Version and lifecycle
        versionDate: metadata.version_date,
        versionStatus: metadata.version_status,
        isDiscontinued: metadata.is_discontinued,

        // Specifications and technical data
        specifications: metadata.specifications
      };

    } catch (error) {
      console.error('Enhanced metadata extraction failed:', error);
      throw new Error(`Enhanced metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};