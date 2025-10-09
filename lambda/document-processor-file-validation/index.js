const AWS = require('aws-sdk');
const { Pool } = require('pg');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Supported file types and their configurations
const SUPPORTED_FILE_TYPES = {
  'application/pdf': {
    extension: '.pdf',
    maxSize: 50 * 1024 * 1024, // 50MB
    requiresOCR: true,
    textractSupported: true
  },
  'image/jpeg': {
    extension: '.jpg',
    maxSize: 10 * 1024 * 1024, // 10MB
    requiresOCR: true,
    textractSupported: true
  },
  'image/png': {
    extension: '.png',
    maxSize: 10 * 1024 * 1024, // 10MB
    requiresOCR: true,
    textractSupported: true
  },
  'image/tiff': {
    extension: '.tiff',
    maxSize: 10 * 1024 * 1024, // 10MB
    requiresOCR: true,
    textractSupported: true
  },
  'text/plain': {
    extension: '.txt',
    maxSize: 5 * 1024 * 1024, // 5MB
    requiresOCR: false,
    textractSupported: false
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extension: '.docx',
    maxSize: 25 * 1024 * 1024, // 25MB
    requiresOCR: true,
    textractSupported: false
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

// Validate file exists and get metadata
async function validateFileExists(bucket, key) {
  try {
    const headResult = await s3.headObject({
      Bucket: bucket,
      Key: key
    }).promise();

    return {
      exists: true,
      size: headResult.ContentLength,
      contentType: headResult.ContentType,
      lastModified: headResult.LastModified,
      metadata: headResult.Metadata || {}
    };
  } catch (error) {
    if (error.code === 'NotFound') {
      return { exists: false };
    }
    throw error;
  }
}

// Detect file type from content and extension
function detectFileType(contentType, filename, fileSize) {
  // Get file extension
  const extension = filename.toLowerCase().split('.').pop();

  // Check if content type is supported
  if (SUPPORTED_FILE_TYPES[contentType]) {
    return {
      detectedType: contentType,
      config: SUPPORTED_FILE_TYPES[contentType],
      confidence: 'high'
    };
  }

  // Fallback to extension-based detection
  const typeByExtension = Object.entries(SUPPORTED_FILE_TYPES).find(
    ([type, config]) => config.extension === `.${extension}`
  );

  if (typeByExtension) {
    return {
      detectedType: typeByExtension[0],
      config: typeByExtension[1],
      confidence: 'medium'
    };
  }

  return {
    detectedType: 'unknown',
    config: null,
    confidence: 'low'
  };
}

// Perform virus scan (placeholder for integration with antivirus service)
async function performVirusScan(bucket, key) {
  // In a real implementation, this would integrate with AWS GuardDuty, ClamAV, or similar
  // For now, we'll do basic checks

  try {
    // Check file size (files over 100MB are suspicious for documents)
    const metadata = await validateFileExists(bucket, key);
    if (metadata.size > 100 * 1024 * 1024) {
      return {
        clean: false,
        reason: 'File size exceeds safe limits',
        scanTime: new Date()
      };
    }

    // Basic filename checks for suspicious patterns
    const suspiciousPatterns = [
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.scr$/i,
      /\.vbs$/i,
      /\.js$/i,
      /\.jar$/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(key));

    return {
      clean: !isSuspicious,
      reason: isSuspicious ? 'Suspicious file extension detected' : 'File appears clean',
      scanTime: new Date()
    };
  } catch (error) {
    console.error('Virus scan error:', error);
    return {
      clean: false,
      reason: 'Virus scan failed',
      scanTime: new Date(),
      error: error.message
    };
  }
}

// Main Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('File validation event:', JSON.stringify(event, null, 2));

  const { executionId, documentId, s3Key, s3Bucket, userId } = event;
  const executionArn = `arn:aws:states:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:execution:DocumentProcessingWorkflow:${executionId}`;

  try {
    // Update step status to RUNNING
    await updateProcessingStep(executionArn, 'FileValidation', 'RUNNING', 1, event);

    // Step 1: Validate file exists
    console.log(`Validating file existence: s3://${s3Bucket}/${s3Key}`);
    const fileMetadata = await validateFileExists(s3Bucket, s3Key);

    if (!fileMetadata.exists) {
      const error = { message: 'File not found in S3', bucket: s3Bucket, key: s3Key };
      await updateProcessingStep(executionArn, 'FileValidation', 'FAILED', 1, event, null, error);
      throw new Error('FILE_NOT_FOUND');
    }

    // Step 2: Detect and validate file type
    console.log(`Detecting file type for: ${s3Key}`);
    const fileTypeInfo = detectFileType(fileMetadata.contentType, s3Key, fileMetadata.size);

    if (!fileTypeInfo.config) {
      const error = {
        message: 'Unsupported file type',
        detectedType: fileTypeInfo.detectedType,
        contentType: fileMetadata.contentType
      };
      await updateProcessingStep(executionArn, 'FileValidation', 'FAILED', 1, event, null, error);
      throw new Error('UNSUPPORTED_FILE_TYPE');
    }

    // Step 3: Validate file size
    if (fileMetadata.size > fileTypeInfo.config.maxSize) {
      const error = {
        message: 'File size exceeds maximum allowed',
        fileSize: fileMetadata.size,
        maxSize: fileTypeInfo.config.maxSize
      };
      await updateProcessingStep(executionArn, 'FileValidation', 'FAILED', 1, event, null, error);
      throw new Error('FILE_TOO_LARGE');
    }

    // Step 4: Perform virus scan
    console.log(`Performing virus scan for: ${s3Key}`);
    const virusScanResult = await performVirusScan(s3Bucket, s3Key);

    if (!virusScanResult.clean) {
      const error = {
        message: 'File failed virus scan',
        reason: virusScanResult.reason
      };
      await updateProcessingStep(executionArn, 'FileValidation', 'FAILED', 1, event, null, error);
      throw new Error('VIRUS_SCAN_FAILED');
    }

    // Step 5: Prepare validation result
    const validationResult = {
      isValid: true,
      fileType: fileTypeInfo.detectedType,
      fileSize: fileMetadata.size,
      requiresOCR: fileTypeInfo.config.requiresOCR,
      textractSupported: fileTypeInfo.config.textractSupported,
      virusScanResult,
      metadata: fileMetadata.metadata,
      validationTime: new Date(),
      processingTimeMs: Date.now() - startTime
    };

    // Update step status to SUCCEEDED
    await updateProcessingStep(executionArn, 'FileValidation', 'SUCCEEDED', 1, event, validationResult);

    console.log('File validation completed successfully:', validationResult);

    return {
      isValid: true,
      fileType: fileTypeInfo.detectedType,
      fileSize: fileMetadata.size,
      requiresOCR: fileTypeInfo.config.requiresOCR,
      textractSupported: fileTypeInfo.config.textractSupported,
      processingTimeMs: Date.now() - startTime
    };

  } catch (error) {
    console.error('File validation error:', error);

    const errorDetails = {
      message: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime
    };

    // Update step status to FAILED if not already done
    try {
      await updateProcessingStep(executionArn, 'FileValidation', 'FAILED', 1, event, null, errorDetails);
    } catch (dbError) {
      console.error('Failed to update step status:', dbError);
    }

    throw error;
  }
};