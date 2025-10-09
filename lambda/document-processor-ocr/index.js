const AWS = require('aws-sdk');
const { Pool } = require('pg');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Supported document formats for Mistral OCR
const SUPPORTED_FORMATS = {
  'application/pdf': {
    mimeType: 'application/pdf',
    extension: 'pdf',
    requiresOCR: true,
    supported: true,
  },
  'application/msword': {
    mimeType: 'application/msword',
    extension: 'doc',
    requiresOCR: true,
    supported: true,
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    requiresOCR: true,
    supported: true,
  },
  'text/plain': {
    mimeType: 'text/plain',
    extension: 'txt',
    requiresOCR: false,
    supported: true,
  },
  'text/markdown': {
    mimeType: 'text/markdown',
    extension: 'md',
    requiresOCR: false,
    supported: true,
  },
  'application/rtf': {
    mimeType: 'application/rtf',
    extension: 'rtf',
    requiresOCR: true,
    supported: true,
  },
  'image/jpeg': {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    requiresOCR: true,
    supported: true,
  },
  'image/png': {
    mimeType: 'image/png',
    extension: 'png',
    requiresOCR: true,
    supported: true,
  },
  'image/tiff': {
    mimeType: 'image/tiff',
    extension: 'tiff',
    requiresOCR: true,
    supported: true,
  }
};

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

// Detect document format from MIME type and filename
function detectFormat(mimeType, filename) {
  // First try MIME type
  if (SUPPORTED_FORMATS[mimeType]) {
    return SUPPORTED_FORMATS[mimeType];
  }

  // Fallback to file extension
  const extension = filename.split('.').pop()?.toLowerCase();
  const formatByExtension = Object.values(SUPPORTED_FORMATS)
    .find(format => format.extension === extension);

  if (formatByExtension) {
    return formatByExtension;
  }

  // Default for unknown formats
  return {
    mimeType: mimeType,
    extension: extension || 'unknown',
    requiresOCR: true,
    supported: false,
  };
}

// Clean and normalize extracted text
function cleanText(text) {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive line breaks
    .replace(/\n{3,}/g, '\n\n');
}

// Count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Extract text from plain text files
async function extractTextFromPlainText(bucket, key) {
  try {
    const response = await s3.getObject({
      Bucket: bucket,
      Key: key
    }).promise();

    const text = response.Body.toString('utf-8');
    const cleanedText = cleanText(text);

    return {
      extractedText: cleanedText,
      textLength: cleanedText.length,
      confidence: 1.0,
      method: 'native',
      pages: 1,
      wordCount: countWords(cleanedText),
      mistralMetadata: {
        format: 'txt',
        extractionMethod: 'native',
        hasImages: false,
        hasTables: false,
        language: 'en'
      }
    };
  } catch (error) {
    console.error('Error reading plain text file:', error);
    throw new Error(`Failed to read plain text file: ${error.message}`);
  }
}

// Extract text using Mistral OCR API
async function extractTextWithMistralOCR(bucket, key, format, filename) {
  try {
    // Get file content from S3
    const response = await s3.getObject({
      Bucket: bucket,
      Key: key
    }).promise();

    const fileContent = response.Body;

    // Convert file content to base64 for API transmission
    const base64Content = fileContent.toString('base64');

    // Format as data URL for Mistral API
    const mimeTypeForDataUrl = format.mimeType || `application/${format.extension}`;
    const dataUrl = `data:${mimeTypeForDataUrl};base64,${base64Content}`;

    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY environment variable is required');
    }

    console.log(`Calling Mistral OCR API for ${filename} (${format.extension})`);

    const mistralResponse = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: dataUrl
        },
        include_image_base64: false
      }),
      signal: AbortSignal.timeout(60000), // 60 seconds timeout
    });

    if (!mistralResponse.ok) {
      const errorText = await mistralResponse.text();
      throw new Error(`Mistral OCR API error: ${mistralResponse.status} ${mistralResponse.statusText} - ${errorText}`);
    }

    const apiResponse = await mistralResponse.json();

    // Extract text from pages array (official API format)
    let extractedText = '';
    if (apiResponse.pages && Array.isArray(apiResponse.pages)) {
      extractedText = apiResponse.pages
        .map(page => page.markdown || '')
        .join('\n\n');
    } else {
      // Fallback for different response format
      extractedText = apiResponse.text || '';
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text extracted from document');
    }

    // Clean the extracted text
    const cleanedText = cleanText(extractedText);

    return {
      extractedText: cleanedText,
      textLength: cleanedText.length,
      confidence: 0.95, // Mistral OCR typically has high confidence
      method: 'mistral_ocr',
      pages: apiResponse.pages?.length || 1,
      wordCount: countWords(cleanedText),
      mistralMetadata: {
        format: format.extension,
        extractionMethod: 'mistral_ocr',
        hasImages: false, // Could be enhanced with document analysis
        hasTables: false, // Could be enhanced with document analysis
        language: 'en', // Default, could be enhanced with language detection
        pageCount: apiResponse.pages?.length || 1
      }
    };
  } catch (error) {
    console.error('Mistral OCR error:', error);
    throw new Error(`Mistral OCR extraction failed: ${error.message}`);
  }
}

// Main text extraction orchestrator
async function extractText(bucket, key, fileType, filename) {
  const format = detectFormat(fileType, filename);

  if (!format.supported) {
    throw new Error(`Unsupported document format: ${fileType}`);
  }

  console.log(`Extracting text from ${format.extension} file: s3://${bucket}/${key}`);

  if (format.requiresOCR) {
    // Use Mistral OCR for complex formats
    return await extractTextWithMistralOCR(bucket, key, format, filename);
  } else {
    // Use native extraction for text formats
    return await extractTextFromPlainText(bucket, key);
  }
}

// Validate extracted text quality
function validateTextQuality(extractionResult) {
  const { extractedText, confidence, textLength } = extractionResult;

  const issues = [];

  // Check if text was extracted
  if (!extractedText || extractedText.trim().length === 0) {
    issues.push('No text was extracted from the document');
  }

  // Check minimum text length (at least 10 characters for meaningful content)
  if (textLength < 10) {
    issues.push('Extracted text is too short (less than 10 characters)');
  }

  // Check confidence score for OCR results
  if (extractionResult.method === 'mistral_ocr' && confidence < 0.7) {
    issues.push(`Low OCR confidence score: ${(confidence * 100).toFixed(1)}%`);
  }

  // Check for mostly garbled text (high ratio of non-alphanumeric characters)
  const alphanumericCount = (extractedText.match(/[a-zA-Z0-9]/g) || []).length;
  const alphanumericRatio = alphanumericCount / textLength;

  if (alphanumericRatio < 0.5) {
    issues.push('Text appears to be mostly garbled or corrupted');
  }

  return {
    isValid: issues.length === 0,
    issues,
    quality: {
      textLength,
      confidence,
      alphanumericRatio: alphanumericRatio * 100,
      estimatedWords: extractionResult.wordCount || extractedText.split(/\s+/).filter(word => word.length > 0).length
    }
  };
}

// Main Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('OCR processing event:', JSON.stringify(event, null, 2));

  const { executionId, documentId, s3Key, s3Bucket, fileType } = event;
  const executionArn = `arn:aws:states:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:execution:DocumentProcessingWorkflow:${executionId}`;

  try {
    // Update step status to RUNNING
    await updateProcessingStep(executionArn, 'OCRProcessing', 'RUNNING', 2, event);

    // Extract text from the document
    console.log(`Starting OCR processing for document ${documentId}`);
    const extractionResult = await extractText(s3Bucket, s3Key, fileType);

    // Validate text quality
    const qualityValidation = validateTextQuality(extractionResult);

    if (!qualityValidation.isValid) {
      console.warn('Text quality issues detected:', qualityValidation.issues);
    }

    // Prepare the result
    const ocrResult = {
      extractedText: extractionResult.extractedText,
      textLength: extractionResult.textLength,
      confidence: extractionResult.confidence,
      method: extractionResult.method,
      pages: extractionResult.pages,
      quality: qualityValidation.quality,
      qualityIssues: qualityValidation.issues,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      textract: extractionResult.textractMetadata || null
    };

    // Update step status to SUCCEEDED
    await updateProcessingStep(executionArn, 'OCRProcessing', 'SUCCEEDED', 2, event, ocrResult);

    console.log(`OCR processing completed successfully for document ${documentId}:`, {
      textLength: ocrResult.textLength,
      confidence: ocrResult.confidence,
      method: ocrResult.method,
      pages: ocrResult.pages
    });

    return ocrResult;

  } catch (error) {
    console.error('OCR processing error:', error);

    const errorDetails = {
      message: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime
    };

    // Update step status to FAILED
    try {
      await updateProcessingStep(executionArn, 'OCRProcessing', 'FAILED', 2, event, null, errorDetails);
    } catch (dbError) {
      console.error('Failed to update step status:', dbError);
    }

    throw error;
  }
};