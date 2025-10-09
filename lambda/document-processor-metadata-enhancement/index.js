const AWS = require('aws-sdk');
const { Pool } = require('pg');

// Initialize AWS services
const bedrock = new AWS.BedrockRuntime({
  region: process.env.BEDROCK_REGION || 'us-east-1'
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Update processing step status in database
async function updateProcessingStep(executionArn, stepName, status, stepOrder, inputData = null, outputData = null, errorDetails = null) {
  const query = `
    INSERT INTO processing_steps (execution_arn, step_name, step_order, status, input_data, output_data, error_details, started_at, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    ON CONFLICT (execution_arn, step_order)
    DO UPDATE SET
      status = $4,
      output_data = $6,
      error_details = $7,
      completed_at = $8
  `;

  const completedAt = status === 'SUCCEEDED' || status === 'FAILED' ? new Date() : null;

  await pool.query(query, [
    executionArn,
    stepName,
    stepOrder,
    status,
    inputData,
    outputData,
    errorDetails,
    completedAt
  ]);
}

// Document type classification patterns
const DOCUMENT_TYPE_PATTERNS = {
  'sds': [
    /safety\s+data\s+sheet/i,
    /^sds\b/i,
    /material\s+safety\s+data/i,
    /section\s+1.*identification/i,
    /ghs\s+classification/i
  ],
  'specification': [
    /technical\s+specification/i,
    /product\s+specification/i,
    /spec\s+sheet/i,
    /technical\s+data\s+sheet/i,
    /product\s+data\s+sheet/i
  ],
  'certificate_of_analysis': [
    /certificate\s+of\s+analysis/i,
    /^coa\b/i,
    /batch\s+analysis/i,
    /quality\s+control\s+certificate/i,
    /test\s+results/i
  ],
  'halal_certificate': [
    /halal\s+certificate/i,
    /islamic\s+certificate/i,
    /mui\s+certificate/i,
    /bpjph/i,
    /halal\s+certification/i
  ],
  'kosher_certificate': [
    /kosher\s+certificate/i,
    /kosher\s+certification/i,
    /kashrut/i,
    /orthodox\s+union/i
  ],
  'reach_registration': [
    /reach\s+registration/i,
    /reach\s+dossier/i,
    /echa\s+registration/i,
    /eu\s+reach/i
  ],
  'iso_certificate': [
    /iso\s+\d+/i,
    /iso\s+certificate/i,
    /quality\s+management\s+system/i,
    /international\s+organization\s+for\s+standardization/i
  ]
};

// CAS number pattern (XXX-XX-X or XXXXX-XX-X format)
const CAS_PATTERN = /\b\d{2,7}-\d{2}-\d\b/g;

// EC number pattern (XXX-XXX-X format)
const EC_PATTERN = /\b\d{3}-\d{3}-\d\b/g;

// INCI name patterns (typically uppercase chemical names)
const INCI_PATTERNS = [
  /\b[A-Z][A-Z\s]{3,}\b/g, // All caps words
  /\b[A-Z]+OL\b/g, // Common INCI suffixes
  /\b[A-Z]+ATE\b/g,
  /\b[A-Z]+IDE\b/g
];

// Compliance and certification keywords
const COMPLIANCE_KEYWORDS = {
  'REACH': ['reach', 'echa', 'svhc', 'candidate list'],
  'Halal': ['halal', 'islamic', 'mui', 'bpjph', 'shariah'],
  'Kosher': ['kosher', 'kashrut', 'orthodox union', 'ou', 'pareve'],
  'Vegan': ['vegan', 'plant-based', 'no animal ingredients'],
  'GMO-Free': ['gmo-free', 'non-gmo', 'genetically modified'],
  'ISO': ['iso 9001', 'iso 14001', 'iso 22000', 'iso 45001'],
  'FSSC22000': ['fssc22000', 'fssc 22000', 'food safety'],
  'HACCP': ['haccp', 'hazard analysis'],
  'GMP': ['gmp', 'good manufacturing practice']
};

// Product application categories
const APPLICATION_KEYWORDS = {
  'skincare': ['skincare', 'skin care', 'facial', 'moisturizer', 'cream', 'lotion'],
  'haircare': ['haircare', 'hair care', 'shampoo', 'conditioner', 'hair treatment'],
  'oral_care': ['oral care', 'toothpaste', 'mouthwash', 'dental'],
  'fragrance': ['fragrance', 'perfume', 'essential oil', 'aromatic'],
  'color_cosmetics': ['makeup', 'lipstick', 'foundation', 'eyeshadow', 'mascara'],
  'food': ['food grade', 'food additive', 'edible', 'nutritional'],
  'pharmaceutical': ['pharmaceutical', 'medicine', 'drug', 'therapeutic']
};

// Function categories
const FUNCTION_KEYWORDS = {
  'emulsifier': ['emulsifier', 'emulsifying', 'surfactant'],
  'preservative': ['preservative', 'antimicrobial', 'antioxidant'],
  'thickener': ['thickener', 'thickening', 'viscosity modifier'],
  'moisturizer': ['moisturizer', 'moisturizing', 'humectant'],
  'fragrance': ['fragrance', 'perfume', 'scent', 'aromatic'],
  'colorant': ['colorant', 'dye', 'pigment', 'coloring'],
  'active_ingredient': ['active ingredient', 'therapeutic', 'bioactive'],
  'solvent': ['solvent', 'carrier', 'diluent'],
  'ph_adjuster': ['ph adjuster', 'buffer', 'neutralizer']
};

// Extract CAS numbers from text
function extractCasNumbers(text) {
  const matches = text.match(CAS_PATTERN) || [];
  return [...new Set(matches)]; // Remove duplicates
}

// Extract EC numbers from text
function extractEcNumbers(text) {
  const matches = text.match(EC_PATTERN) || [];
  return [...new Set(matches)];
}

// Extract INCI names from text
function extractInciNames(text) {
  const inciNames = new Set();

  INCI_PATTERNS.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => {
      // Filter out common false positives
      const cleaned = match.trim();
      if (cleaned.length >= 4 && cleaned.length <= 50) {
        inciNames.add(cleaned);
      }
    });
  });

  return Array.from(inciNames);
}

// Classify document type based on content
function classifyDocumentType(text, filename) {
  const scores = {};

  // Check filename first
  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.includes('sds') || lowerFilename.includes('safety')) {
    scores['sds'] = (scores['sds'] || 0) + 0.3;
  }
  if (lowerFilename.includes('spec') || lowerFilename.includes('specification')) {
    scores['specification'] = (scores['specification'] || 0) + 0.3;
  }
  if (lowerFilename.includes('coa') || lowerFilename.includes('certificate')) {
    scores['certificate_of_analysis'] = (scores['certificate_of_analysis'] || 0) + 0.3;
  }

  // Check content patterns
  Object.entries(DOCUMENT_TYPE_PATTERNS).forEach(([type, patterns]) => {
    patterns.forEach(pattern => {
      if (pattern.test(text)) {
        scores[type] = (scores[type] || 0) + 0.2;
      }
    });
  });

  // Return the type with highest score, or 'other' if no clear match
  const bestMatch = Object.entries(scores).reduce((best, [type, score]) => {
    return score > (best[1] || 0) ? [type, score] : best;
  }, ['other', 0]);

  return bestMatch[1] > 0.3 ? bestMatch[0] : 'other';
}

// Extract compliance types from text
function extractComplianceTypes(text) {
  const compliance = [];

  Object.entries(COMPLIANCE_KEYWORDS).forEach(([type, keywords]) => {
    if (keywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
      compliance.push(type);
    }
  });

  return compliance;
}

// Extract product applications from text
function extractProductApplications(text) {
  const applications = [];

  Object.entries(APPLICATION_KEYWORDS).forEach(([app, keywords]) => {
    if (keywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
      applications.push(app);
    }
  });

  return applications;
}

// Extract function categories from text
function extractFunctionCategories(text) {
  const functions = [];

  Object.entries(FUNCTION_KEYWORDS).forEach(([func, keywords]) => {
    if (keywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
      functions.push(func);
    }
  });

  return functions;
}

// Extract keywords using simple frequency analysis
function extractKeywords(text, limit = 20) {
  // Simple keyword extraction based on word frequency
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && word.length < 20)
    .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'said', 'each', 'which', 'their', 'would', 'there', 'could', 'other'].includes(word));

  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([word]) => word);
}

// Create minimal metadata for fallback scenarios
function createMinimalMetadata(originalFilename, extractedText = '') {
  console.log('Creating minimal metadata as fallback');

  // Basic filename analysis
  const filenameLower = originalFilename.toLowerCase();

  // Guess document type from filename
  let documentType = 'other';
  if (filenameLower.includes('sds') || filenameLower.includes('safety')) {
    documentType = 'sds';
  } else if (filenameLower.includes('spec') || filenameLower.includes('datasheet')) {
    documentType = 'specification';
  } else if (filenameLower.includes('coa') || filenameLower.includes('analysis')) {
    documentType = 'certificate_of_analysis';
  } else if (filenameLower.includes('halal')) {
    documentType = 'halal_certificate';
  } else if (filenameLower.includes('kosher')) {
    documentType = 'kosher_certificate';
  }

  // Basic metadata structure
  const metadata = {
    // Entity extraction (minimal)
    casNumbers: [],
    ecNumbers: [],
    inciNames: [],

    // Classification (filename-based)
    ragDocumentType: documentType,
    complianceTypes: [],
    productApplications: [],
    functionCategories: [],

    // Keywords (basic from filename)
    keywords: originalFilename
      .toLowerCase()
      .replace(/\.(pdf|doc|docx|txt)$/i, '')
      .split(/[_\-\s]+/)
      .filter(word => word.length > 2),

    // Quality assessment (low for fallback)
    qualityScore: 25,
    qualityDimensions: {
      textLength: extractedText.length,
      entityExtraction: 0,
      classificationConfidence: documentType !== 'other' ? 40 : 10,
      complianceDetection: 0,
      keywordRichness: 10
    },

    // Processing metadata
    enhancementMethod: 'fallback_minimal',
    enhancedAt: new Date().toISOString(),

    // Initialize arrays
    chemicalNames: [],
    allergens: [],
    batchNumbers: [],
    lotNumbers: [],
    certificationBodies: [],
    supplierName: null,
    ingredientName: null
  };

  // If we have some text, try basic pattern matching
  if (extractedText && extractedText.length > 0) {
    // Try to extract CAS numbers using basic pattern
    const casMatches = extractedText.match(CAS_PATTERN);
    if (casMatches) {
      metadata.casNumbers = [...new Set(casMatches)].slice(0, 5); // Limit to 5
      metadata.qualityScore += 10;
    }

    // Try to extract EC numbers
    const ecMatches = extractedText.match(EC_PATTERN);
    if (ecMatches) {
      metadata.ecNumbers = [...new Set(ecMatches)].slice(0, 5);
      metadata.qualityScore += 5;
    }

    // Update quality dimensions
    metadata.qualityDimensions.entityExtraction = metadata.casNumbers.length + metadata.ecNumbers.length;
    metadata.qualityDimensions.textLength = extractedText.length;
  }

  console.log(`Minimal metadata created: type=${documentType}, score=${metadata.qualityScore}`);
  return metadata;
}

// Calculate quality score based on various factors
function calculateQualityScore(metadata, textLength, hasStructuredData) {
  let score = 50; // Base score

  // Text length score (longer documents generally have more info)
  if (textLength > 5000) score += 15;
  else if (textLength > 1000) score += 10;
  else if (textLength > 500) score += 5;

  // Structured data bonus
  if (hasStructuredData) score += 10;

  // CAS numbers found
  if (metadata.casNumbers && metadata.casNumbers.length > 0) score += 10;

  // INCI names found
  if (metadata.inciNames && metadata.inciNames.length > 0) score += 5;

  // Compliance information found
  if (metadata.complianceTypes && metadata.complianceTypes.length > 0) score += 10;

  // Document type classified (not 'other')
  if (metadata.ragDocumentType && metadata.ragDocumentType !== 'other') score += 5;

  // Keywords extracted
  if (metadata.keywords && metadata.keywords.length > 5) score += 5;

  return Math.min(100, Math.max(0, score));
}

// Enhance metadata using AI (optional - can be expensive)
async function enhanceMetadataWithAI(text, currentMetadata) {
  try {
    if (!process.env.BEDROCK_REGION || text.length < 100) {
      return null; // Skip AI enhancement for short texts or if Bedrock not configured
    }

    const prompt = `Analyze this document text and extract relevant metadata. Return JSON with the following fields:
- documentType: one of (sds, specification, certificate_of_analysis, halal_certificate, kosher_certificate, iso_certificate, other)
- supplierName: company/manufacturer name if mentioned
- ingredientName: primary ingredient/product name
- complianceTypes: array of compliance standards (REACH, Halal, Kosher, ISO, etc.)
- functionCategories: array of product functions (emulsifier, preservative, etc.)
- productApplications: array of applications (skincare, food, pharmaceutical, etc.)

Text: ${text.substring(0, 2000)}...

Return only valid JSON:`;

    const params = {
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    };

    const response = await bedrock.invokeModel(params).promise();
    const responseBody = JSON.parse(response.body.toString());

    if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
      try {
        const aiMetadata = JSON.parse(responseBody.content[0].text);
        return aiMetadata;
      } catch (parseError) {
        console.warn('Failed to parse AI metadata response:', parseError);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.warn('AI metadata enhancement failed:', error);
    return null;
  }
}

// Main metadata enhancement function
async function enhanceDocumentMetadata(documentId, extractedText, originalFilename, enableAI = false) {
  console.log(`Enhancing metadata for document ${documentId}`);

  // Basic metadata extraction
  const metadata = {
    // Entity extraction
    casNumbers: extractCasNumbers(extractedText),
    ecNumbers: extractEcNumbers(extractedText),
    inciNames: extractInciNames(extractedText),

    // Classification
    ragDocumentType: classifyDocumentType(extractedText, originalFilename),
    complianceTypes: extractComplianceTypes(extractedText),
    productApplications: extractProductApplications(extractedText),
    functionCategories: extractFunctionCategories(extractedText),

    // Keywords
    keywords: extractKeywords(extractedText),

    // Quality assessment
    qualityScore: 0, // Will be calculated below

    // Processing metadata
    enhancementMethod: 'rule_based',
    enhancedAt: new Date().toISOString(),

    // Initialize arrays
    chemicalNames: [],
    allergens: [],
    batchNumbers: [],
    lotNumbers: [],
    certificationBodies: []
  };

  // AI enhancement (optional)
  if (enableAI) {
    try {
      const aiMetadata = await enhanceMetadataWithAI(extractedText, metadata);
      if (aiMetadata) {
        // Merge AI results with rule-based results
        metadata.supplierName = aiMetadata.supplierName || null;
        metadata.ingredientName = aiMetadata.ingredientName || null;
        metadata.enhancementMethod = 'hybrid';

        // Merge arrays, keeping unique values
        if (aiMetadata.complianceTypes) {
          metadata.complianceTypes = [...new Set([...metadata.complianceTypes, ...aiMetadata.complianceTypes])];
        }
        if (aiMetadata.functionCategories) {
          metadata.functionCategories = [...new Set([...metadata.functionCategories, ...aiMetadata.functionCategories])];
        }
        if (aiMetadata.productApplications) {
          metadata.productApplications = [...new Set([...metadata.productApplications, ...aiMetadata.productApplications])];
        }
      }
    } catch (error) {
      console.warn('AI enhancement failed, continuing with rule-based results:', error);
    }
  }

  // Calculate quality score
  const hasStructuredData = metadata.casNumbers.length > 0 || metadata.inciNames.length > 0;
  metadata.qualityScore = calculateQualityScore(metadata, extractedText.length, hasStructuredData);

  // Quality dimensions for detailed analysis
  metadata.qualityDimensions = {
    textLength: extractedText.length,
    entityExtraction: metadata.casNumbers.length + metadata.inciNames.length + metadata.ecNumbers.length,
    classificationConfidence: metadata.ragDocumentType !== 'other' ? 80 : 20,
    complianceDetection: metadata.complianceTypes.length * 10,
    keywordRichness: Math.min(100, metadata.keywords.length * 5)
  };

  return metadata;
}

// Update document with enhanced metadata
async function updateDocumentMetadata(documentId, metadata) {
  const query = `
    UPDATE documents
    SET
      cas_numbers = $2,
      ec_numbers = $3,
      inci_names = $4,
      rag_document_type = $5,
      compliance_types = $6,
      product_applications = $7,
      function_categories = $8,
      keywords = $9,
      quality_score = $10,
      quality_dimensions = $11,
      chemical_names = $12,
      allergens = $13,
      batch_numbers = $14,
      lot_numbers = $15,
      certification_bodies = $16,
      supplier_name = $17,
      ingredient_name = $18,
      updated_at = NOW()
    WHERE id = $1
    RETURNING id, rag_document_type, quality_score
  `;

  const values = [
    documentId,
    JSON.stringify(metadata.casNumbers),
    JSON.stringify(metadata.ecNumbers),
    JSON.stringify(metadata.inciNames),
    metadata.ragDocumentType,
    JSON.stringify(metadata.complianceTypes),
    JSON.stringify(metadata.productApplications),
    JSON.stringify(metadata.functionCategories),
    JSON.stringify(metadata.keywords),
    metadata.qualityScore,
    JSON.stringify(metadata.qualityDimensions),
    JSON.stringify(metadata.chemicalNames),
    JSON.stringify(metadata.allergens),
    JSON.stringify(metadata.batchNumbers),
    JSON.stringify(metadata.lotNumbers),
    JSON.stringify(metadata.certificationBodies),
    metadata.supplierName,
    metadata.ingredientName
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

// Validate metadata extraction results
function validateMetadata(metadata) {
  const issues = [];

  // Check if any meaningful data was extracted
  const hasData = metadata.casNumbers.length > 0 ||
                  metadata.inciNames.length > 0 ||
                  metadata.complianceTypes.length > 0 ||
                  metadata.keywords.length > 5;

  if (!hasData) {
    issues.push('No significant metadata extracted from document');
  }

  // Check quality score
  if (metadata.qualityScore < 30) {
    issues.push('Low quality score indicates poor metadata extraction');
  }

  // Check for potentially invalid CAS numbers (basic format check)
  const invalidCas = metadata.casNumbers.filter(cas => {
    const parts = cas.split('-');
    return parts.length !== 3 || parts.some(part => isNaN(part));
  });

  if (invalidCas.length > 0) {
    issues.push(`Potentially invalid CAS numbers: ${invalidCas.join(', ')}`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    quality: {
      overallScore: metadata.qualityScore,
      entitiesFound: metadata.casNumbers.length + metadata.inciNames.length + metadata.ecNumbers.length,
      classificationConfidence: metadata.ragDocumentType !== 'other' ? 'high' : 'low',
      complianceDetected: metadata.complianceTypes.length
    }
  };
}

// Main Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Metadata enhancement event:', JSON.stringify(event, null, 2));

  const { executionId, documentId, extractedText, originalFilename, enableAI = false } = event;
  const executionArn = `arn:aws:states:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:execution:DocumentProcessingWorkflow:${executionId}`;

  try {
    // Update step status to RUNNING
    await updateProcessingStep(executionArn, 'MetadataEnhancement', 'RUNNING', 7, event);

    // Validate input
    if (!documentId || !extractedText || !originalFilename) {
      throw new Error('Document ID, extracted text, and filename are required');
    }

    console.log(`Starting metadata enhancement for document ${documentId}`);
    console.log(`Text length: ${extractedText.length} characters`);

    let metadata;
    let fallbackUsed = false;

    try {
      // Primary metadata enhancement attempt
      if (extractedText.length < 50) {
        console.warn('Text too short for full enhancement, using minimal metadata approach');
        metadata = createMinimalMetadata(originalFilename);
        fallbackUsed = true;
      } else {
        // Enhance document metadata
        metadata = await enhanceDocumentMetadata(documentId, extractedText, originalFilename, enableAI);
      }
    } catch (enhancementError) {
      console.warn('Primary metadata enhancement failed, using fallback approach:', enhancementError);
      metadata = createMinimalMetadata(originalFilename, extractedText);
      fallbackUsed = true;
    }

    // Validate extraction results
    const validation = validateMetadata(metadata);

    if (!validation.isValid) {
      console.warn('Metadata quality issues detected:', validation.issues);
    }

    // Update document in database
    const updateResult = await updateDocumentMetadata(documentId, metadata);

    // Prepare the result
    const result = {
      documentId,
      metadata,
      validation: validation.quality,
      qualityIssues: validation.issues,
      fallbackUsed,
      enhancementMethod: metadata.enhancementMethod,
      updateResult,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    // Update step status to SUCCEEDED
    await updateProcessingStep(executionArn, 'MetadataEnhancement', 'SUCCEEDED', 7, event, result);

    console.log(`Metadata enhancement completed successfully for document ${documentId}:`, {
      documentType: metadata.ragDocumentType,
      qualityScore: metadata.qualityScore,
      entitiesFound: metadata.casNumbers.length + metadata.inciNames.length + metadata.ecNumbers.length,
      complianceTypes: metadata.complianceTypes.length,
      keywords: metadata.keywords.length
    });

    return result;

  } catch (error) {
    console.error('Metadata enhancement error:', error);

    const errorDetails = {
      message: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime
    };

    // Update step status to FAILED
    try {
      await updateProcessingStep(executionArn, 'MetadataEnhancement', 'FAILED', 7, event, null, errorDetails);
    } catch (dbError) {
      console.error('Failed to update step status:', dbError);
    }

    throw error;
  }
};